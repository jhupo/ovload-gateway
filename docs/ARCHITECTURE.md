# Ovload Gateway Architecture

Status: current modular-monolith architecture. [ADR 0015](adr/0015-imported-backend-baseline.md),
[Backend Structure](BACKEND_STRUCTURE.md), [Backend Runtime](BACKEND_RUNTIME.md),
and [API](API.md) describe executable behavior. The target sections below define
accepted product contracts, not additional working capabilities.

## Boundary rules

The Rust workspace is organized as a ports-and-adapters modular monolith. Core
owns protocol-neutral execution and typed domain values; application crates own
use cases and authorization; Store owns PostgreSQL transactions, idempotency and
audit; API translates HTTP/SSE/WebSocket contracts; provider crates own only
provider capability, credential and wire translation. Providers are registered
through explicit capability types and a registry, so an unsupported operation is
rejected by the owning adapter instead of falling through a shared string branch.

The React application follows the same direction. `web/src/api/contracts` owns
transport DTOs, `web/src/api` owns HTTP and session ports, feature modules own
queries and forms, and shared components own layout primitives. API modules do
not import stores, React components or feature types. Tables use the single
`DataTableFrame` shell for toolbar, scroll viewport, state rendering and
pagination. Commerce commands and queries cross a typed application port and are
committed with their transaction and audit record.

Migrations in this workspace are direct migrations: old wrappers, duplicate
table shells, preview transport loops and string-encoded commerce page commands
are removed once their callers move. There is no compatibility facade or second
implementation path.

The current backend includes Codex/Grok Build and a distinct standard Responses
API provider, Responses HTTP/SSE and WebSocket execution, directional Chat
Completions conversion, independent customer/operator sessions, control-plane APIs,
observations, executable plugins, and upstream USD cost budgets. It is one Rust
workspace with twelve packages, assembled as a modular monolith. Provider
directories named `openai` and `xai` do not establish their public API products.
The standard Responses product is explicitly registered as `openai_api`; see
[ADR 0027](adr/0027-standard-api-and-chat-conversion.md).

The provider boundary is split at the Rust crate level. `providers/openai` owns
Codex OAuth, Desktop/CLI identity, WebSocket transport and Codex-specific
credential services. `providers/xai` owns the Grok OAuth transport. The
`providers/http` crate owns the shared HTTP upstream runtime (credential
loading, account scheduling, catalog caching, metering, pricing and stream
execution) and its explicit adapters for `openai_api`, Claude, Gemini and
`xai_api`. Native Claude/Gemini translation lives below that runtime and is
selected through the typed `ProviderAdapter`; it is not registered from the
OpenAI crate. Composition is performed once in
`apps/src/bootstrap/startup.rs`. The Core identity module is the only backend
source for built-in account platforms, provider adapter slugs and their
account-filter aliases.

Independent customer tenants/sessions, scoped management grants, verifier-only
model keys, tenant wallet reads, audited operator credits and immutable retail
price management are implemented in the boundaries documented by [API](API.md).
Platform-only pricing commands seal, validate, preview, publish and retire
complete documents through a PostgreSQL catalog. Request precharge, settlement,
and commerce remain execution-integration gaps. Internal financial transactions,
tenant operation reads and expiry reconciliation are implemented separately;
the user selected funds-only implementation without automatic request charging.
Neither publication nor those internal commands activate execution charging.
Customer authentication, profile, sessions, model keys, USD wallet, dashboard
and usage screens use real customer APIs. Operator user pages use live
management permissions. The extra online permission and registration-policy
configuration APIs are removed; live authorization and customer isolation remain
as defined in [ADR 0029](adr/0029-retire-online-permission-configuration.md).
Registration/login policy, consent, email lifecycle and customer OAuth are now
implemented as live identity capabilities under
[ADR 0031](adr/0031-registration-login-and-consent.md).
Basic site identity and authenticated owner avatars have independent backend
settings, transactional audits and managed image storage, as defined in
[ADR 0030](adr/0030-site-and-personal-settings.md). Website settings connects
basic site identity and logo controls to these APIs. Personal avatar frontend
integration remains pending.
Upstream account, channel-group and retail-price screens
also use live APIs; their contracts are [upstream accounts](UPSTREAM_ACCOUNTS_API.md),
[channel groups](CHANNEL_GROUPS_API.md), and [retail pricing](RETAIL_PRICING_API.md).
Group model mappings constrain both catalogs and actual execution plans. Provider
credentials are encrypted by Store as defined in [ADR 0026](adr/0026-upstream-credential-storage.md).
Other commerce/settings screens retain explicitly
marked preview behavior. Customers are independent accounts, not organizations;
tenant_id is an internal isolation key, as decided in
[ADR 0024](adr/0024-independent-customers.md).

Commerce is an explicit application boundary. `CommerceService` accepts typed
`CommerceQuery` and `CommerceCommand` values through the narrow
`CommerceStore` port; the PostgreSQL adapter owns one transaction for the
query or command, including authorization locks, idempotency receipts, wallet
ledger changes and audit events. Site metadata and non-commerce engagement
workflows stay in `SiteSettingsService`; they do not serialize commerce page
identifiers or route commerce commands through site settings.
Customer finances use USD at ten decimal places. Online
update retains replacement/restart/rollback behavior; restart may interrupt
connections and zero downtime is not required. Project release packaging and
updater identity still require adaptation.

## Goals and scope
Build a multi-provider AI gateway as a Rust modular monolith.
Administrative and user interfaces share the React/shadcn-admin design system.
Required product coverage includes OpenAI/Codex, Anthropic Claude, Google Gemini,
xAI Grok, and Chinese model services including DeepSeek, Qwen, Doubao, GLM, Kimi,
MiniMax, ERNIE, and Hunyuan. Provider families are peers in the architecture.
One complete forwarding/diagnostics/billing slice validates the shared engine;
it does not define the supported-provider scope of the finished product.
See [Multi-provider Support](MULTI_PROVIDER_SUPPORT.md) for the normative coverage,
native protocol contracts, billing differences, and per-provider acceptance gates.
See [Multi-user Identity and Request Admission](ADMISSION_AND_TENANCY.md) for
tenant/user/API-key identity, capacity scopes, rate windows, spend limits, and the
frontend capability map.
See [Product Domain and API Design](PRODUCT_DOMAIN_DESIGN.md) for product-domain
aggregates, application ownership, management permissions, customer and
management resources, and commerce/rewards/content workflows.
See [Billing and Pricing Design](BILLING_AND_PRICING_DESIGN.md) for the canonical
retail price book, double-last-charge precharge, atomic reservation, and settlement.
Only the current surface documented in API.md is executable. Broader product
contracts must not be advertised as working integrations.

## Current request lifecycle

The API authenticates durable model-key/customer authority and prepares an execution envelope.
Core creates an execution session from a pinned runtime snapshot, resolves the
route, and coordinates account attempts through `AccountScheduler` ports.
Provider-specific schedulers acquire typed account leases; the coordinator
validates their immutable account binding before dispatch. Dispatch cannot
select another account or retry independently. Account-bound transports send
the request. Pure Chat converters and provider adapters have separate owners:
the former map client protocol semantics, the latter authenticate and handle
native upstream payloads. `AttemptCoordinator` owns deadlines, cancellation,
retry and downstream commit decisions; usage
finalization currently records provider cost, not customer retail settlement.
See [Backend Runtime](BACKEND_RUNTIME.md) for actual ownership and lifetimes.

## Target request lifecycle

The following sequence adds verified customer identity, atomic multi-scope
admission, explicit conversion, and durable financial evidence to that engine.
The component names describe target responsibilities, not extra implemented
packages or a second execution framework.

Client → Tower middleware → authenticate and resolve tenant/user/API key →
bounded inbound decode → route/policy snapshot and capability validation →
directional conversion preflight → executor selects candidate → atomic initial
operation/customer-RPM/provider-quota/attempt admission → billing reservation and dispatch intent →
attempt context → provider adapter rewrite → account-bound transport → upstream.
Retries retain the operation lease and customer RPM count while acquiring only
new attempt capacity and any locally enforced provider quota for the next
attempt. Responses return through
the provider adapter, then through the matching directional response converter
when one was selected, and finally through the client protocol response adapter.
Conversion and provider wire rewriting are separate contracts; see [ADR 0011](adr/0011-protocol-conversion-and-provider-rewriting.md)
and the complete [Protocol Conversion and Provider Adapter Design](PROTOCOL_PROVIDER_ADAPTERS.md),
which defines the directional matrix, rewrite boundary, stream behavior, and
acceptance gates.

| Component | Responsibility |
| --- | --- |
| Middleware | Authentication, verified tenant/user/key context, request size, tracing, coarse rate limiting |
| `AdmissionCoordinator` (application) | Effective policy and all-or-none first-attempt operation/customer-RPM/provider-quota/attempt bundle; attempt-only capacity and quota reservation on retries; billing reservation handoff and typed rejection reasons |
| `RequestExecutor` (application) | Operation identity and frozen route plan; attempt orchestration, replay decision, deadline/cancellation use of runtime, execution certainty |
| `AccountScheduler` (application + infrastructure ports) | Live account eligibility, shared provider-quota ownership/reservation, atomic attempt-capacity leases and attempted-account exclusion; never sends requests |
| Provider | Authentication parameters, capabilities, requests, events, errors, quota parsing |
| Transport | Proxy routing, TLS, HTTP/2, SSE, WebSocket, bounded streams, connection pools |
| Billing | Pricing version, observed usage, idempotent ledger; aggregates may be eventually consistent |

## Target adapter boundaries

These contracts guide provider and conversion additions. The current supported
surface remains the one documented in API.md; an enum or port does not establish
implementation of every combination below.

1. Protocol definitions: Responses, Chat Completions, Messages, and
   Generate Content. These are vendor-neutral boundary shapes; a route and its
   adapter select one value.
2. Provider adapters identify concrete upstream products: OpenAI API, Codex OAuth,
   Anthropic API, Google Gemini API, Google Vertex AI, xAI API, and Chinese model
   services. Antigravity and Grok Web are separate endpoint/authentication contracts
   when explicitly integrated. Gemini is a model family, not a protocol; it can
   be served by Google Gemini API or Vertex AI independently of Antigravity.
   A model family can be hosted by multiple providers without sharing accounts,
   continuation state, prices, or capability declarations.
3. Connection transports: HTTP and WebSocket. HTTP server-sent events are a
   stream mode, not a separate connection transport.
4. Inbound and response adapters: decode/encode the declared client protocol
   and keep native payloads intact. A directional converter is used only when
   the selected provider's boundary protocol differs and an exact source/target
   converter is registered.
5. Transport adapters: standard Rust networking; specialized implementations
   only when justified by concrete protocol requirements and capture evidence.

Keep native payloads using typed variants and explicit preservation of provider
extensions. Do not flatten every request into Chat Completions. `Protocol` is
the only protocol vocabulary in core: the inbound route, decoded
`InboundRequest`, converted `ProviderRequest`, and response each carry a
protocol value. The Antigravity adapter may translate that value to its
authenticated private wire format; that mapping is not a core protocol or a
provider-independent request field. `ProtocolConverter` owns vendor-neutral
semantic conversion between one declared source and one declared target
protocol. Conversion is directional: a Responses-to-Messages converter does
not imply a Messages-to-Responses converter. Select one exact converter pair;
do not infer transitivity or chain converters. Each converter declares
supported operations, tools, content parts, reasoning controls, stream modes,
usage/error mappings, and any semantic loss. Reject unsupported required
semantics before dispatch with a structured error. Preserve source and final
request evidence and the selected converter revision.

After conversion, the concrete infrastructure adapter runs its internal,
typed `rewrite_request` step for private endpoint serialization and documented
body/header/query changes. This is not a core `ProviderAdapter` trait method;
private wire types stay in infrastructure. Rewriting cannot select a
provider/account, change the client protocol, silently remove unsupported
semantics, choose a retry, or change billing. The adapter resolves the already
selected account's credentials at send/dial time; secret values never enter
immutable request snapshots or diagnostic evidence. Provider responses and
events are parsed back into their declared boundary protocol before a response
converter maps them to the client. Provider-specific errors, extensions, and
usage evidence remain available to diagnostics and accounting.

### Protocol and request flow

1. The entrypoint binds a route to one `Protocol` value. The route name is an
   HTTP concern; it does not select a provider.
2. The inbound adapter validates headers and decodes the body into an
   `InboundRequest { protocol, model, shape, operation, tools, compression, body }`.
   The request keeps the protocol that was actually received.
3. The application maps the customer model alias to concrete provider/model/
   deployment candidates, then filters candidates by protocol, conversion,
   operation and requested feature compatibility. It binds each surviving
   candidate to its exact converter implementation and revision or to native
   passthrough. Provider selection never mutates the inbound protocol.
4. The application freezes an immutable operation plan with ordered, compatible
   provider candidate plans, route/retry policy, settlement basis, and all
   candidate contract revisions. The operation plan does not contain a selected
   account or mutable account health/quota state.
5. For each permitted attempt, `RequestExecutor` selects a candidate allowed by
   that plan and applies its pinned converter to the request, or preserves the
   native request unchanged. Reject missing or unsupported conversions before
   acquiring an account lease.
6. `AccountScheduler` checks current entitlement, revocation, quota, health,
   concurrency, region and egress policy, then atomically acquires attempt
   capacity and any locally enforced provider-quota reservation.
   It returns a `ScheduledAccount`; the executor combines it with the frozen
   operation and candidate to create a new `AttemptContext` with one mandatory
   `AccountId`, principal reference/revision and lease fence.
7. The selected concrete adapter applies its infrastructure-local typed rewrite
   to the converted boundary request and frozen endpoint binding. It resolves
   credentials for the account already bound to this attempt at send/dial time.
   Private serialization never becomes a `Protocol` variant. Every terminal
   attempt path releases its lease exactly once.
8. The adapter parses the upstream exchange into the provider boundary protocol
   and returns a typed exchange envelope with a unary, SSE, or WebSocket body.
   When conversion was used, the matching directional response conversion maps
   the provider protocol back to the client's protocol. The outbound adapter
   then applies the negotiated `StreamMode` over the selected transport. SSE
   and WebSocket exchanges remain incremental and are never buffered into one
   unbounded response body.

Client and provider exchange shapes are separate fields in the operation and
each provider candidate's exchange plan. The first forwarding slice admits
only matching shapes. Protocol conversion
does not imply a unary/SSE/WebSocket bridge, and a WebSocket route additionally
requires a bounded inbound client-session contract.

No universal conversion among every pair is implied by the four protocol enum
values. Only implemented and tested directional pairs are selectable. The
[multi-provider design](MULTI_PROVIDER_SUPPORT.md) tracks target provider/protocol
coverage. The current API provides Codex Responses HTTP/SSE and WebSocket,
Grok Build, the standard Responses product and explicit text/function-tool
Chat Completions conversion. See [API](API.md) for the actual surface and
unsupported operations. Additional directional converters require complete
implementation and evidence before they become selectable.

### Capability planes

The target portable contract keeps protocol identity separate from orthogonal
execution concerns; these proposed types do not describe additional implemented
capabilities:

| Plane | Core vocabulary | Responsibility |
| --- | --- | --- |
| Wire protocol | `Protocol` | Request and response shape: Responses, Chat Completions, Messages, or Generate Content |
| Connection | `ConnectionTransport` | HTTP or WebSocket connection |
| Stream | `StreamMode` and `FrameFormat` | Unary JSON, HTTP SSE, or bidirectional WebSocket messages |
| Keepalive | `KeepalivePolicy` | SSE comments/data or WebSocket ping/pong that carry no semantic output |
| Content coding | `CompressionSelection` and `CompressionSupport` | Direction-specific identity, gzip, Brotli, deflate or zstd |
| Operation | `OperationKind` | Generation, search, token counting, compaction, media and live operations |
| Tools | `ToolCapability` | Function, custom, namespace, search, code execution and image tools |

Provider capabilities are declared as complete `ProviderCapability` variants,
not independent arrays. A variant binds every plane that must work together;
selection rejects unsupported combinations before an adapter is called. Search,
compression and keepalive therefore remain capabilities of an operation or
transport, not new `Protocol` variants.

`ProviderExchange` preserves the body shape in the portable contract: unary responses return
a `ProtocolResponse`, SSE uses a pull-based event stream, and WebSocket uses a
bidirectional session with explicit send, receive and close operations. The target
adapter returns typed native usage with its response. Streaming adapters and
converters must define complete SSE metadata, terminal completion/usage contracts
and client-session ownership. Pulling one event at a time gives runtime
cancellation and backpressure a clear owner. Keepalive events are represented
separately from semantic frames and are never included in usage accounting.

Internal error categories: invalid_request, authentication, quota_exhausted,
rate_limited, overloaded, transport, unsupported_capability, unknown_execution.
Classify using HTTP status, stream events, and provider codes together.
Not every HTTP 429 means an exhausted account quota.

## Async runtime and task model
Use Rust async/await and Tokio's multi-thread runtime for asynchronous concurrency.
Tokio tasks provide coroutine-like execution: pending asynchronous I/O yields to
the runtime so worker threads can serve other tasks. A request does not require
a dedicated OS thread. Tasks are cooperatively scheduled; blocking calls or long
CPU loops must not run on runtime workers.

Axum/Tower handles inbound requests on this runtime. The imported HTTP/SSE and
WebSocket paths use asynchronous I/O; bounded incremental buffers and
end-to-end backpressure remain required for changes to these paths.
Bound active operations, queued work, and upstream connections explicitly; cheap
tasks do not justify unlimited spawning or buffering.

The executor owns each operation's deadline, cancellation, and child tasks.
Client disconnects cancel associated upstream work and release local resources;
cancellation does not prove that an upstream operation was never executed.
Providers must not detach work, select accounts, or introduce independent retries.
The target scheduler owns eligible account selection and account/provider-principal
attempt leases; target `AdmissionCoordinator` owns user-facing operation admission.
The imported chain's actual ownership is documented in Backend Runtime; see
[Multi-user Identity and Request Admission](ADMISSION_AND_TENANCY.md) for the
target scopes and lease lifetime.

Background tasks need an explicit owner, observed completion/errors, resource
limits, and a shutdown policy. Shutdown stops admission, allows a bounded drain,
then cancels remaining asynchronous work and waits for cleanup.
Isolate unavoidable blocking I/O with spawn_blocking and bound submitted work.
CPU-heavy work needs a bounded blocking or dedicated compute pool. Already-running
spawn_blocking closures cannot be forcibly aborted; their cooperative cancellation
and shutdown behavior must be designed explicitly.

Do not reuse timeout values, lease intervals, quote implementation claims, or
financial recovery workers from the removed backend. Current configuration and
execution owners define imported runtime limits. Retail reservation and durable
reconciliation must be implemented against
[Billing and Pricing](BILLING_AND_PRICING_DESIGN.md); current process-local usage
finalization does not establish those financial guarantees.

## Target state and concurrency
Separate operations from attempts. Each operation has a finite total retry budget.
Providers do not nest retry loops.
Use shared concurrency leases with fencing tokens, renewal, and idempotent release.
When upstream execution is uncertain, mark unknown_execution and consult the
operation's explicit replay policy.
The replay barrier is the first committed downstream response head, accepted
semantic output, or accepted bidirectional session state. Do not transparently
replay on another account after any of those events. A disconnect, timeout,
cancellation, or empty response does not prove that the upstream did not execute.
Propagate cancellation to child operations.
Scope session, response, tool-call, and turn state to tenants and credential principals.
Without a stable session identifier, treat requests independently; never merge
users by IP address or similar prompts.
PostgreSQL owns durable configuration and ledgers; Redis owns expiring leases and caches.
If shared admission control is unavailable, reject new constrained operations;
do not silently bypass global concurrency limits.

## Target identity and egress
Application profiles and egress snapshots have distinct field ownership.
Operations pin an immutable pair of snapshots.
Application profile: client family, UA, originator, version rules, installation identity.
Egress: account proxy or fixed direct route, observed region, IANA timezone,
transport configuration generation.
Record unknown when timezone evidence is insufficient. Region does not uniquely
determine language; locale is independently configured.
Actual connections determine the visible IP. Do not spoof Forwarded or X-Forwarded-For.
Pool isolation includes credential principal, destination, proxy generation,
and transport generation.
Matching languages or dependencies does not prove identical network fingerprints.
Specialized transports require pinned dependencies and capture regression tests.
Do not fabricate telemetry, device attestations, or hardware signatures.
Unverified theories about upstream risk controls must not become requirements.

## Modules and dependencies

The actual layout and dependency graph are specified in
[Backend Structure](BACKEND_STRUCTURE.md) and ADR 0015. `src/apps` assembles
concrete Bundles; `api` translates inputs; `admin` owns control-plane use cases
and ports; `core` owns portable execution; `store` implements persistence;
`host` provides process/network adapters and workers; `protocol` owns pure wire
contracts; provider crates implement native products. Plugin SDK, runtime, and
packaging CLI are separate compile-time boundaries. The frontend remains in `web/`.

Core and protocol have no production dependency on other local crates. API
depends on admin/core/protocol contracts rather than concrete Store, Host, or
provider implementations. Providers do not issue SQL. Only the application
composes concrete adapters; dependencies never point back to it. A module named
`runtime` inside Core publishes snapshots; it is not another Tokio runtime or
standalone process.

Use private state, invariant-enforcing constructors, typed identities and errors,
and existing traits for real variation. Avoid parallel execution frameworks,
forwarding interfaces, generic CRUD layers, or empty abstraction folders. See
[Backend Development](BACKEND_DEVELOPMENT.md) for implementation and review rules.

## APIs and operations
Current control-plane routes use `/api/v1`, `/api/admin/v1`, and `/api/admin`;
model APIs keep their documented protocol paths. `/healthz` aggregates dependency
and worker health; there is no `/readyz`. See [API.md](API.md) for methods,
response shapes, authentication, and unavailable APIs.

Customer and management identity sessions and model credentials have separate
policies. The imported `/api/auth` and `/api/key-usage` surfaces are removed.
Browser clients belong in `web/src/api/`; generate types from OpenAPI when available.
Logs contain necessary redacted metadata; credentials, request bodies, and opaque
upstream state are excluded by default.

## Delivery phases

1. Imported workspace, native execution, control-plane APIs, plugins, and cost
   budgets form the imported baseline.
2. Introduce verified customer/management identities, tenant ownership, scoped
   grants, verifier-only model keys, and isolation through HTTP/SSE/WS execution,
   usage reads, revocation, continuation, and plugin callbacks.
3. Retail USD price management, internal atomic funds transactions, history and
   expiry reconciliation are implemented. Verify a provider's enforced usage
   bounds/complete evidence before connecting those commands to model execution.
4. Required native provider coverage: OpenAI/Codex, Claude, Gemini, Grok, and
   Chinese model services; each passes its own auth, streaming, usage, and failure
   contracts through the shared executor. No family is implied by another one's
   implementation or by an OpenAI-compatible base URL.
5. Explicit protocol conversions, provider-bound continuation and
   multimodal operations, enabled only as their capability combinations pass.
6. Commerce and scoped user/admin workflows replace corresponding sample stores.
7. Adapt release identity, artifact layout, Docker, and updater as one contract;
   verify egress, load/failure/recovery, and release gates. Provider
   availability is published per verified contract, not per unchecked catalog row.

## Deployment and schema ownership
The imported process serves configured frontend assets and Rust HTTP routes.
Store startup applies embedded SQLx migrations before opening the listener;
the old worker/migrate/schema-revert process commands are absent. Preserve the
33 imported migration files and append future migrations. Never downgrade the
schema or delete persistent data to recover an application release.

PostgreSQL, Redis, and Caddy remain independent services with persistent volumes;
an application upgrade replaces only the gateway. ADR 0015 supersedes ADR 0012's
blue/green and zero-downtime requirements. The imported updater verifies/stages
artifacts, replaces the binary, restarts, and supports rollback, with connection
interruption allowed. Its project identity and archive layout still need to agree
with Docker and release packaging. Retained scaffold assets do not prove this
integration works. See [Deployment](DEPLOYMENT.md), [Database](DATABASE.md), and
[Releasing](RELEASING.md).

## Public authentication entry

The root route uses the static shadcn-admin authentication layout. The single
login form submits one identifier and password to the public identity endpoint.
The backend resolves the identifier against customer email and management
username records, returns the authoritative session audience, and issues the
matching audience cookie. The frontend then loads the returned profile and live
management permissions before navigating to the corresponding workspace.
Customer and management APIs remain separate after login so tenant isolation and
operator permissions are enforced at every request. There is no user-facing
session listing, manual revocation or manual rotation; current-session
authentication, sign-out and internal security invalidation remain.

ADR 0010 describes the superseded development-only login preview. Arbitrary
credentials and tab markers no longer authorize workspaces. The customer dashboard
reads actual wallet, scoped usage summaries and UTC trends. It never invents
successful authentication, requests or customer charges.
The `/monitoring` preview replaces the template Tasks route and presents
request diagnostics, simulated active requests and throughput, and system snapshots.
Its sample data does not advertise real telemetry APIs or operational controls.
See [DEVELOPMENT.md](DEVELOPMENT.md#frontend-data-boundaries) for data behavior and ownership.
Account actions are available only from the header menu.
