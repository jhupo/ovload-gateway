# Operations and content API contracts

Status: normative target contract. These customer-aware content, authorization
and financial workflows are not implemented on the imported backend. Existing
management/operations endpoints and workers remain the adaptation base; their
presence does not establish the target routes below.
[ADR 0015](adr/0015-imported-backend-baseline.md) supersedes the removed
implementation and layout; see [API](API.md) for the actual HTTP surface. Register
target routers only with real repositories, authorization and worker adapters.
A queued job is not delivery or restore success. The browser security target
continues to follow [ADR 0013](adr/0013-product-workflow-boundaries.md).

## Shared rules

All lists have cursor pagination and limits 1-100. Management requests explicitly
target a tenant or require a platform grant. Writes require CSRF/Origin validation,
an audit reason, and numeric If-Match for edits. Creation and irreversible commands
require an Idempotency-Key. Versions and timestamps are durable UTC values.

## Content and configuration

`/api/admin/v1/announcements` provides GET/POST; `/{id}` provides GET/PATCH;
`/{id}/publish` and `/{id}/archive` are separate commands. Draft edits create a new
immutable content revision and do not remove an already published revision.
Customer GET `/api/v1/announcements` returns only published content applicable to
the current tenant; POST `/{id}/read` persists one owner-bound read marker.
HTML is sanitized by Ammonia before persistence.

`/api/admin/v1/settings/{domain}` provides GET/PATCH for typed website, navigation,
gateway and security policies. Unknown fields are rejected. Configuration history
is append-only, writes validate complete documents and use a revision precondition.
Secrets have separate write-only protected fields, never ordinary settings values.
GET `/api/v1/site` returns only the public website projection.
GET `/api/v1/navigation` returns the typed published navigation projection.
Management announcement detail/edit/publication explicitly select `tenant_id` as
a query parameter; an omitted value selects platform content and requires a
platform grant. Announcement create accepts `{tenant_id,content,reason}`, edits
accept `{content,reason}`, and publication/archive accept `{reason}`. Create and
publication/archive require an `Idempotency-Key`; edit and publication/archive
require quoted numeric `If-Match`. Read markers return `{read:true}` only after
their transaction commits. Settings PATCH accepts `{document,reason}`, where
`document` is the tagged `{domain,settings}` typed document and must match the URL.

Email templates use GET/POST `/api/admin/v1/email-templates`, locale and event,
explicit allowed variables and immutable revisions. SMTP settings require TLS and
encrypt authentication material. POST `/api/admin/v1/email-settings/test` returns
a durable bounded notification job. Identity challenge and transactional messages
use the same supervised mail worker, with independent typed sources and fenced
completion. Failed/unknown delivery never changes a payment or identity state.

## Finance and reads

POST `/api/admin/v1/users/{id}/balance-adjustments` records an explicit
credit/debit adjustment request and freezes its target and payload. POST
`/api/admin/v1/balance-adjustments/{id}/approve` or `/reject` is performed by a
different management principal with the separate approval grant. Approval locks
the wallet, protects active holds, posts one linked ledger fact and updates the
projection atomically. Replaying an approval cannot post another entry.
Adjustment requests accept `{tenant_id,direction,amount_usd,reason}` and an
`Idempotency-Key`. `direction` is `credit` or `debit`; `amount_usd` is a positive
decimal string using the existing nonnegative checked `Decimal` at scale 10 and
PostgreSQL `numeric(20,10)`. The currency is USD, with explicit currency/scale
metadata in money responses. Reject signed inputs, excess precision and overflow;
a debit cannot consume active holds or make available funds negative. This is
the customer ledger, separate from provider procurement USD costs. Retail usage
settlement rounds the complete exact charge once, half-even at
`0.0000000001 USD`, and reservation quotes/holds round upward; adjustments accept
an already exact ten-place amount and do not silently round input. See
[Billing and Pricing Design](BILLING_AND_PRICING_DESIGN.md).
GET `/api/admin/v1/balance-adjustments/{id}` reads a record with
an explicit `tenant_id` query. Approval/rejection accept `{reason}`, an explicit
tenant query and `Idempotency-Key`. Keys bind actor, command family and exact
canonical payload; receipts preserve the original response after later changes.

GET `/api/admin/v1/monitoring/summary`, `/monitoring/alerts` and `/audit-events`
use bounded time ranges and tenant/permission-aware queries. Unknown provider
health or missing usage is not synthesized as success or zero.

## External and protected jobs

Proxy, backup and diagnostic export commands persist typed intents. Their workers
hold bounded execution permits, use deadlines and fenced completion, and store
safe error codes. Proxy probes cannot access loopback, private, link-local or
metadata addresses unless an operator explicitly permits a network. Backup and
restore retain PostgreSQL/Redis infrastructure and never delete volumes or flush
Redis. Restore requires independent approval, backup integrity and a configured
isolated target. Payload and export reads require their own narrower permissions.
