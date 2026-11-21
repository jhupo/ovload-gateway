# ADR 0028: Managed HTTP outbound policy

Status: implemented; runtime and external-service acceptance remain unverified.

## Decision

Complete managed HTTP adapter support for the independent `openai_api` product
through the existing SDK, plugin registration, account scheduler and runtime.
The SDK declares this exact provider identity separately from Codex `openai`
and Grok Build `xai`. No aliases, extra executor, accounts or retry loops are
introduced. The selected account and owned lease remain the execution authority.

Every managed HTTP send, including auxiliary calls, uses one runtime preparation
path: account authentication, frozen privacy policy, frozen outbound middleware,
final structural and destination validation, live model-key authorization, then
the existing Host HTTP client. This client retains network authorization, SSRF
checks, account-bound proxy, cancellation, bounded response reads and send
observations. Preparation cannot send a request, manufacture a successful
callback or change a prior send watermark. Middleware sees the actual outbound
bytes; it does not select another account or settle customer funds.

The preparation context extends the parent extension scope with the selected
adapter instance before building the pipeline. This excludes that instance's
own middleware and retains other applicable middleware from the same frozen
generation. Provider/model/account identity, cancellation, deadline, authority
and request byte limits are preserved. Scope exhaustion rejects before plugin
execution. The pipeline is retained for the attempt, not rediscovered from a
new configuration while an adapter is running.

## Payload and destination rules

With privacy enabled, a nonempty managed HTTP body must be bounded JSON with a
single JSON Content-Type and absent or identity Content-Encoding. Apply the
compiled policy to a fresh JSON value and validated headers. Empty auxiliary
requests may apply header rules using a temporary JSON null, but must remain
empty. Empty inference, compressed or unsupported privacy inputs fail explicitly.
Without privacy, existing binary/raw payloads remain supported. Both cases run
the outbound middleware. After middleware, enforce headers and request byte
limits; privacy-protected JSON must retain its supported encoding and shape.
Do not silently remove invalid output or repair a plugin response.

HTTP method and URL changes remain subject to the existing outbound contract.
The final target must retain HTTP transport and the original origin, so a
rewrite cannot move account credentials to another destination. Validate the
final target through Host network policy and preserve the account proxy.
Compile path purposes by normalized resolved origin and path, excluding query;
reject conflicting purpose declarations. Initial and rewritten URLs use this
same classifier, defaulting to inference. A rewrite must retain its initial
purpose, including auxiliary side effects. Equivalent relative/absolute paths
and query changes do not change classification. Requests may move between
same-origin paths only when their purposes agree.

Revalidate the live customer model key after asynchronous preparation and
immediately before the existing send boundary. Failed preparation remains
NotSent when no preceding send occurred; earlier auxiliary/inference work keeps
its observed execution state. All errors and traces omit bodies, credentials,
private headers and full target URLs. Failure feedback is applied once through
the existing selected-account connection.

The runtime retains the first typed preparation failure locally for the parent
adapter call and wakes its execution loop. A plugin cannot erase this rejection
by catching a callback error, returning fabricated success or issuing another
callback. The retained failure is bounded to one value, survives RPC error
translation, and terminates initial RPC setup or event consumption promptly.
It does not manufacture a send observation or a continuation record.

## WebSocket Boundary

The current SDK opens a real WebSocket before a later callback supplies a full
message. Core outbound policy instead operates on a candidate opening plus a
complete message. Do not fake an opening, change an established handshake or
silently skip a policy. If a managed WebSocket adapter has applicable frozen
privacy or outbound policy, reject on the cold stream's first poll before
plugin execution or handshake. Policy-free WebSocket behavior and scoped
continuation remain unchanged. Supporting the other combination requires a
complete atomic SDK contract and is outside this HTTP phase.

This supersedes ADR 0027's blanket public-API adapter/policy rejection only for
managed HTTP. A selected but rejected adapter never falls back to native
execution. Native provider dispatch is unchanged.

## Standard API Usage Evidence

The standard product must not inherit the shared Codex decoder's missing-count
defaults. Preserve native wire bytes and raw usage, but replace canonical Usage
with strictly reported per-field quantities. Missing, null, negative or noninteger
counts remain unknown. Do not derive a reported total or emit a usage observation
when no valid native quantity exists. Contradictory totals or cache/reasoning
subsets invalidate the affected quantities and make procurement cost unknown.

Use bounded output-item identity/type/completion evidence, retaining no generated
text. Complete terminal output must agree with observed items. A missing or empty
terminal snapshot can rely on earlier completed items, but cannot itself prove
that no hosted tool or modality ran. With no observed items, an empty response
requires explicit zero output tokens and a verified text/function request before
it can establish supported zero output. Classify the actual final serialized
request after outbound preparation, not an earlier input copy.

Customer Usage fields retain only actual reported image counts. A private cost
calculation may prove image counts zero from a validated text/function request
and complete supported output evidence; this proof must not manufacture reported
zero quantities in customer usage. Procurement still requires complete, coherent
input/output/total/cache quantities and explicit USD rates. Incomplete evidence
never authorizes customer charging.

The current native field vocabulary follows the official
[Responses usage reference](https://developers.openai.com/api/reference/resources/responses/methods/retrieve).
This change does not add a universal conversion or infer arbitrary-provider
compatibility from a configured base URL.

## Validation Boundary

Add mirrored SDK, registration, provider and runtime fixtures for the real
provider identity, middleware ordering and recursion scope, privacy failures,
final destination/purpose/byte checks, post-preparation revocation, cancellation,
lease release and WebSocket rejection before send. Preserve existing replay and
side-effect assertions. The user's instruction skips test execution and real
database, Redis and upstream calls; static checks do not establish runtime or
external-service acceptance. Automatic customer charging remains disabled.

On 2026-10-29, Windows workspace formatting and
`cargo clippy --locked --workspace --all-targets -- -D warnings` passed.
Documentation references and all 46 frozen migration digests were checked.
The Linux-gated native HTTPS fixtures were not compiled by this Windows target.
