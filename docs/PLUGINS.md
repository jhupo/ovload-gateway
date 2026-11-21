# Gateway plugins

Gateway plugins extend this application's request and administration contracts.
They are executable packages using the local SDK, distinct from editor and
application workflow helpers. The imported extension runtime is present;
customer tenancy, retail billing and frontend integration gaps remain as
documented in [API](API.md) and
[ADR 0015](adr/0015-imported-backend-baseline.md).

## Source and contract ownership

| Owner | Entry point and responsibility |
| --- | --- |
| SDK | [SDK guide](../src/crates/plugin/sdk/README.md): public types and optional `io` session helpers; no dependency on host implementation |
| Runtime | [Runtime facade](../src/crates/plugin/runtime/src/lib.rs): package validation, process/RPC sessions, contribution binding, stream resources and host callbacks |
| Admin | [Plugin ports](../src/crates/admin/src/ports/plugins.rs): installation/configuration use cases and persisted acceptance/state contracts |
| Host | [Host sources](../src/crates/host/src): process, networking and other system adapters injected into the runtime |
| CLI | [Packaging guide](../src/crates/plugin/cli/README.md): validates the author manifest and builds the archive/checksum |
| Application | [Bootstrap](../src/apps/src/bootstrap): composes the concrete implementations |

An external plugin depends on `ovload-plugin-sdk`, enabling `io` only when it
uses the SDK's asynchronous client helpers. It does not import core, admin,
store, host or runtime internals. Reuse an existing external plugin project;
do not add an unrelated plugin's business implementation to this workspace.

The host owns its public contracts, resource lifecycle, transaction boundaries
and operational stability. The plugin owns its business conditions, data
mapping, workflow, checkpoints and recovery. A plugin defect is corrected in
the plugin. Do not add plugin-specific compensation, inferred fields, hidden
replays or result repair to the host, SDK or runtime. A new host capability must
be independently useful and define its input, output, authorization, side
effects, transaction, cancellation and repeated-call semantics.

## Choose the extension boundary

Read the relevant [capability contract](../src/crates/plugin/sdk/docs/capabilities.md)
and SDK types before implementing a handler.

| Need | Existing extension |
| --- | --- |
| Request/header/body transformations or explicit protocol conversion | Middleware at the declared HTTP, WebSocket, service, request, attempt or outbound boundary |
| Different upstream encoding and response parsing for managed accounts | [Managed upstream adapter](../src/crates/plugin/sdk/docs/upstream-adapters.md) |
| Model aliases/catalog, routing, account ordering or retry advice | The corresponding catalog/router/scheduler/retry-policy capability; Core retains execution decisions |
| Terminal facts or upstream response observations | Observer; observing does not independently settle or replay a request |
| Administrative operations, resources, maintenance or commands | The corresponding management, maintenance or command-line capability |
| Usage import/correction or price evaluation | [Typed usage services](../src/crates/plugin/sdk/docs/usage-data.md); historical edits do not rerun settlement |
| External data-plane authentication | Frontend-authentication capability; the host resolves its principal through configured key policy |

Provider, protocol, transport and plugin adapter IDs are different identities.
Preserve canonical facts separately from native JSON/SSE/WebSocket bytes. A
conversion must identify its formats and supported features and preserve fields
it does not intentionally change. Do not advertise general cross-protocol
support because a middleware or adapter registration exists.

## Execution and resource lifetime

Use `PluginBuilder` and typed handlers rather than duplicating registration or
handwriting RPC methods. Manifest, process RPC and individual capabilities are
separately versioned. Verify the
[manifest rules](../src/crates/plugin/sdk/docs/manifest.md),
[host support declaration](../src/crates/plugin/runtime/plugin-host-compatibility.json)
and SDK types together. Existing wire identifiers such as
`engines.codex-proxy-rs` and the `cpr-plugin` executable are current imported
contracts; do not invent alternate names or compatibility aliases.

The runtime owns handshake, bounded admission, parent-call association, stream
credit, cancellation, instance generations and shutdown. A host client or body
handle belongs to its parent call and cannot be retained for later work. Report
business failures through the typed result; follow the capability's rejection
and cleanup policy rather than escalating one business failure into global
plugin disablement.

Middleware `next` is consumed at most once. Forward unchanged bodies lazily;
HTTP body chunks are not complete JSON/SSE events. Bound any collection with an
explicit byte limit and parse streaming formats incrementally. Returning
headers is not stream completion. Observe consumption, cancellation and
terminal cleanup, and do not bypass backpressure with an unbounded background
reader. The SDK's ordinary handlers still receive complete payloads; lazy-body
support is specific to the documented middleware/resource contracts.

Managed upstream adapters run as the terminal of the existing generation
request chain for built-in `openai`, `xai` and `openai_api` providers. These are
distinct account products, not protocol aliases. Adapters encode requests and
decode results through managed HTTP/WebSocket callbacks; they do not acquire
independent accounts, repeat `next`, retry across accounts or settle usage.
Account selection, leases, credentials, network send observations and retry
decisions stay with the existing host/provider/Core chain. Managed egress uses
the selected account's proxy, does not fall back to direct access, and does not
automatically follow redirects. Adapter path declarations classify operation
purpose; they are not a network allowlist.

Managed HTTP uses the same frozen privacy and outbound preparation policy for
inference and auxiliary calls. Preparation runs with the selected adapter
instance excluded from recursive middleware participation; other applicable
instances remain active. Rewrites retain the original origin and normalized path
purpose, request limits and account proxy. Model-key authority is checked again
after preparation, immediately before Host sends. A retained host preparation
failure ends the adapter call even if plugin code catches the callback fault.

Privacy-protected bodies require identity-encoded JSON; empty auxiliary requests
may apply header rules but cannot acquire a new body. Unsupported payloads fail
explicitly. Managed WebSocket adapters with applicable privacy or outbound policy
are rejected before plugin execution or handshake because opening and message
callbacks do not form one atomic preparation contract. Policy-free WebSockets
retain the existing continuation and connection ownership rules. See
[ADR 0028](adr/0028-managed-http-outbound-policy.md) for exact supported combinations.

Adapter execution metadata does not include raw account credentials. Host
outbound middleware operates after account authentication is assembled and is
therefore a trusted, credential-bearing boundary. Logs and diagnostic evidence
must omit its private headers, bodies and full destinations.

Preserve usage as unknown when no fact is available. Current provider-cost
calculation is not customer retail charging. A timeout, cancelled callback or
missing reply does not prove an external operation was undone. Business
checkpoints and idempotency belong in the plugin, using explicit host service
semantics rather than assuming RPC retries are safe.

## Trust, identity and frontend status

Installed executables run in `trustedProcess` mode with the host's operating
system identity. There is no plugin security sandbox or per-capability
permission model, and the manifest does not accept `permissions`. Process
separation, typed callbacks and bounded resources are lifecycle controls, not
isolation from malicious plugin code. Review the package and its dependencies
before installation and keep credentials and request content out of logs.

Model callbacks must carry a credential verified within the current call or
an active model parent's delegated identity. Core revalidates its tenant/user/key
generations; a key ID alone is not proof of access. The unscoped `host.keys.ensure`
issuance method and administrator key-ID model bridge are removed. Credential
lifecycle belongs to the customer/management identity API. Enabled plugin
bindings reject revoked or quarantined keys; disabling a plugin can preserve its
stale bindings for operator recovery. Other imported
management callbacks still need scoped resource migration as recorded in
[API](API.md). Private plugin state provides revisioned,
instance-scoped storage; it is not a replacement for a host business transaction.

The imported backend declares management pages, static resources and an iframe
bridge. Ovload's current React/shadcn-admin `web/` does not implement that plugin
page renderer. A valid page declaration or packaged web resource therefore
does not prove usable UI integration. If frontend integration is requested,
define the browser/API boundary and follow
[frontend design](FRONTEND_DESIGN.md) using the existing primitives, theme,
internationalization and shared layout. Do not copy upstream's Vue UI stack or
add frontend scaffolding to a plugin that has no page requirement.

## Packaging and verification

The packaging CLI does not compile a plugin, install it, enable it or publish
it. From this repository root, inspect its actual options with:

```sh
cargo run --locked -p ovload-plugin-cli -- package --help
```

After building an external plugin for a supported target, use the documented
`package` arguments for its manifest, binary and declared resource mappings.
The CLI emits a `.tar.gz` archive and `.tar.gz.sha256`; package validation alone
does not verify startup, handler binding or business behavior. Current supported
targets and resource/size limits are defined in the
[CLI guide](../src/crates/plugin/cli/README.md).

For behavior changes, verify relevant registration, malformed input, failed
callbacks, duplicate `next`, capacity exhaustion, cancellation, stream cleanup
and restart/instance invalidation cases. Use the applicable package and
integration checks in [development](DEVELOPMENT.md) only within the user's
current validation instructions. Missing backing services or an unavailable
frontend renderer remain verification limits, not successful acceptance.
Source changes do not authorize installation on a live instance, real upstream
requests or publication.
