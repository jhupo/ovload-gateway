# ADR 0008: Naming and abstraction boundaries

Status: accepted

Date: 2026-09-21

## Decision

Define contracts before concrete adapters. Rust has no classes, so the project uses
these corresponding forms:

| Concept | Rust form | Naming | Example |
| --- | --- | --- | --- |
| Domain value | `struct` / `enum` | noun | `TenantId`, `RetryPolicy`, `JobState` |
| Behavior contract | `trait` | capability or role | `ProtocolConverter`, `ProviderAdapter`, `JobRepository` |
| Application workflow | `struct` | noun + `Executor`/`Coordinator` | `RequestExecutor`, `OperationCoordinator` |
| Infrastructure implementation | `struct` | concrete technology + role | `PostgresJobRepository`, `RedisLeaseRepository` |
| Inbound boundary | module/function | protocol + action | `responses::handle`, `health::router` |
| Pure transformation | function/module | verb + object | `classify_error`, `parse_usage` |
| Configuration | `struct` | scope + `Config` | `RuntimeConfig`, `WorkerConfig` |
| Error | `enum` / `struct` | scope + `Error` | `CoreError`, `StorageError` |

`Manager`, `Helper`, `Util`, `Common`, `Misc`, and technology-free `Service` are
not default names. They may be used only when the type has a precise lifecycle or
coordination responsibility documented by its callers. A file name follows the
public concept (`identity.rs`, `execution.rs`, `provider.rs`), not an incidental
implementation (`helpers.rs`, `misc.rs`).

Protocol names describe a boundary wire shape and never identify a provider.
Core therefore exposes one `Protocol` enum, not separate inbound and upstream
protocol enums. The route declaration, decoded `InboundRequest`, any explicit
converted request, and `ProtocolResponse` all carry that same vocabulary.
Provider identity is a separate `ProviderId`; a provider adapter may translate
the boundary request to a private wire format without adding that format to
core. Gemini is a model family, not a protocol. Google Gemini API, Google Vertex
AI, and Antigravity identify different concrete provider contracts that may serve
that family. `ProviderId` remains a portable identifier, not a closed model-vendor
enum. HTTP and WebSocket are connection
transports; `ServerSentEvents` is a stream mode over HTTP. Keepalive, content
coding, operation kind and tool capabilities are separate core vocabulary and
must not become protocol variants.

Scope clarification, 2026-10-27: the earlier Antigravity example did not cover
direct Google services. The product scope includes OpenAI/Codex, Claude, Gemini,
Grok, and Chinese model services. A shared wire shape never merges their provider
identity or authentication. See [Multi-provider Support](../MULTI_PROVIDER_SUPPORT.md)
for the proposed concrete coverage; this clarification implements no adapter.

Protocol conversion and provider request rewriting are distinct behaviors. A
`ProtocolConverter` translates one exact source/target pair and owns protocol
semantics; a concrete infrastructure adapter's internal typed `rewrite_request`
function owns only that provider's private endpoint wire representation. It is
not a method on the public core `ProviderAdapter` trait, because private wire
types must not cross the core boundary. The application selects a converter
before provider rewriting and applies directional response conversion after
provider parsing. Use trait objects at the application converter/provider
boundaries and composition inside concrete adapters; do not add a separate
rewrite trait without an independent caller. See [ADR 0011](0011-protocol-conversion-and-provider-rewriting.md)
and the [full design](../PROTOCOL_PROVIDER_ADAPTERS.md).

## Layer rules

- `src/core` contains portable identifiers, state machines, policies, errors,
  protocol envelopes and behavior traits. It cannot depend on Tokio, SQLx, Redis,
  Axum, environment variables or concrete providers.
- `src/runtime` owns scheduling of futures and blocking closures, deadlines,
  cancellation, retry timing and execution metrics. It does not know tenants,
  models, SQL or HTTP.
- `src/application` owns request/operation workflows and composes core
  contracts with runtime and infrastructure ports.
- `src/infrastructure` implements repositories, leases, outbox delivery,
  network transports and observability adapters.
- `src/entrypoints` translates HTTP/CLI inputs and errors. It does not
  select accounts, execute SQL or implement retry policy.

## Contract-first sequence

Every new capability follows this order:

1. Add or extend a core value/policy/trait with an explicit invariant.
2. Add a runtime primitive only when the workflow needs a new execution behavior.
3. Define the application workflow and its error transitions.
4. Implement infrastructure adapters behind the workflow boundary.
5. Add an entrypoint and redacted contract tests.

Do not create empty provider, scheduler, billing or transport directories ahead of
their first real caller. Do not retain a superseded interface as a compatibility
shim; update all callers in one change.

## Initial contract set

The first contract slice establishes typed identifiers in `core::identity`, stable
error and retry classifications in `core::errors`, operation/replay vocabulary in
`core::execution`, and an executable byte-preserving provider adapter contract in
`core::providers`. Runtime and server adapters must use these types as their
application workflows are added.
