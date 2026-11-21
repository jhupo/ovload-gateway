# Backend development

This guide describes how to change the imported backend without weakening its
ownership boundaries. [Backend structure](BACKEND_STRUCTURE.md) defines the
current package graph; [ADR 0015](adr/0015-imported-backend-baseline.md) records
the baseline and outstanding product gaps. The customer contracts in
[architecture](ARCHITECTURE.md) are targets where that decision or
[API](API.md) marks them as unimplemented.

## Start with the owner

Trace the entry point through its use case, execution session, adapter, and
persistent state before choosing a file. Inspect callers, error conversion,
configuration, concurrent access, and cleanup. Change the smallest complete flow
that owns the behavior, including its public contract and callers.

The root workspace has twelve packages. The gateway is a modular monolith;
package boundaries do not prescribe separate services. The packaging CLI and
external plugin processes have their own executable lifecycles.

| Source owner | Responsibility |
| --- | --- |
| `src/apps` | CLI/bootstrap and composition of concrete Bundles |
| `src/crates/core` | Portable execution, routing snapshots, lifecycle and provider ports |
| `src/crates/admin` | Control-plane models, use cases and ports |
| `src/crates/api` | HTTP/WebSocket/SSE parsing, authentication envelopes, response mapping and static serving |
| `src/crates/store` | PostgreSQL/Redis adapters, transactions, persistence and backup storage |
| `src/crates/host` | Process lifecycle, network implementations, supervised workers and system updates |
| `src/crates/protocol` | Pure wire contracts and codecs, including native OpenAI payloads and SSE |
| `src/crates/providers/openai` | Imported Codex account, request and response behavior |
| `src/crates/providers/xai` | Imported Grok Build account, request and response behavior |
| `src/crates/plugin/sdk` | Public plugin types and optional asynchronous session helpers |
| `src/crates/plugin/runtime` | Package validation, process sessions and injected capability adapters |
| `src/crates/plugin/cli` | Manifest validation and installable plugin packaging |

API handlers use admin/core contracts; they do not construct stores, providers,
SQL clients or Host networking. Concrete providers receive ports rather than
importing SQL or another provider. Only the application assembles concrete
implementations. Consult [plugin boundaries](PLUGINS.md) for extension work.

## Encapsulation and abstractions

Use Rust structs with private fields and constructors to own state and enforce
invariants. Use enums for finite states and failure categories, newtypes for
identities and units, and traits for real variation in execution or external
capabilities. Share immutable snapshots deliberately; a shared `Arc` or mutex
does not define the business owner of mutable state.

Reuse `Provider`, `ProviderRegistry`, `AttemptCoordinator`, `ExecutionSession`,
the existing admin services and Store ports. Before adding a trait or dependency,
identify the caller and the variation it represents. Do not introduce forwarding
interfaces, generic CRUD layers, empty provider folders, or a second execution
framework. Prefer existing libraries for codecs, structured data, storage and
concurrency, while keeping their concrete types out of portable contracts.

Keep inbound protocol identity, provider identity and outbound transport separate.
The imported `openai` and `xai` providers mean Codex and Grok Build respectively;
their names do not establish support for each vendor's public API. Preserve
native payload bytes and wire events where the contract requires them. Explicit
conversion must declare supported inputs, outputs and capability losses; it must
not silently discard fields or reinterpret a protocol as a provider name.

## State, transactions and execution

Use the existing Store transaction boundary for operations that must succeed
together. Database constraints and compare-and-swap revisions enforce concurrent
writes; an earlier read is not a concurrency guarantee. Keep upstream requests
outside database transactions. Document commit order, idempotency and recovery
when a flow crosses durable storage and an external side effect.

Provider streams remain cold: preparing a stream must not send the business
request or spawn a task that can send it. The imported provider prepares one
account attempt; `AttemptCoordinator` owns request retry and downstream commit
decisions. Do not add hidden account rotation or independent provider retries.
Moving account selection fully into the executor is a product change recorded
in ADR 0015, not a property to assume of the baseline.

Carry one request deadline and cancellation lineage through callbacks, network
operations and streams. A disconnected client does not prove that the upstream
did not execute. Replay needs an explicit policy and execution evidence, and
must stop after semantic output reaches the client. Cancellation must still
leave a clear owner for finalization, leases, body/connection closure and any
already-started settlement.

Bound admission queues, pools, stream buffers, callback concurrency and blocking
work. Pull streams according to downstream demand. Supervise background tasks,
keep blocking operations off Tokio workers, and give shutdown an explicit
deadline. A timeout must define resource cleanup and uncertain side effects,
not merely stop waiting for a future.

## Money, identity and diagnostics

Customer finance uses USD with ten decimal places and records procurement cost
separately from retail charge. Reuse fixed-point `metering::Decimal` or an
appropriate unit-bearing integer type; never use floating-point money. Unknown
usage or price is distinct from known zero. Current upstream-cost budgets and
process-local finalization queues do not implement a customer wallet, durable
precharge or retail settlement. Follow the accepted finance contract in
[architecture](ARCHITECTURE.md) when implementing those flows.

Use typed `Result` errors and preserve the distinction between invalid input,
conflict, capacity exhaustion, unavailable dependencies and uncertain execution.
Expose stable public errors while retaining redacted diagnostic context. Never
record raw authorization, credentials, cookies or real request bodies as debug
context. Justify any `unwrap` or `expect` with a local invariant.

New customer-facing work must carry verified tenant and credential-principal
ownership through reads, writes, nested calls and continuation state. Include
session and profile/egress generations where their lifetimes affect validity.
The imported admin/key identity model is not customer tenant isolation. Keep
account-bound egress and SSRF checks explicit; proxy failure must not introduce
an unrequested direct-network fallback. Consult [API gaps](API.md) before using
an existing identifier or plugin callback as an authorization boundary.

## Module and schema contracts

Follow neighboring modules, public facades and corresponding test-module
mirrors. The application architecture suite freezes the workspace dependency
graph, production import boundaries and public adapter surfaces. Update a
contract assertion only for a justified architectural change, together with its
decision and callers; do not relax checks to accommodate an accidental import.

Append SQLx migrations after the existing history and follow
[database recovery](DATABASE.md). Preserve the original 33 migration files and
their checksums. Define upgrade, interruption and recovery behavior before
changing durable data; never recover an application release by downgrading the
schema, deleting persistent volumes or flushing Redis.

## Review and verification

Review the changed flow for duplicate execution, concurrent updates, partial
failure, cancellation, stream backpressure and ownership leakage. For money,
check precision, unknown values, idempotency and ambiguous execution. For
protocol work, check redacted wire fixtures, unsupported features and delivery
order. For persistence, check real transaction and recovery behavior.

Use the applicable commands in [development](DEVELOPMENT.md), including the
architecture suite for package/module changes. Scale behavior and integration
checks to the changed risk; missing PostgreSQL/Redis configuration is not a
successful integration run. Respect the user's current validation instructions,
including an explicit request to stop tests, and report unverified behavior.
Documentation-only changes need link/reference and diff checks; they do not
require application startup or screenshots.

Inspect the final diff for unrelated edits, secrets, dependency/license changes,
lockfile consistency and stale callers. Report completed checks and concrete
limitations. A build, package or passing architecture check alone does not prove
an end-to-end product flow works.
