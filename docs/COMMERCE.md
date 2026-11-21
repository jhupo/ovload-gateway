# Commerce

## Current execution billing

Model execution freezes gateway model prices and group pricing at admission.
Group model-price overrides take precedence; otherwise the gateway's standard
model price is multiplied by the group multiplier (including its peak schedule).
The existing provider metering pipeline supplies exact USD charges, including
retried attempts, to `ClientBudgetPort`. No guessed token counts are billed.

The PostgreSQL budget store persists customer charges synchronously before
releasing request admission. A supervised retry queue retains charges when the
database is temporarily unavailable, as with existing key budgets. This queue
is in memory; an abrupt process failure during a database outage still requires
reconciliation from request observations. Missing provider usage remains unknown
rather than being fabricated into a charge.

Each request ID is charged once. An active subscription that can cover the whole
charge within **all** its daily, weekly and monthly limits is selected in expiry
order. Otherwise the whole charge is debited from the tenant's USD wallet.
Subscription-funded usage never debits the wallet as well. Tenant wallet row
locks serialize all funds decisions, including concurrent requests on different
keys. Per-key cost limits remain an independent admission policy.

Admission requires available subscription quota or a positive available wallet
balance. This is not an upper-bound precharge: if concurrent admitted requests
produce more usage than remaining funds, the exact unpaid amount is persisted
as payable usage. Further requests are denied. Later credits clear payable
usage at transaction commit, after the credit receipt snapshot has been checked;
other wallet debits cannot bypass that debt. Never silently discard charges or
allow negative wallet balances. Late receipts crossing quota periods go to the
wallet, rather than consuming a new period's quota.

## Subscriptions and redemption

- Published plans can be bought with wallet funds or assigned by an administrator.
  Assignments and subscription codes freeze the plan at issuance; editing or
  unpublishing the catalog cannot rewrite existing entitlements.
- Daily quotas reset at the plan's local reset time. Weekly periods are anchored
  to subscription start; monthly periods use its calendar anniversary, clamped
  to the month's last day. UTC and Asia/Shanghai are supported.
- Resetting quotas advances a generation, preserving historical usage. Revocation
  prevents new funding; existing reserved operations retain their original facts.
- Random 128-bit redemption codes support wallet balance, concurrency, subscription
  and registration invitation benefits. Expiry, disabling, global use limits and
  per-user limits are enforced in the same transaction as the benefit.
- Invitation codes are consumed by registration and can authorize registration
  when public signup is closed. Email-domain and consent rules still apply.
- Customer reads are scoped to the current user and omit internal plan notes,
  administrative code inventories and other customers' records.

## API and persistence

`GET /api/{admin/}v1/engagement/commerce` returns real plans, subscriptions,
redemptions and orders. `POST /api/{admin/}v1/engagement` accepts
`{"op":"commerce","key":"unique-command-key","command":{...}}`.
Commands are defined by `CommerceCommand`; mutations require session authority,
CSRF, appropriate management permissions and optimistic revisions where relevant.
A repeated command key returns the original result; a different payload with the
same key is rejected. Financial evidence is append-only.

Payment order records retain their original CNY amounts and fees. Wallet plan
purchases are separate USD orders; recharge revenue statistics exclude those
internal wallet transfers. The frontend presents the actual order currency.

Migrations 0060–0065 add commerce, subscription reservation funding, group
platform constraints, execution charges, combined usage reads and credit debt
settlement. The older retail reservation API remains available for its explicit
callers and shares subscription usage accounting, but is not the execution path.

## Verification

Run `tests/deploy/commerce_setup.py` only on the authorized test server to create
an isolated database, Redis and gateway on port 19444. `commerce_verify.py`
checks real APIs, concurrent redemption, wallet purchase, authority, quota
fallback, duplicate settlement and debt recovery. `commerce_extras.py` covers
platform compatibility, proxy filters and invitation registration.
`commerce_ui.cjs` checks desktop/mobile layout and screenshots. Verification
accounts are isolated; never run these scripts against the normal database.
