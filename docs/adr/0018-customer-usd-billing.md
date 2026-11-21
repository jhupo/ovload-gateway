# ADR 0018: Customer USD billing boundary

Status: accepted for the first retail billing implementation. Tenant balance and
operator credit APIs are implemented. Execution charging is not enabled until
durable reservation and authoritative settlement are wired.

## Decision

Customer retail billing is a separate application capability from provider
procurement-cost metering and the existing per-key provider-cost budget. Retail
rates are selected by requested public model and a complete group override,
then frozen with the operation. A provider mapping, account, failover candidate,
or upstream price never changes the customer tariff.

The first implementation uses the immutable tenant USD wallet already bound to
each model key. The wallet balance is a projection of an append-only ledger;
it is never adjusted without an idempotent ledger event. Subscription billing,
automatic source fallback, CNY payments, and recharge orders are separate future
flows and are not alternate paths in this implementation. An audited,
idempotent management credit is the initial funding operation; it records an
operator, reason, tenant, amount, and idempotency key in the same transaction as
the credit.

Every admitted logical operation freezes one retail price revision, selected
rate card, integer multiplier, billable bounds, routing identity, and operation
ID. PostgreSQL atomically reserves `max(2 * latest positive settled customer
charge for the same tenant/key/group/requested model/tier, conservative current
quote)`. A first request therefore reserves its quote. Retries share the same
reservation. Store errors at the reserve or dispatch-intent boundary stop the
request before polling the cold provider stream.

The durable operation records each attempt's dispatch intent before its first
provider-stream poll. A reservation is released only when durable evidence
proves every attempt was not sent and the operation is atomically closed to
future attempts. Timeout, disconnect, task drop, or process restart is not such
evidence. Complete authoritative usage settles one immutable receipt and one
wallet debit; unknown usage or dispatch retains the hold and creates a durable
reconciliation case. Corrections append linked entries rather than editing
financial history.

The first enabled capability set is limited to requests for which the gateway
can quote and enforce every billable dimension across all frozen route
candidates and request transformations. Unpriced or unbounded models, image,
audio, search/tool calls, continuations, and protocol conversions remain
ineligible until their bounds, provider usage completeness, and settlement
contracts are implemented. A tokenizer estimate, request byte count, provider
cost estimate, missing usage field, or customer-supplied limit is not a billing
proof. Rejected capabilities fail before provider dispatch.

Customer and operator balance/usage reads are tenant-scoped. Management price
publication and wallet credit use the live `billing.manage` permission and
append-only audit evidence. Customer reads never expose provider account,
credential, or procurement-cost data. Published price revisions and receipts
are immutable.

## Consequences

Use the existing fixed-point USD `Decimal`; do not add credits, floating-point
money, or a second provider-cost pricing path. Price calculation, precharge,
wallet settlement, and ledger idempotency belong to the billing domain; SQLx
transactions belong to the Store adapter; HTTP handlers translate typed service
results; providers report evidence and do not select customer rates or charge
accounts.

Retail APIs and pages are implemented only with real PostgreSQL-backed callers.
Frontend preview balances and the imported provider pricing controls are not
financial evidence. Customer funds remain unavailable for execution until a
published price card, valid quote bound, durable wallet credit, and complete
settlement path are all present.

See [Billing and Pricing Design](../BILLING_AND_PRICING_DESIGN.md) for the exact
rate units, rounding, admission, recovery, schema, and API contracts.
