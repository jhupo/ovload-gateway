# Routing, pricing, and billing read API

Status: normative target contract for customer-aware routing, retail pricing and
billing reads. The imported backend has existing management/routing behavior,
runtime snapshots and provider-cost budgets; it does not implement these
customer ownership, retail publication or wallet/subscription APIs.
[ADR 0015](adr/0015-imported-backend-baseline.md) supersedes the removed
implementation and source layout; [API](API.md) records the actual HTTP surface.

Customer routes require a customer
session; management routes require a separate management session and the named
permission. Browser writes use the shared CSRF check. Bodies reject unknown fields.
All IDs are opaque strings; tenant/account/group/channel IDs are UUIDs. Amounts
are canonical decimal strings with `currency: "USD"` and `scale: 10`, using the
existing checked nonnegative `Decimal` and PostgreSQL `numeric(20,10)`. Retail
rates use USD decimal strings at that precision with an explicit denominator.
Reject overflow, excess precision and negative amounts. Sum exact retail
components and apply the multiplier before one half-even settlement rounding at
`0.0000000001 USD`; quotes and holds round upward to that unit. Provider USD cost
remains a separate internal fact, and native non-USD procurement evidence keeps
its currency. Missing usage or procurement evidence is null. The canonical rules
are in [Billing and Pricing Design](BILLING_AND_PRICING_DESIGN.md).

Configuration commands require a quoted numeric `If-Match`. Inventory creates
use `"0"`; updates use the resource's current revision. Routing draft creation
and publication compare the current active tenant routing revision (zero before
the first publication); pricing draft creation/publication compare the active
platform price revision. Stale conditions return 412. Lists use bounded stable
ID cursors (`limit` 1..100, default 50). Illegal transitions return 409; invalid
contracts return 422, missing records 404, unavailable storage 503.

## Inventory

`routing.configuration.read` permits GET list/detail under `/api/admin/v1` for
`/providers`, `/accounts`, `/groups`, and `/channels`. Provider/account inventory
is platform scoped; group/channel requests require `tenant_id`. Secret values
and opaque secret references are excluded from ordinary account reads.

`routing.configuration.write` permits POST collection and PATCH detail. PATCH
replaces the complete typed editable resource. DELETE detail disables inventory
without erasing published history. Every mutation carries a nonempty `reason`
and commits an audit fact with the change.

- Provider: `provider_id`, `name`, `state`, and an immutable endpoint/profile
  contract (`endpoint_revision`, `profile_revision`, `authority_contract_id`,
  `endpoint_path_id`, protocol, unary stream, byte/time limits). Only compiled
  executable provider contracts may be registered. An update creates a fresh
  contract revision; an existing contract cannot be changed.
- Account: `provider_id`, `name`, `secret_ref`, `concurrency_limit`, optional
  requests/minute and principal concurrency limits. Provisioning creates a
  credential principal/version, quota owner and direct egress profile atomically.
  `secret_ref` refers to an independently provisioned operator secret file; this
  API never accepts plaintext credentials. PATCH changes the name and concurrency
  limit only. POST `/accounts/{id}/suspend` and `/resume` accept `reason` and
  enforce legal state transitions. DELETE permanently disables the account.
- Group: `tenant_id`, `name`, visibility, state, multiplier basis points and
  optional RPM/concurrency limits. User overrides remain separate identity policy.
- Channel: `tenant_id`, name, state and a typed route definition: group, public
  model, route order, account/provider/model binding, client/target protocol and
  stream, converter/revision/loss fields, endpoint/profile revisions, and reviewed
  input/context token bounds. Channels own no prices.

## Publication

POST `/api/admin/v1/configuration-revisions` snapshots a nonempty bounded set of
`channel_ids` for `tenant_id` and a published `price_revision`. GET collection and
detail read revisions. POST `/{revision}/validate` checks duplicate route keys,
executable protocol/converter combinations, provider/account/principal/quota/egress
eligibility and complete referenced retail cards. POST `/{revision}/publish`
requires `routing.configuration.publish`, revalidates under locks, and atomically
publishes the draft, active pointer and audit. In-flight
operations retain their pinned revisions. No routing request can supply prices.
POST `/api/admin/v1/routes/preview` accepts tenant, group, public model and client
protocol and returns active route metadata and current eligibility without dispatch.

POST `/api/admin/v1/pricing/revisions` accepts complete typed `cards` and `reason`.
A card declares public model, optional tenant/group override, service tier, context
and time selectors and exactly twelve billable/free dimension rows. Only the
executable unbanded `default`/`all` selectors are accepted; unsupported selectors
fail closed. Each row declares dimension, denominator, USD decimal-string rate,
and applicability. Group overrides replace complete cards. GET collection/detail
reads books. POST `/{revision}/validate` returns field errors; POST
`/{revision}/preview` accepts tenant, group, user, model, sample usage and service
tier and returns exact component charges and effective group/user multiplier.
POST `/{revision}/publish` requires `routing.configuration.publish` and commits
the immutable checksum, active pointer and audit together. Pricing
does not mutate a previously published routing revision.

## Customer Projections

- GET `/api/v1/models`: published public-group model/protocol capabilities.
- GET `/api/v1/channel-status`: aggregate public-model eligibility without account IDs.
- GET `/api/v1/billing/balance`: settled, held and available wallet amounts.
- GET `/api/v1/subscriptions/allowances`: owned entitlement/window allowance,
  settled, held, available, boundaries and state.
- GET `/api/v1/usage` and `/{operation_id}`: owner-scoped requested model, usage,
  frozen price revision, reservation state and monetary facts. Procurement and
  provider account information are excluded.
- GET `/api/v1/dashboard/summary`: owned operation counts and canonical customer
  charges for an explicit UTC range (maximum 31 days).

Management GET `/api/admin/v1/usage` and detail and `/billing/reconciliation` use
`billing.records.read`; `/operations`, operation detail and
`/operations/{operation_id}/attempts` use `operations.monitoring.read`. All require
an explicit tenant scope and bounded cursor. GET `/dashboard/summary` uses
`operations.monitoring.read`, tenant and explicit UTC range; monetary totals also
require `billing.records.read`. Procurement amounts appear only on finance reads
as a distinct native-currency fact and are never combined with customer charge.
No read exposes request/response payloads, provider errors or credentials.

## Persistence Boundary

The target application authorizes before repository access. PostgreSQL predicates enforce
tenant and customer ownership. A transaction serializes publication on the tenant
or platform pointer row. Published historical records remain immutable. New
customer inventory/pricing records require appended migrations after imported
migration 0033; preserve existing migration checksums and never destroy financial
or management history during downgrade or recovery. Integrate verified ownership
and retail revisions into the existing runtime snapshot compiler and publication
path. Frozen snapshots may carry configuration and prices; balances, active holds,
latest settled charge history and settlement remain PostgreSQL authority, never
process-local cache authority.
