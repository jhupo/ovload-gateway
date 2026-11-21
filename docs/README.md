# Documentation

Start with the contract for the flow being changed. Source and mirrored tests
define executable behavior; accepted target documents define work still to be
implemented. A frontend preview, provider directory name, or architecture diagram
does not establish a working product capability.

## Current implementation and development

| Document | Owns |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Current baseline, target boundaries, product scope, and delivery order |
| [Backend structure](BACKEND_STRUCTURE.md) | Actual workspace packages, source ownership, and dependency graph |
| [Backend runtime](BACKEND_RUNTIME.md) | Current execution, task lifecycle, streams, and updater behavior |
| [Backend development](BACKEND_DEVELOPMENT.md) | Encapsulation, ports, transactions, execution, and review guidance |
| [API](API.md) | Imported resource surface, implemented identity slice, and remaining customer API gaps |
| [Upstream accounts](UPSTREAM_ACCOUNTS_API.md) | Live account directory, authorization, credentials and account-bound egress |
| [Standard API provider](STANDARD_API_PROVIDER.md) | Distinct API-key Responses adapter, catalog, egress and product limits |
| [Chat Completions](CHAT_COMPLETIONS_API.md) | Explicit text/function-tool Responses conversion, JSON/SSE and rejected semantics |
| [Channel groups](CHANNEL_GROUPS_API.md) | Resource groups, model mappings, access and frozen execution policy |
| [Retail pricing](RETAIL_PRICING_API.md) | Live immutable price workspace and authorized effective USD rates |
| [Plugins](PLUGINS.md) | SDK/runtime/Host boundaries, trust, packaging, and UI integration status |
| [Frontend design](FRONTEND_DESIGN.md) | React/shadcn-admin composition, shared layout, controls, feedback, and data presentation |
| [Development](DEVELOPMENT.md) | Local setup, actual CLI/configuration, checks, and preview behavior |
| [Database](DATABASE.md) | Migration ownership, frozen history, upgrades, backups, and recovery |
| [Deployment](DEPLOYMENT.md) | Accepted deployment boundary and imported-backend packaging gaps |
| [Releasing](RELEASING.md) | Version preparation, tag publication contract, and readiness limits |
| [CI and security](CI_SECURITY.md) | Required checks, permissions, and release gates |
| [Documentation maintenance](DOCUMENTATION.md) | Document ownership, status, and references |

## Accepted product targets

The [identity refactor plan](IDENTITY_REFACTOR_PLAN.md) records the implemented
session/provisioning slice and orders the remaining ownership/data cutover.
[API](API.md) owns the exact executable route inventory.

These documents remain design contracts where the current API and
[imported baseline decision](adr/0015-imported-backend-baseline.md) identify gaps.
They must not be used as evidence that a target route or workflow is implemented.

| Concern | Contract |
| --- | --- |
| Customer identity, permissions, and admission | [Identity API](IDENTITY_API.md), [admission and tenancy](ADMISSION_AND_TENANCY.md) |
| USD price books, reservation, settlement, and reconciliation | [Billing and pricing](BILLING_AND_PRICING_DESIGN.md) |
| Business aggregates and control-plane ownership | [Product domain](PRODUCT_DOMAIN_DESIGN.md) |
| Native products, conversion, and provider rewriting | [Provider coverage](MULTI_PROVIDER_SUPPORT.md), [adapter design](PROTOCOL_PROVIDER_ADAPTERS.md) |
| Routing and management operations | [Routing API](ROUTING_API.md), [operations API](OPERATIONS_API.md) |
| Subscriptions, payments, rewards, and content | [Commerce API](COMMERCE_API.md) |
| Request evidence and diagnostic access | [Request diagnostics](REQUEST_DIAGNOSTICS.md) |
| Broad framework and client identity design | [Gateway framework](GATEWAY_FRAMEWORK.md), [Codex protocol and identity](CODEX_PROTOCOL_AND_IDENTITY.md) |

Customer money uses USD at ten decimal places. The imported per-key upstream-cost
budgets do not own customer funds. The implemented tenant wallet balance and
operator credit APIs and [retail price management](API.md#retail-price-management)
are documented in [API](API.md#tenant-usd-wallets); request
precharge and settlement are not connected to execution. Online upgrades retain
replacement/restart/rollback semantics; zero downtime is not required. These
accepted choices in ADR 0015 supersede older OVL and blue/green requirements.

## Decisions and evidence

[ADRs](adr/) explain accepted boundary decisions. Later decisions explicitly
supersede conflicting earlier ones; ADR 0015 is the current backend baseline.
[ADR 0016](adr/0016-identity-session-authority.md) defines durable identity session
authority, explicit owner bootstrap and the CSRF/rotation boundary.
[ADR 0017](adr/0017-model-key-authority.md) defines verifier-only model credentials,
explicit imported-key assignment and live execution authority.
[ADR 0018](adr/0018-customer-usd-billing.md) defines the tenant USD wallet,
independent retail price book, precharge, settlement evidence and first-slice
capability gate.
[ADR 0019](adr/0019-retail-price-publication.md) defines sealed complete retail
documents, sample previews and atomic immediate catalog publication.
[ADR 0020](adr/0020-retail-funds-transactions.md) defines internal funds
transactions, tenant operation history and expiry reconciliation before
automatic model-request charging is activated.
[ADR 0027](adr/0027-standard-api-and-chat-conversion.md) defines executor-owned
account scheduling, the standard API product and the directional Chat boundary.
[ADR 0028](adr/0028-managed-http-outbound-policy.md) defines managed HTTP policy,
the explicit WebSocket boundary and strict standard-API usage evidence.
[ADR 0029](adr/0029-retire-online-permission-configuration.md) removes online
permission and registration-policy configuration while retaining live
authorization, and removes the duplicate customer-operation reason input.
[ADR 0030](adr/0030-site-and-personal-settings.md) defines independent site
identity, owner-scoped avatars and bounded managed images. Their
[backend APIs](API.md#basic-site-and-personal-settings) are separate from
identity lifecycle and authentication policy in
[ADR 0031](adr/0031-registration-login-and-consent.md). Payment remains
unimplemented.
[Historical reports](../reports/README.md) are research evidence, not current
implementation requirements. [Test documentation](../tests/README.md) describes
suite ownership; a documented check is not a claim that it has run.

Maintain current behavior in its owning guide. Keep enduring rationale in an
ADR and release changes in [CHANGELOG.md](../CHANGELOG.md), rather than turning
ordinary guides into chronological work logs.
