# Ovload Gateway Architecture

Status: initial design. Date: 2026-09-19.
Implemented today: process health endpoint, provider capability contracts, public home/login presentations, a component lab and dashboard design previews, and versioned storage infrastructure.

## Goals and scope
Build a multi-provider AI gateway as a Rust modular monolith.
Administrative and user interfaces share a Vue design system.
The first vertical slice is Responses HTTP/SSE → Codex provider → account-bound
egress → usage ledger. Gemini, Antigravity, Grok, and WebSocket support follow.
The scaffold must not advertise these planned integrations as working features.

## Request lifecycle
Client → Tower middleware → inbound protocol adapter → executor →
scheduler/session ownership → provider adapter → transport → upstream.
Responses follow an explicit native passthrough or protocol conversion path.

| Component | Responsibility |
| --- | --- |
| Middleware | Authentication, tenant context, request size, tracing, rate limiting |
| Executor | Deadline, cancellation, operation identity, retry budget, execution certainty |
| Scheduler | Account eligibility, quota, concurrency leases, ownership, attempted-account exclusion |
| Provider | Authentication parameters, capabilities, requests, events, errors, quota parsing |
| Transport | Proxy routing, TLS, HTTP/2, SSE, WebSocket, bounded streams, connection pools |
| Billing | Pricing version, observed usage, idempotent ledger; aggregates may be eventually consistent |

## Adapter boundaries
1. Protocol adapters: Responses, Chat Completions, Anthropic Messages, Gemini.
2. Provider adapters: OpenAI API, Codex OAuth, Gemini API, Gemini CLI,
   Antigravity, Grok API, Grok Web.
3. Transport adapters: standard Rust networking; specialized implementations
   only when justified by concrete protocol requirements and capture evidence.

Keep native payloads using typed variants and explicit preservation of provider
extensions. Do not flatten every request into Chat Completions.
Conversions declare their supported capabilities and any semantic loss.
Reject unsupported conversions with structured errors rather than silently dropping fields.

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

Axum/Tower handles inbound requests on this runtime. Planned HTTP/SSE/WebSocket
provider paths use asynchronous I/O, bounded buffers, and end-to-end backpressure.
Bound active operations, queued work, and upstream connections explicitly; cheap
tasks do not justify unlimited spawning or buffering.

The executor owns each operation's deadline, cancellation, and child tasks.
Client disconnects cancel associated upstream work and release local resources;
cancellation does not prove that an upstream operation was never executed.
Providers must not detach work, select accounts, or introduce independent retries.
The scheduler owns account admission and concurrency leases.

Background tasks need an explicit owner, observed completion/errors, resource
limits, and a shutdown policy. Shutdown stops admission, allows a bounded drain,
then cancels remaining asynchronous work and waits for cleanup.
Isolate unavoidable blocking I/O with spawn_blocking and bound submitted work.
CPU-heavy work needs a bounded blocking or dedicated compute pool. Already-running
spawn_blocking closures cannot be forcibly aborted; their cooperative cancellation
and shutdown behavior must be designed explicitly.

Implementation status: the server already uses Tokio's multi-thread runtime,
an asynchronous listener, and Axum graceful shutdown. The executor, provider
streaming paths, and the full bounded task lifecycle above remain planned work.

## State and concurrency
Separate operations from attempts. Each operation has a finite total retry budget.
Providers do not nest retry loops.
Use shared concurrency leases with fencing tokens, renewal, and idempotent release.
When upstream execution is uncertain, mark unknown_execution and consult the
operation's explicit replay policy.
After semantic output reaches the client, do not transparently replay on another account.
Propagate cancellation to child operations.
Scope session, response, tool-call, and turn state to tenants and credential principals.
Without a stable session identifier, treat requests independently; never merge
users by IP address or similar prompts.
PostgreSQL owns durable configuration and ledgers; Redis owns expiring leases and caches.
If shared admission control is unavailable, reject new constrained operations;
do not silently bypass global concurrency limits.

## Identity and egress
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
Current modules: ovload-core (contracts), ovload-server (composition and health), web.
Extract executor, scheduler, session, billing, storage, admin, protocols/*,
providers/*, and transports/* as real use cases arrive.
Dependencies point toward core. Database models and Axum request objects do not
leak into provider domain interfaces.
Split a process only when dependency conflicts or measured scaling requirements justify it.

## APIs and operations
Planned namespaces: /api/admin/v1 for administrators, /api/v1 for users;
model APIs retain their standard protocol paths.
Generate TypeScript clients from OpenAPI.
Management sessions and model API keys have separate authentication policies.
The current /healthz is liveness only. Add /readyz when external dependencies exist.
Logs contain necessary redacted metadata; credentials, request bodies, and opaque
upstream state are excluded by default.

## Delivery phases
1. Scaffold and standards (current).
2. One complete HTTP/SSE provider path, cancellation, redacted contract tests.
3. PostgreSQL accounts/keys/ledger, Redis leases, management screens.
4. Tool continuation, quota states, bounded retries, WebSocket lifecycle.
5. Gemini/Grok adapters and multimodal contract coverage.
6. Real egress captures, load/failure tests, containerized release.

## Deployment and schema ownership
See ADR 0002 and DATABASE.md. The application image serves frontend assets and Rust
HTTP routes together. PostgreSQL and Redis are separate persistent services. SQLx
owns embedded migrations; startup never downgrades. Readiness probes both stores.

## Public homepage rendering

The public Vue route owns the procedural Three.js introduction and the login
overlay described in ADR 0005. Rendering lives in web/src/scene; it has no
dependency on backend credentials, provider adapters or operational telemetry.
Three.js is loaded on demand. The same page instance serves / and /login so
opening and dismissing the dialog preserves the scene. Authentication APIs are
still planned; the visual form cannot submit credentials.
