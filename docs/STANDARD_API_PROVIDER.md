# Standard Responses API provider

The `openai_api` product is independent of the `openai` Codex product. It accepts
API keys for the public Responses API; existing accounts are never reassigned.
It uses the shared account store, encrypted credentials, account scheduling lease,
execution coordinator, native Responses decoder and downstream protocol codecs.

## Account contracts

Import accepts exactly one JSON object:

```json
{"schema_version":1,"name":"Public API","api_key":"<write-only>","base_url":"https://api.openai.com/v1"}
```

The connection editor accepts exactly
`{"base_url":"https://api.openai.com/v1","transport":"http","api_key":"<optional replacement>"}`.
Omitting `api_key` preserves the current encrypted key; empty keys are invalid.
Keys contain at most 16,384 printable ASCII bytes and no surrounding whitespace.
Configuration reads return only `base_url` and `transport`. Rotation is committed
through the existing credential revision CAS and retains account identity.
Imports validate shape and configuration without claiming to verify upstream access.
OAuth, refresh, native WebSocket, sideband, credential export and provider balance
queries are unsupported. Explicit managed adapters have the separate transport
boundary described below. Unknown quota is not zero remaining balance.

## Network and execution

Base URLs require HTTPS, no user information/query/fragment, and a public host.
Direct connections pin a bounded DNS answer containing only public addresses.
Redirects, environment proxies and transport retries are disabled. A configured
account proxy is always used and is never replaced by a direct connection. Proxy
connections are restricted to the official `api.openai.com` destination because
the gateway cannot enforce DNS pinning inside a remote proxy for custom endpoints.
Credential headers are limited to standard bearer authentication; Codex private
headers, instructions and payload rewriting are not used.

The account scheduler selects and leases one scoped account before dispatch.
Dispatch receives this concrete lease; no account changes or internal request
retries occur. The returned stream sends only on first poll. Cancellation,
absolute request deadline, idle timeout and dropping the stream release resources.
Contention uses the shared fair bounded capacity queue and the request's existing
waiting budget; retries do not reset that budget. Every wake reloads account
eligibility and lease facts. Fixed-account diagnostics do not join normal queues.
The selected account passes through the frozen attempt middleware and optional
managed upstream adapter. Native dispatch applies privacy and outbound middleware
before validating the final URL, DNS answers and account egress. Native outbound
rewrites must keep the configured origin; changing destinations requires an
explicit managed adapter with its existing host destination authorization.
Managed HTTP adapters apply the same frozen privacy and outbound policies in the
Host preparation path, after selected-account authentication and before final
network validation and live model-key authorization. The adapter's own instance
is excluded from its outbound middleware scope; other frozen middleware remains
eligible. All HTTP callbacks, including auxiliary requests, use this path.
Privacy-protected nonempty bodies require bounded uncompressed JSON; empty
auxiliary requests retain an empty body while applying header rules. Final
targets retain their origin and inference/auxiliary purpose, and final body,
header and request byte constraints are validated after middleware. A preparation
rejection is retained by the parent call even if the plugin catches the callback
error, and it does not erase any earlier observed send or side effect.
Managed WebSocket adapters with applicable privacy or outbound policy are
explicitly rejected on first poll before plugin execution or handshake. This SDK
does not yet provide an atomic opening-plus-message policy contract. Policy-free
WebSocket behavior remains supported. Rejected adapters never fall back to native
dispatch. See [ADR 0028](adr/0028-managed-http-outbound-policy.md).
Native Responses requests support text messages and function tools. Unsupported
modalities, hosted tools, continuation and background execution fail explicitly
before sending. The request model is replaced only by the frozen routed model.
The upstream request uses SSE for both client streaming and ordinary JSON; the
existing native response collector supplies the final JSON response.

`GET /models` is real and bounded by bytes, entries and time. It is discovery,
not proof that every listed model implements Responses. Unknown model features
are validated by the upstream; no fabricated model or token limit is published.
Catalog results retain their account sources and are invalidated after mutation.
Discovery uses at most four concurrent catalog requests and one 30-second total
deadline. A failed or incomplete discovery is reported as unavailable. Cached
results are bound to credential revision and effective account egress.

HTTP 401 records revision-fenced invalid credential state in PostgreSQL,
preventing subsequent normal scheduling. PostgreSQL is the state authority;
the provider does not publish a second credential-state cache. HTTP 429 records temporary
cooldown using Retry-After, bounded to one second through one hour; absence of a
header uses a one-second local cooldown. A confirmed Responses terminal success
records ready state and clears temporary rate limiting. A fixed-account
connection diagnostic can verify recovery after key replacement. Feedback writes
are bounded to two seconds and failures are recorded without leaking upstream
material or replaying an already executed request. Request transport is `http`;
SSE remains a response mode expressed through HTTP content negotiation.
Ordinary successes only promote unknown/ready credentials. Restoring invalid,
expired or banned credentials requires an explicit successful account diagnostic;
state comparison is atomic, so a concurrent failure is not erased by a late success.

## Accounting and acceptance

Native response usage and failures are preserved. Missing usage remains unknown.
The standard product replaces the shared decoder's canonical usage defaults
with per-field native quantities; missing, null, negative and noninteger counts
remain unknown. It never derives a reported total. Contradictory totals or
cache/reasoning subsets invalidate the affected quantities and the estimate.
Bounded output-item evidence retains identity, type and completion facts without
generated text. A terminal snapshot must agree with observed items; sparse
terminal output requires earlier completed supported items, or explicit zero
output tokens with a verified text/function request. Evidence limits and unknown
item types disable the estimate while native wire data remains available.
Procurement estimates require an explicit `openai_api` override for the exact
routed model, a complete `standard` band and the selected complete service band.
There is no built-in price, alias lookup, Codex price fallback or multiplier-only
estimate. An absent/default service tier uses `standard`, `flex` uses `flex`, and
`priority` uses `fast`. Other tiers, including unresolved `auto`, remain unknown.
The reported final tier takes precedence over the request tier. Overrides with
`long_*` or `image` bands remain unknown because this product has no verified
model-specific applicability facts for those conditions.

The gateway model-price tab reads the real procurement catalog and saves exact
provider/model overrides through the existing platform settings API. Select
`openai_api` independently of Codex `openai`; text tiers map to `standard`,
`fast` (priority), and `flex`. Rates remain USD-per-million decimal strings,
including explicit zero, with an independent basis-point multiplier. Removing
an override uses the server reset command. Price writes are per model, not an
atomic page save or a retail-price publication. Other gateway tabs use the
runtime-settings API with an explicit configuration revision, preserving
untouched settings and rejecting stale replacements. Unsupported controls stay
visible but disabled. This price endpoint has no client CAS precondition, so
concurrent edits to one model use last-committed writer semantics; price writes
can make an already loaded runtime editor stale.

All three entry points, native Responses, managed adapter metering and admin usage
pricing, share these rules and the existing ten-decimal USD amount types. Input
and output totals, cached input and cache-write input must be known and valid.
Managed adapter and admin usage require explicitly zero image token counts.
Native cost calculation may instead prove zero image quantities from the actual
final serialized text/function request and complete supported output evidence;
this private proof does not add zero image quantities to reported customer usage.
Cache counts are subsets of input,
and reasoning tokens are a subset of output, so neither is counted twice. An
inconsistent total, unsupported modality, unknown required usage or numeric
overflow produces an unknown estimate. Explicit zero rates remain valid. The
configured basis-point multiplier uses the shared checked rounding rules and is
applied to each amount and rate. Automatic customer preauthorization and
settlement remain disabled. There are no new background workers.

The current user instruction skips test execution and real upstream/database
calls. Redacted contract tests and static checks do not establish external API,
database or concurrency acceptance.
