# OpenAI and Codex Protocol and Identity Design

Status: normative target contracts, reviewed on 2026-10-27. The OpenAI public API
unary Responses adapter and explicit single-user-text Chat conversion are implemented.
Codex OAuth, provider-bound continuation, SSE and WebSocket remain unimplemented.
See [Gateway Framework](GATEWAY_FRAMEWORK.md),
[API Contracts](API.md), and [Protocol Capability Planes](adr/0009-protocol-capability-planes.md).

This is the OpenAI/Codex specialization of the
[multi-provider design](MULTI_PROVIDER_SUPPORT.md), not a universal identity
profile for Claude, Gemini, Grok, or Chinese services. Those adapters declare
their own authentication, native payloads, usage, and continuation contracts.
Share bounded Rust transport and execution primitives; do not attach Codex
headers, OAuth behavior, thread/turn fields, or TLS matching requirements to
unrelated upstream services.

## 1. Source baseline and evidence

Baseline the Codex provider against official Rust tag `rust-v0.154.0`, dereferenced
to commit `6b9826e3aa83b1a5947db50f4332cb9c65f1b340`. This matches the stable baseline
selected in the local identity refactor report. It is a reproducible compatibility
target, not a claim that it is the newest release.

| Source | Evidence used |
| --- | --- |
| [Codex request types](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/codex-api/src/common.rs) | Responses HTTP and `response.create` payloads; optional field omission; native tools and reasoning values. |
| [HTTP Responses endpoint](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/codex-api/src/endpoint/responses.rs) | SSE Accept header, request compression, session/thread headers and endpoint selection. |
| [WS Responses endpoint](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/codex-api/src/endpoint/responses_websocket.rs) | Header precedence, auth at dial, permessage-deflate, response lifecycle and connection errors. |
| [Per-turn model client](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/core/src/client.rs) | One client session spans multiple model requests in one turn; opaque turn state and prewarm ownership. |
| [Compaction endpoint](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/codex-api/src/endpoint/compact.rs) | Separate `responses/compact` request returning compacted output items. |
| [Default client identity](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/login/src/auth/default_client.rs) | UA construction from application version, platform and terminal; originator ownership. |
| [HTTP client dependencies](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/http-client/Cargo.toml), [builder](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/http-client/src/client_builder.rs), [WS dialer](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/websocket-client/src/dialer.rs) | Reqwest HTTP, selectable TLS backend, Rustls WS, proxy and custom-CA paths. |
| [Workspace dependency manifest](https://github.com/openai/codex/blob/6b9826e3aa83b1a5947db50f4332cb9c65f1b340/codex-rs/Cargo.toml) | Features and fork revisions are part of the source baseline. |
| [Official streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses), [WS guide](https://developers.openai.com/api/docs/guides/websocket-mode), [compaction guide](https://developers.openai.com/api/docs/guides/compaction) | Current public API contracts; distinct from a historical Codex OAuth build. |

Local historical evidence is preserved under [the archive manifest](../reports/source-archive/manifest.json):

- [Identity refactor plan](../reports/source-archive/CODEX_IDENTITY_REFACTOR_PLAN_2026-09-17.zh-CN.md)
  supplies endpoint-specific identity and thread/turn/window relationships.
- [Outbound identity review](../reports/source-archive/CODEX_OUTBOUND_IDENTITY.md)
  supplies immutable attempt identity and actual credential ownership.
- [WS reuse review](../reports/source-archive/WS_IDENTITY_REUSE_REVIEW.md)
  supplies late-frame, response-boundary, and lease failure cases.
- [Transport capture](../reports/source-archive/CODEX_TRANSPORT_CAPTURE_2026-09-17.zh-CN.md)
  supplies platform-specific observations, not universal TLS fingerprints.

These reports include proposals for another implementation. Their Go-specific
transport choices, migration mechanisms, and older blanket header rules do not
become requirements here. Official source, endpoint fixtures, and our accepted
Rust boundaries resolve conflicts. Capture through a test TLS endpoint does not
prove production account behavior or quota equivalence.

## 2. Compatibility has separate dimensions

Track four independently testable claims:

1. **Payload and endpoint semantics:** accepted fields, omissions, errors,
   operation kind, events and continuation behavior.
2. **Identity and lifetime:** consistent real principal, client profile,
   session/thread/turn relationships and account-bound egress.
3. **Transport configuration:** libraries, features, compression, CA behavior,
   proxy routing, HTTP negotiation and connection reuse.
4. **Observed deployment behavior:** actual negotiated TLS/ALPN, response IDs,
   rate-limit headers and results on the tested target/build.

Rust alone establishes none of the last three. A Linux deployment and a Windows
Codex binary can negotiate different TLS behavior. Do not promise one fixed
JA3/JA4, fabricate a desktop platform, or claim identical account treatment.

Maintain a versioned build manifest containing source SHA, Cargo.lock digest,
target triple, compiler, enabled features, HTTP/WS/TLS dependencies, compression,
proxy policy and contract fixture revision. Pin dependencies when implementing;
do not silently follow upstream main. Preserve licenses and attribution for any
adapted source. No dependencies are added by this design.

## 3. Endpoint and provider matrix

The paths below are target contracts, not currently advertised routes.

| Incoming operation | OpenAI API provider | Codex OAuth provider | Admission rule |
| --- | --- | --- | --- |
| `POST /v1/responses`, unary | Public `/v1/responses`, subject to model capabilities | Not assumed from HTTP streaming support | Enable only after provider-specific fixtures pass. |
| `POST /v1/responses`, SSE | Public `/v1/responses` | Codex backend base plus `/responses`, with its native profile | Preserve native Responses semantics; reject unsupported parameters explicitly. |
| WS upgrade `/v1/responses` | Public Responses WS contract | Codex `/responses` WS contract | Independent capability, authentication and connection ownership. |
| `POST /v1/responses/compact` | Public standalone compaction when supported | Codex base plus `/responses/compact` | Separate request schema and compacted-window result. |
| `GET /v1/models` | Authorized public catalog projection | Codex model discovery projection | Expose only authorized routable models; do not equate native catalog schemas. |
| `POST /v1/chat/completions` | Native Chat Completions when supported | Explicit Chat-to-Responses conversion only | No implicit conversion or silent loss of tools/reasoning/content. |
| Search, images, memory, realtime | Each has its own contract | Each requires a verified Codex endpoint/tool contract | Never infer support from a model name or Responses availability. |

Public API keys and Codex OAuth are separate authentication modes and adapters.
The [Sign in with ChatGPT preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
also describe a distinct product contract; they are not blanket guarantees for
all Codex backend OAuth endpoints. Pin the chosen mode explicitly.

Codex app-server JSON-RPC (`initialize`, thread and turn commands) is a client
orchestration protocol. This gateway exposes model inference, not a replacement
app-server, terminal executor, MCP server, or agent tool runner.

## 4. Payload and event handling

Keep a native envelope with bounded original bytes and typed selectors for
admission/routing. Use `serde_json::value::RawValue` or equivalent preservation
for opaque fields. Do not deserialize through a narrow struct that discards
unknown fields and then call the result native pass-through.

Classify fields before forwarding:

- Protocol fields retain their native meaning, including input items, tool
  arguments/results, reasoning, encrypted reasoning, text controls, cache keys,
  service tier and provider extensions.
- Gateway-owned fields, model mapping and namespaced identity have explicit
  mutation rules. Record each mutation and its rule/config revision.
- Upstream credentials, hop-by-hop headers and prohibited transport fields are
  never copied from a downstream client into the upstream request.
- Unsupported semantic fields fail admission. Do not silently drop them, inject
  empty instructions, alter tool results, or invent device context in prompts.

The pinned Codex types omit some empty/absent fields. Preserve the distinction
between omitted, `null`, empty string and empty list. Do not globally force
`stream`, `store`, `instructions`, `version`, or `OpenAI-Beta` across providers.
The verified Codex streaming profile supplies its own required values; public
API modes retain their own contract. Serialize only authorized changes and
retain the unmodified fragments and numeric values without floating-point loss.

For SSE, parse incrementally with bounded event size and multiline `data`
support. Retain event type, optional event ID, payload and order. Forward native
events, including opaque supported extensions, without reducing them to text
deltas. Parse a parallel observation view for usage and diagnostics. Unknown
events never authorize a retry or imply completion. Malformed boundaries and
missing terminal events produce an explicit incomplete/uncertain outcome.

Keep these outcomes distinct: HTTP error before streaming, Responses error
event after headers, `response.failed`, `response.incomplete`, normal completion,
client disconnect, timeout, and WS close. HTTP 200 is not proof of successful
generation. An event ID is not a response ID. Pings, prewarm and keepalives are
not generated tokens or ordinary user generation charges.

Capture provider terminal usage before downstream terminal delivery where
possible. A downstream write acknowledgement means accepted by the local
transport, not proof that the user application consumed the bytes.

## 5. Identity objects and lifetimes

| Identity/state | Lifetime and owner | Required invariant |
| --- | --- | --- |
| Tenant and API-key principal | Authenticated customer boundary | No cross-tenant lookup, cache, continuation, capture or billing ownership. |
| Upstream credential principal | Actual provider credential owner | Aliases/shadow account rows do not create another real principal. |
| Installation identity | Persisted gateway installation/profile ownership | Stable across restarts and ordinary version updates; not generated per request. |
| Client profile generation | Immutable rendering/configuration revision | UA, originator, supported client metadata and platform facts are coherent. |
| Logical session/thread | Explicit client graph in a credential namespace | Root/parent/fork references stay in the same authorized namespace. |
| Logical turn | One client turn, potentially many model/tool exchanges | A retry or tool continuation does not create a new turn. |
| Context window | Client-observed context/compaction generation | Advance only on a verified committed compaction transition. |
| Gateway operation | One accepted model operation | Owns one settlement and a finite attempt budget. |
| Attempt | One account-bound dispatch | Frozen route, principal, profile, endpoint and egress; auth resolved at send. |
| WS connection/generation | One actual socket ownership interval | Identity, destination, egress and continuation compatibility are fixed. |
| WS lane / response ID | Negotiated lane / server generation result | Lane ordering and response lineage are separate; validate both when supported. |
| Opaque turn state | One verified turn and ownership namespace | Never carry into a different turn, account, tenant or incompatible generation. |

Capture original client identity before mutation. A client-supplied header is an
observation, not proof of its platform or a trusted privilege. Trusted profile
configuration controls the actual outbound identity. Do not spoof user IP,
hardware attestations, or platform facts. Use endpoint-specific field rules:
profile values do not make every endpoint send every identity header.

Use explicit namespace projection when client IDs must be isolated upstream.
A persisted mapping or domain-separated keyed derivation binds tenant, downstream
principal, actual upstream principal and logical client scope. Record projection
revision. Preserve graph relations across all corresponding body/header fields;
never hash a turn ID while leaving its root/parent IDs in another namespace.
Missing client graph information remains unavailable; do not infer it from text,
IP or timing. Namespace projection is not an authorization substitute.

Keep prompt-cache partitioning stable within its explicit principal/session
scope. Do not salt it with an access token, retry count, connection ID or routine
profile version. Cache partition stability does not permit continuation across
incompatible profile/egress generations. Token refresh for the same verified
principal need not change the logical identity. Replacing an unknown principal
invalidates reuse until its ownership is established.

Do not put credential bytes in immutable debug snapshots. Resolve current auth
at send/dial time through the credential store, check revocation, and capture
only auth mechanism, credential reference/revision and attachment status.

## 6. HTTP and WebSocket transport alignment

The inspected official Codex workspace at the pinned revision uses Reqwest 0.12,
Rustls 0.23 and Tokio Rustls 0.26.4. HTTP includes both native-TLS and Rustls
paths; the default builder and selected
route matter. The inspected WS dialer uses Rustls. HTTP request Zstd and WS
permessage-deflate are separate negotiated features.

That official workspace patches `tokio-tungstenite` to OpenAI's fork revision
`0e5b2d73aa18dd9f0a50ee9ff199d5aef7594186` and `tungstenite` to
`4fffad30fe373adbdcffab9545e9e9bf4f2fc19f`. A crates.io package with the same
version label does not establish compression/proxy equivalence. Record and
review the actual resolved dependency graph before adopting these paths.

Preserve account-bound egress for HTTP, WS, model discovery and related provider
requests. Resolve proxies explicitly; do not let ambient process proxy settings
silently override an account route. Apply SSRF and redirect policy at each
destination. Custom CA configuration and TLS verification remain explicit.

Pool keys include real credential principal, target authority, selected egress
generation, profile/transport generation and capability contract. A WS pool also
includes the downstream continuation owner and handshake-affecting values such
as Accept-Language. HTTP pool sharing must not share authorization/cookies or
state across principals. New configuration affects new work; a bounded active
lease either finishes under its frozen snapshot or is explicitly cancelled by
revocation, never rebound in place.

Official client internals are references, not server scheduling policy. For
example, an inspected WS reader uses an unbounded channel, which cannot be copied
into this gateway. All queues, encoded/decoded frame buffers, decompression,
connection pools, idle times and shutdown waits remain bounded here. Disable
independent provider/library retries that would escape the executor's budget.

## 7. Continuation and WS reuse policy

Initial WS support dedicates a socket to one authorized downstream continuation
owner and permits one in-flight generation per lane. Do not pool unrelated user
sessions merely because they share an upstream credential.

The pinned Codex request type has `response.create`, `generate` for prewarm and
`previous_response_id`; it does not establish support for every newer public WS
feature. Current public documentation also describes `stream_id` multiplexing.
Enable named lanes, steering or other newer modes only through a separate tested
contract revision. Reject an unsupported incoming feature explicitly. Do not
remove `stream_id` and collapse independent conversations into the default lane.

For a supported continuation:

1. Validate owner, credential, endpoint, contract and profile/egress generations
   before selecting the connection. Acquire its exclusive bounded lease.
2. Record the dispatched operation and expected response boundary. Establish
   ownership using server `response.id` / `response_id` and, when supported, lane.
3. Route each event only after boundary validation, before forwarding, usage
   accounting or account health updates. ID-less deltas require an established
   active response in the contract's ordered lane.
4. Keep a bounded retired-response history. A late terminal frame from a previous
   failed response must not terminate or charge the next operation. At history
   capacity, retire the connection rather than forget boundaries and reuse it.
5. Retire on failed, cancelled, incomplete, ambiguous or unfinished release for
   the initial sequential contract. A clean completed exchange may reuse only
   under the same compatible ownership. Future multiplex contracts can define
   lane-scoped recovery after independent failure tests.

Never use a timed socket drain as proof that late events are gone. Upstream
response lineage is not automatically portable to another account or connection.
If continuation is unavailable, return the native contract error. A provider's
documented full-context recovery is permitted only when the executor proves the
replay policy allows it and the gateway actually has authorized complete context;
do not reconstruct context from diagnostic archives or replay after the response
head, semantic output, or accepted session state crosses the downstream replay
barrier. Gateway crashes do not preserve live socket continuity.

Compaction returns a context window; it is not a WS transport compression mode
or a replacement response ID. The gateway observes explicit client compaction
metadata and results but cannot invent a client's local window transitions.

## 8. Rust responsibilities and acceptance

Add only with first callers:

| Layer | Normative responsibility |
| --- | --- |
| Core | Protocol/capability descriptors, identity scope, operation/attempt state, send certainty and replay decisions; no Reqwest or database handles. |
| Runtime | Bounded queues/tasks, cancellation, deadlines and supervised work; no provider-specific semantics. |
| Server entrypoints | HTTP/WS input translation, tenant authentication inputs and native downstream encoding. |
| Application gateway | Freeze operation/candidate snapshots, schedule a live eligible account per attempt, own attempt/replay decisions, continuation leases, diagnostic capture lifecycle and settlement orchestration. |
| Infrastructure provider | One endpoint-specific request/response exchange; native payload construction/observation and auth binding. |
| Infrastructure transport | Proxy/TLS/HTTP/WS IO, compression, pool ownership, transport measurements and bounded capture hooks. |

Conformance fixtures must cover omitted/null/empty fields, raw extension
preservation, tools and encrypted reasoning, model mapping, public/OAuth
differences, Zstd/deflate negotiation, headers and principal isolation, SSE
fragmentation/multiline/unknown events, terminal usage, prewarm, compaction,
cancel/disconnect, duplicate/late frames, response mismatch, profile changes,
credential refresh/replacement, pool retirement and no replay after response
commitment, accepted semantic output, or accepted session state.

Test both direct and configured proxy routes with local controlled TLS peers,
recording the actual target/build and capture point. Compare source-compatible
behavior, not an assumed fingerprint string. Real-provider smoke tests require
separately authorized credentials and do not replace deterministic failure tests.

Upgrades publish a reviewed source/build/contract manifest together. A version
string auto-sync must never activate an untested payload or transport contract.
