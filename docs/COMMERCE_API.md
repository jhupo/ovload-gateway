# Commerce and Rewards API

Status: normative target contract for the full commerce boundary. Operator USD
funding, the wallet ledger, referral attribution/settlement/transfers and lottery
draws/awards are implemented through the current [API contract](API.md#engagement-execution).
Payment adapters, orders, refunds and fulfillment remain incomplete. The
per-key USD provider-cost budget is separate from the customer wallet. See
[Billing and Pricing Design](BILLING_AND_PRICING_DESIGN.md) for the USD money,
retail pricing, reservation and settlement authority.

The commerce boundary owns immutable published catalog revisions, single-use
quotes, orders, independent payment/refund attempts, payment evidence, and
fulfillment. Rewards own code claims, attribution, commissions, withdrawals,
enrollments and recorded draws. Wallet mutations must use the single append-only
customer `ledger_entries` defined by the billing target contract; commerce does
not introduce a second wallet balance or ledger. Provider-cost records stay
separate from customer USD grants and charges.

All customer resources resolve tenant and user from the customer session. All
management commands require `billing.records.read`, `billing.catalog.write`,
`billing.catalog.publish`, `billing.adjustment.request`,
`billing.adjustment.approve`, `billing.refund.request`,
`billing.refund.approve`, `billing.payout.confirm`, or `rewards.manage` as named
by the command. Financial requester and approver must differ. Commands require
an `Idempotency-Key` (1..128 ASCII identifier characters); conflicting reuse is
409. Catalog and campaign writes require a numeric `If-Match` revision.
Lists accept an opaque resource ID cursor and a limit of 1..100 (default 50),
and sort by immutable resource ID. An absent cursor starts the first page.

USD grants, allowances, rewards and ledger amounts cross HTTP as canonical
decimal strings with `currency: "USD"` and `scale: 10`. They use the imported
nonnegative checked `Decimal` (`u128` scaled by `10^10`) and PostgreSQL
`numeric(20,10)`, with explicit credit/debit ledger direction. No internal credit
currency or USD-to-credit conversion exists. CNY principal, fee, payable and
refund fields name their `fen` unit and use integer strings; `100 fen = 1 CNY`.
No binary floating-point amount or exchange rate is accepted.

The quote freezes a positive `cny_per_usd` decimal-string rate, with at most ten
fractional digits, its source/revision and expiry. Its direction is always CNY
per one USD. For a recharge principal excluding fees:

```text
exact_base_grant_usd = (principal_fen / 100) / cny_per_usd
base_grant_scaled = floor(exact_base_grant_usd * 10,000,000,000)
base_grant_usd = Decimal::from_scaled(base_grant_scaled)
```

Use checked exact integer/rational intermediates. Bonus terms are frozen and
their resulting USD grant also rounds down to `0.0000000001 USD`; CNY fees round
up to a whole fen. Reject overflow, excess precision and invalid/zero rates
rather than truncating input or changing the quoted direction. A quote freezes
the complete published offer, rate, fee, bonus, eligibility and fulfillment
terms. Quotes expire after at most 15 minutes and orders retain the frozen
expiry and all conversion facts. Browser redirects never settle orders.

## Customer Resources

- `GET /api/v1/catalog/subscription-plans` and
  `GET /api/v1/catalog/recharge-offers`: published validated revisions.
- `GET /api/v1/payment-methods`: only server-configured ready providers.
- `POST /api/v1/quotes`: `{offer_id, principal_fen?}` creates an immutable quote.
- `POST /api/v1/orders`: `{quote_id}` atomically consumes one quote.
- `GET /api/v1/orders` and `GET /api/v1/orders/{id}`: owner-scoped records.
- `POST /api/v1/orders/{id}/payment-attempts`: `{provider_id}` durably records
  intent before calling the provider. Unknown attempts block new checkout.
- `GET /api/v1/subscriptions`: immutable entitlement snapshots.
- `POST /api/v1/redemption-claims`: `{code}` claims and grants in one transaction.
- `GET /api/v1/redemptions`, `GET /api/v1/referral`,
  `GET /api/v1/referral/commissions`, `POST /api/v1/referral/withdrawals`.
- `GET /api/v1/lottery/campaigns`,
  `POST /api/v1/lottery/campaigns/{id}/enrollments`, and
  `GET /api/v1/lottery/enrollments/{id}`. Public enrollment requires an enabled
  server-side challenge verifier and an unexpired single-use challenge proof.

## Management Resources

Catalog resources under `/api/admin/v1/subscription-plans` and
`/api/admin/v1/recharge-offers` have list/create/read/update/publish commands.
Published revisions are immutable; edits create another draft revision.
Subscription assignments are requested and separately approved; approval creates
one entitlement snapshot and its quota window in the same transaction.
Orders have permissioned list, refund request/approve, and reconciliation
commands. Payment and refund uncertainty remains observable and can only advance
from verified provider evidence. Manual payment-success commands do not exist.

Redemption batches have create/read/publish/revoke and bounded code issuance.
Issuance stores code verifiers only. An encrypted expiring issuance artifact is
downloadable once after fresh management authorization; the response is
`Cache-Control: no-store`. Download consumption and audit commit before bytes
leave the server. Lost downloads require explicit reissuance of unclaimed codes.
Referral campaigns have revisioned create/update/publish/close commands;
attribution freezes terms, commission qualification follows a durable qualifying
event, reversals append compensating facts, and withdrawals reserve available
commission before separate approval and verified payout.
Lottery campaigns have create/open/close/draw commands. Draw records freeze the
participant set, SHA-256 seed commitment, algorithm version, revealed seed,
winners, and grant identities before crediting. Repeating a draw returns the
same result. No enrollment is allowed after the set is frozen.
The management draw response includes `participant_manifest_base64`, the exact
UTF-8 JSON bytes hashed by `participant_digest` (SHA-256, standard Base64).
The manifest preserves enrollment IDs, tenant/user bindings and eligibility
timestamps. The digest, precommitted seed and recorded algorithm reproduce the
winner enrollment IDs. Management authorization protects this identity-bearing
proof; customer enrollment reads expose only the customer's own enrollment.

Withdrawal payout attempts enter `processing` only. The manual external-transfer
workflow marks `paid` after a different authorized principal confirms structured
provider/evidence references and the execution timestamp. This adapter does not
dispatch automated payouts. Withdrawal allocations and payout facts form an
append-only commission subledger, with each external provider reference unique.
Refund reversal reserves no new withdrawal; an already dispatched or paid
commission opens collection reconciliation. A partial order refund fully reverses
its referral commission. Subscription refunds cancel the remaining entitlement;
wallet recharge refunds debit the cumulative proportional original USD grant,
rounded down to `0.0000000001 USD`, less prior refund debits. The proportion uses
cumulative refunded CNY principal over the original principal; a full principal
refund reverses the full applicable grant. Fees and bonuses follow the frozen
order refund policy. Each refund binds the original order/payment attempt and
provider CNY-fen amount. It never uses a new exchange rate or rewrites original
payment, grant or usage evidence.

## Provider and Failure Boundary

Payment adapters accept server-provisioned credentials only. Alipay RSA2 requests
and callbacks bind the configured application/seller, merchant reference, exact
CNY amount and provider transaction. WeChat Pay API v3 is enabled only when its
merchant key, platform verification key/serial and API-v3 decryption key are
configured. Callback signatures and event identity are checked before a durable
acknowledgment; duplicates acknowledge the original event, contradictions retain
both evidence records and open reconciliation. Callback bodies are bounded to
64 KiB; provider requests have a 15-second deadline and bounded responses.

Provider calls occur outside transactions. Timeout/disconnect/ambiguous parsing
after possible dispatch records `unknown`, keeps the existing merchant reference,
and requires a signed provider query. A verified success accepted within the
frozen order window can fulfill even when delivered late. Acceptance after the
window enters reconciliation. Refund evidence appends a compensating debit;
insufficient spendable wallet balance opens collection reconciliation rather than
deleting historical usage. Provider failures and configuration errors return safe
machine codes. Ordinary responses exclude signatures, provider raw errors,
credentials, code verifiers and encrypted artifact keys.

Alipay query responses omit `seller_id`; the verified response is bound to the
merchant's authenticated request and the exact requested `out_trade_no`.
Callbacks require an explicit matching `seller_id`. Provider merchant, application
and sandbox identity become immutable after the first payment intent. Credential
changes require no unresolved payment attempts. Disabled methods remain available
for evidence verification and refunds. An unpaid query without a provider
transaction identifier retains that absence; it never invents a transaction.

Adapter wire formats follow the primary [Alipay trade query contract](https://developer.alibaba.com/docs/api.htm?apiId=757&docType=4)
and [WeChat Pay signature verification contract](https://pay.wechatpay.cn/doc/v3/merchant/4012365352).
