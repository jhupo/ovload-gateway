# Multi-provider Support Design

Status: normative target coverage and adapter contracts. The implementation base
is now the imported Codex and Grok Build providers, with their native execution,
credentials, continuation and transport handling preserved.
[ADR 0015](adr/0015-imported-backend-baseline.md) supersedes the removed unary
implementation and source layout. The broader provider matrix and customer USD
retail billing remain target contracts; the table is not an assertion that each
vendor is enabled. [API Contracts](API.md) lists the actual executable surface.

This extends [Gateway Framework](GATEWAY_FRAMEWORK.md) within the accepted
[backend boundaries](BACKEND_STRUCTURE.md), [naming rules](adr/0008-naming-and-abstractions.md),
and [protocol capability planes](adr/0009-protocol-capability-planes.md).
[Codex Protocol and Identity](CODEX_PROTOCOL_AND_IDENTITY.md) is one specialization;
[Request Diagnostics](REQUEST_DIAGNOSTICS.md) applies to every provider below.
Customer tariff resolution and precharge are owned only by
[Billing and Pricing Design](BILLING_AND_PRICING_DESIGN.md); this provider matrix
defines normalized provider usage and procurement cost evidence.
The complete cross-protocol matrix, converter contract, provider wire-rewrite
boundary, streaming behavior, and acceptance gates are specified in
[Protocol Conversion and Provider Adapter Design](PROTOCOL_PROVIDER_ADAPTERS.md).

## 1. Required product coverage

OpenAI/Codex, Anthropic Claude, Google Gemini, xAI Grok, and Chinese model services
are peer product requirements. A first working Codex path is an engine validation
slice, not the definition of the finished gateway. Include DeepSeek, Qwen,
Doubao, GLM, Kimi, MiniMax, ERNIE, and Hunyuan in the concrete coverage plan.
Additional services such as StepFun, Baichuan, and iFlytek use the same integration
process; the architecture has no closed list of model vendors.

Support is published per verified combination of service, endpoint contract,
authentication mode, region, model/deployment, operation, protocol, transport,
tools, and billing semantics. Naming a vendor does not assert support for every
model, preview feature, subscription account, browser product, or cloud hosting
variant. Catalog entries and documentation are not working integrations.

## 2. Separate model, provider, protocol, account, and deployment

| Concept | Examples | Invariant |
| --- | --- | --- |
| Model vendor/family | OpenAI, Claude, Gemini, DeepSeek, Qwen | Catalog identity; it does not select credentials or a network endpoint. |
| Provider product | OpenAI API, Codex OAuth, Anthropic API, Gemini API, Vertex AI, Bailian, Ark, TokenHub | Concrete service contract, authentication, errors, usage, and endpoint behavior. |
| Boundary protocol | Responses, Chat Completions, Messages, Generate Content | Shared request/response vocabulary, independent of vendor identity. |
| Upstream account | API-key principal, OAuth principal, cloud service principal | Tenant authorization, quota, egress, and revocation belong to this real principal. |
| Deployment binding | Region, project, workspace, endpoint/deployment ID | Part of model resolution and account eligibility; not interchangeable with a public model name. |

A Claude model served by Anthropic and one served through Vertex AI or Bedrock
have different provider products. A DeepSeek model served directly, through
Bailian, Ark, or TokenHub must not share an account pool or usage parser merely
because its model label matches. Gemini API is an independent integration from
Vertex AI and Antigravity. Codex OAuth and OpenAI API remain separate contracts.

Keep the existing portable `ProviderKind` identity. Do not add a model-vendor
enum to runtime, infer providers from model-name prefixes, or assume that an
OpenAI SDK-compatible endpoint is an OpenAI account. A published route maps the
customer model alias to explicit provider/model/deployment candidates.

## 3. Concrete provider coverage

The table is an integration target, not an implemented capability manifest.
Official documentation establishes candidate contracts; recorded fixtures and
failure tests establish what this gateway can enable. Documentation observations
below were reviewed on 2026-10-27; recheck them when implementing or upgrading.

| Family/service | Target adapter contracts | Provider-specific work |
| --- | --- | --- |
| OpenAI / Codex | Public Responses and Chat Completions; Codex OAuth as a separate endpoint contract | Native Responses items/tools/usage; public API versus OAuth capabilities, token renewal, compaction and WS ownership. Only Codex uses the pinned official Rust identity/transport baseline. See the [Codex design](CODEX_PROTOCOL_AND_IDENTITY.md). |
| Anthropic Claude | Direct Messages first; cloud-hosted Claude is a separate product binding | API version/beta headers, block-level streaming, tool/thinking/signature content, stop reasons, prompt-cache read/write classes and usage. [Messages](https://platform.claude.com/docs/en/api/messages), [streaming](https://platform.claude.com/docs/en/build-with-claude/streaming). |
| Google Gemini | Direct Gemini API and Google Vertex AI independently | Generate Content request/response parts, native streaming, project/location credentials, safety and grounding metadata, cache and thought signatures where returned. Antigravity is a separate optional private endpoint contract. [Generate Content](https://ai.google.dev/api/generate-content), [Google cloud model entrypoint](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start). |
| xAI Grok | Official xAI Responses and documented Chat Completions combinations | Native hosted tools/search, citations, usage and continuation. Grok Web is an independent integration and cannot reuse an API-key contract by changing the URL. [Text generation](https://docs.x.ai/developers/model-capabilities/text/generate-text). |
| DeepSeek | Direct Chat Completions; documented Responses and Anthropic-compatible interfaces as independently verified variants | Reasoning/tool extensions, cache hit/miss counters, stream usage, and differences in supported optional fields. [Chat](https://api-docs.deepseek.com/api/create-chat-completion/), [Responses](https://api-docs.deepseek.com/guides/responses_api/), [agent integrations](https://api-docs.deepseek.com/quick_start/agent_integrations/). |
| Alibaba Qwen / Model Studio / Bailian | Documented compatible Chat, Responses, and Messages variants; native DashScope behavior belongs to its own endpoint contract | Workspace/region binding, model entitlement, reasoning/search differences and original usage. A new public DashScope wire surface would require its own boundary contract. [Workspace access](https://help.aliyun.com/zh/model-studio/model-calling-in-sub-workspace), [search differences](https://help.aliyun.com/zh/model-studio/web-search). |
| ByteDance Doubao / Volcengine Ark | Documented OpenAI-compatible Chat/Responses and Anthropic-compatible endpoint variants | Model versus inference-endpoint identifiers, region, deployment mode, supported request fields and usage. Do not derive endpoint availability from another deployment mode. [OpenAI integration](https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk?lang=zh), [tool integration](https://console.volcengine.com/ark/region%3Acn-beijing/docs/integrate-third-party-tools). |
| Zhipu GLM | Documented OpenAI-compatible interface; other product/endpoint variants require separate fixtures | Native reasoning/tools, model-specific fields, cache and error semantics; preserve its provider identity. [Compatibility guide](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction). |
| Moonshot Kimi | Documented OpenAI-compatible endpoint; other compatibility interfaces enter through their own contracts | Region/product credentials, reasoning and tool history, supported parameters and usage differences. [Compatibility guide](https://platform.kimi.com/docs/guide/migrating-from-openai-to-kimi). |
| MiniMax | OpenAI-compatible and Anthropic-compatible text interfaces | Preserve complete reasoning/tool conversation blocks; verify supported fields and usage separately for each interface. [OpenAI interface](https://platform.minimax.io/docs/api-reference/text-openai-api), [Anthropic interface](https://platform.minimax.io/docs/api-reference/text-anthropic-api). |
| Baidu ERNIE / Qianfan | Qianfan compatible Chat endpoint as the initial contract | Product/API-key version, model access, original usage, provider errors and any additional chargeable operations. [Official integration example](https://cloud.baidu.com/doc/RTC/s/0m9qgqj7h). This example does not establish support for every Qianfan endpoint. |
| Tencent Hunyuan / TokenHub | Current TokenHub model/protocol combinations; historical Hunyuan endpoints are separate products, not a fallback | Product migration, region/key ownership, model-specific Chat/Messages/Responses capabilities and usage. [TokenHub contract](https://cloud.tencent.com/document/product/1823/130079), [Hunyuan migration notice](https://cloud.tencent.com/document/product/1729/131925). |

Third-party aggregators, private deployments, and user-authorized compatible
services can reuse proven wire primitives. Register each concrete service with
its actual endpoint/auth/usage contract. They do not inherit all capabilities or
prices of the model's original vendor. Do not create deprecated endpoint aliases
or automatically move existing accounts between products during a migration.

## 4. Inbound routes and conversion boundaries

The target protocol vocabulary provides these initial text/tool boundaries;
actual supported combinations remain constrained by the existing registry and
HTTP surface:

| Client boundary | Planned route family | Native upstream path when available |
| --- | --- | --- |
| Responses | `/v1/responses` and explicitly contracted related operations | OpenAI API/Codex, xAI, or a verified compatible Responses interface. |
| Chat Completions | `/v1/chat/completions` | OpenAI API, xAI, or a verified compatible service. |
| Messages | `/v1/messages` and explicitly contracted token counting | Anthropic or a verified compatible Messages interface. |
| Generate Content | `/v1beta/models/{model}:generateContent` and `:streamGenerateContent` | Gemini API, Vertex AI through its own authenticated endpoint binding. |

These are planned routes, not additions to the implemented API contract. Native
passthrough preserves supported payload extensions, item/block ordering, tool
IDs, signatures, stop reasons and event boundaries. Inspect a parallel observation
view for routing/usage without reconstructing the whole request through one
universal Chat DTO. Explicit transformations retain original and final evidence.
Client-supplied headers or body extensions cannot override credential binding,
provider destination, trusted client IP, or tenant identity.

For a client using Responses against a Messages-only upstream, a
`ProtocolConverter` must be registered for the exact Responses → Messages pair.
It defines request and incremental response behavior independently and declares
supported operations, tools, multimodal parts, reasoning controls, cache
metadata, errors, terminal usage, stream modes, cancellation, and semantic loss.
The reverse Messages → Responses direction requires its own converter and tests;
an inverse mapping is not implied. Select one direct pair only. Do not silently
chain converters or treat the four protocol enum values as proof that all
source/target combinations work.

Conversion is a vendor-neutral boundary operation. Once the request is in the
provider's selected boundary protocol, the concrete infrastructure adapter's
internal typed `rewrite_request` step maps it to that endpoint's private wire
format using code-owned provider-contract rules. This boundary does not introduce
a replacement for the existing core `Provider` contract. The adapter resolves its bound account's
credentials and injects authentication only at send/dial time; secret values
are excluded from captured request snapshots. Rewriting cannot choose an
account/provider, implement generic protocol conversion, retry, or settle
billing. Client and provider stream shapes are planned independently and must
match until an explicit bounded bridge is implemented. Responses/events are
first parsed to the provider
boundary protocol and only then converted to the client's protocol. Preserve
original input, converted input, provider wire evidence, and converter/rewrite
revisions under the protected diagnostics policy. See [ADR 0011](adr/0011-protocol-conversion-and-provider-rewriting.md).

Reject unsupported semantics before dispatch. Do not silently drop signed
thinking blocks, Gemini thought signatures, tool results, search settings,
reasoning effort, or unknown required extensions. Reject a conversion that needs
an unbounded whole-stream buffer. Provider-specific effort values require an
explicit model mapping; one vendor's labels or numeric budget are not universal.
Opaque provider-owned continuation cannot be converted into another provider's
state or reconstructed from visible text.

Google Interactions, other future public wire formats, embeddings, reranking,
audio/video jobs, and live sessions need their actual boundary schemas and
execution/billing contracts before exposure. A new public wire shape extends
the core contract when justified; a private upstream serialization remains
adapter-owned. Do not label all these operations Chat Completions, or assume that
SSE support establishes WS/live support. This preserves room for all model types
without advertising unimplemented endpoints.

## 5. Rust module ownership and reuse

Use the imported virtual Cargo workspace and dependency directions from
[Backend Structure](BACKEND_STRUCTURE.md). Preserve current provider packages
and injected ports; provider count does not imply another process or require
empty packages for the target coverage matrix:

```text
src/apps/src/                   Compose actual adapters and services
src/crates/core/src/            Provider, execution, routing, usage and money contracts
src/crates/api/src/             Native client HTTP/SSE/WS translation
src/crates/protocol/src/        Pure wire and SSE codecs
src/crates/host/src/            Network, process and supervised work
src/crates/store/src/           PostgreSQL/Redis ports and persistence
src/crates/providers/openai/    Existing Codex provider handling
src/crates/providers/xai/       Existing Grok Build provider handling
src/crates/plugin/              Existing runtime, SDK and CLI
```

The broader vendor adapters and customer billing/capture modules are not
generated scaffolding. Keep small adapters in one module until their real callers
justify a split. Add AWS Bedrock,
Antigravity, web products, or another service only with an actual integration.

Reuse HTTP/SSE parsing, bounded body/event readers, compression, cloud signing,
credential retrieval, and compatible-wire helpers where real callers share the
same behavior. Concrete adapters own authentication, allowed endpoints/headers,
native request/event observation, errors, rate limits and usage normalization.
A shared compatible-wire implementation can serve several typed service profiles;
it must retain each profile's identity and verified capability combinations.
Preserve the imported plugin runtime and SDK. Avoid copied provider loops,
arbitrary configuration scripts, another plugin mechanism, or one generic
adapter with a growing set of unrelated compatibility flags.

The following are target attempt boundaries for integrations, not authorization
to replace imported native account preparation or transport recovery during
baseline work. An adapter executes one account attempt. It never selects another account,
retries, switches providers, sleeps for its own retry policy, or settles money.
Disable automatic SDK retries that escape the executor's budget. Credential
renewal is serialized and supervised for its principal; an auth refresh does not
prove that replaying the failed model exchange is safe.

## 6. Routing, account pools, and continuation

Compile published configuration into eligible route candidates with pinned
model, endpoint contract, operation/tools, auth mode, region/deployment, price,
and account/egress requirements. Intersect those with account entitlements,
revocation, health/cooldown, concurrency, RPM/TPM, and continuation ownership.
Keep server-enforced rate-limit dimensions explicit; two keys can share one
underlying project/principal quota. Do not treat another key as independent
capacity when the upstream identifies the same quota owner.

The shared scheduler chooses among eligible accounts only. Executor attempts
use one deadline and finite retry budget. Classify HTTP and stream-native errors
together: throttling, quota exhaustion, safety refusal, invalid tools, overloaded
service and uncertain execution do not share one retry action. HTTP 200 can still
contain a failed stream or a model refusal.

Cross-provider model substitution requires an explicitly published route policy
and customer-authorized model semantics and price. Preserve requested model,
resolved model and actual provider in diagnostics and billing evidence. A Claude
model is not an automatic replacement for GPT, and two hosts of the same family
are not assumed to have equivalent tool or safety behavior.

The replay barrier is the first committed downstream response head, accepted
semantic output, or accepted bidirectional session state. For SSE, response
headers may commit before the first semantic event. A timeout/disconnect before
that barrier still requires an explicit replay policy and execution-certainty
check; absence of client output does not prove that upstream execution did not
occur.
Each upstream attempt's procurement cost is recorded separately from the single
customer settlement. Safety refusals and uncertain outcomes retain their native
facts and an explicit charging policy; do not present them as unused requests.

Continuation references, uploaded files, cache objects, response IDs and signed
conversation content are scoped to their actual provider contract, principal,
tenant/session, and applicable profile/egress generations. Not every stateless
request needs a Codex thread/window/turn. Record unavailable identity fields as
absent; do not generate plausible-looking values. Signed blocks remain unchanged
and cannot authorize cross-account or cross-vendor continuation.

## 7. Usage and billing

Retail charges, wallet balances, subscriptions and bonuses use USD directly,
with the existing nonnegative checked `Decimal` scaled by `10^10` and PostgreSQL
`numeric(20,10)`, as specified in
[Billing and Pricing Design](BILLING_AND_PRICING_DESIGN.md). APIs use canonical
USD decimal strings and scale 10; ledger amounts have a separate credit/debit
direction. There is no internal credit currency or USD-to-credit conversion.
Payment principal and fees remain integer CNY fen, with a CNY-per-USD quote frozen
on the order and reused for refunds. Provider procurement cost retains its
original currency; a domestic provider's CNY token cost is not a customer USD
tariff. Even USD procurement cost is separate from the retail charge. If an
operator derives a candidate retail rate from a procurement quote,
they must publish an explicit FX source/rate and resulting USD price-book
revision before execution. This does not create a runtime FX price path or use
the customer's recharge quote.

Normalize usage through a versioned parser for the concrete endpoint contract:

| Source counter shape | Required normalization |
| --- | --- |
| OpenAI-style total input with cached-input details | Cached input is a subset, so uncached input is total minus cached input when that contract says so. Do not charge total input and cache reads as disjoint counters. |
| Anthropic Messages input/cache counters | `input_tokens` excludes cache creation/read quantities. Total input adds the disjoint uncached, creation and read counters; cache-write TTL classes may have different prices. [Cache usage](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). |
| Gemini usage metadata | Preserve prompt, cached-content, candidate, thought and tool-related quantities as supplied. Derive disjoint billable quantities from the endpoint/model contract; do not assume all totals have OpenAI semantics. [Usage metadata](https://ai.google.dev/api/generate-content). |
| DeepSeek cache hit/miss | Preserve native counters. Hit and miss partition prompt input in the documented contract; a cached-token detail alias is not another billable quantity. [Cache semantics](https://api-docs.deepseek.com/guides/kv_cache/). |
| Compatible/hosted services | Verify whether reasoning is included in output, whether cache counters overlap, how final stream usage is emitted, and which tool/search/media units are charged. Compatibility of request JSON does not establish pricing semantics. |

The portable receipt keeps original usage evidence plus normalized disjoint
quantities, source/version, completeness, unit definitions, frozen customer
tariff revision and exact checked USD arithmetic. Sum disjoint components and
apply the multiplier before one half-even settlement rounding at
`0.0000000001 USD`; quote and reservation amounts round upward to that same unit.
Reject overflow, negative amounts and excess input precision rather than using
truncation or a saturating money calculation. Reasoning output is not charged twice
when already included in total output. Cache rates use normalized total input
as the denominator. Retail rate selection is based on the requested public
model and cannot vary by upstream account or mapped provider model.
No denominator or missing cache observation means unavailable, not an invented
zero-percent observation. Per-provider counter identities are validated before
settlement; malformed, negative, or inconsistent usage enters reconciliation.

Missing terminal usage is unknown, not zero. Do not substitute a local tokenizer
estimate as authoritative usage. Disconnection, provider errors or usage loss
follow the shared reservation/reconciliation contract. Dynamic tool/search/media
costs need a defensible admission bound or an explicit credit/risk policy.

## 8. Full administrator request profiles

Every adapter uses the same protected capture lifecycle from
[Request Diagnostics](REQUEST_DIAGNOSTICS.md): original inbound request, each
actual outbound attempt, upstream response/events, final downstream response,
transformations, identity/egress, timeline, errors, usage and settlement. Capture
success, failure, cancellation and unknown outcomes. Do not limit detailed
diagnostics to Codex or failed operations.

Index portable fields for filtering, while retaining versioned native evidence:
Claude block/signature/cache fields; Gemini parts, grounding, safety and thought
signatures; xAI citations/hosted tools; domestic reasoning, hit/miss counters,
workspace and endpoint identifiers. Preserve what the provider actually returns;
the gateway cannot capture hidden model reasoning or provider-internal activity.
Semantic refusals, transport failures, client delivery, capture completeness,
and financial disposition stay independently observable.

Credential values never enter ordinary logs, fixtures, captures or exports.
Permitted sensitive prompts, responses and opaque continuation are encrypted
outside the repository/log stream, with audited administrator access, bounded
capture/export, and retention. User usage APIs retain their approved successful
summaries and financial facts without exposing internal request-detail controls.

## 9. Acceptance and implementation gates

Implement each service end to end through the shared engine. Before enabling a
combination, record its official source/version, endpoint/auth/model scope,
capability manifest and redacted synthetic fixtures. Verify:

- Native unary/stream events, fragmented/multiline events, tools and terminal
  usage, unknown extensions, refusals, and provider-native errors.
- Supported conversions in both response modes, effort mappings, signature
  preservation and explicit rejection of unsupported semantics before dispatch.
- Expired/revoked credentials, cloud scope/region mismatches, shared quota,
  account/tenant isolation, continuation ownership and unavailable capabilities.
- One executor retry budget, send uncertainty, response-commitment/session replay
  barriers, cancellation, bounded backpressure/pools, slow clients and bounded
  shutdown.
- Cache/reasoning counter overlap, missing usage, exact ten-place USD retail billing,
  CNY procurement separation, concurrent reservations and duplicate settlement.
- Full profiles for all four exchange legs and every attempt; secret filtering,
  capture pressure/failure, database loss, crash recovery and truthful gaps.

Required family coverage is part of product delivery, while individual endpoints
are enabled only after their gate passes. Sequence implementations in reviewable
slices; do not create empty adapters, simulate successful calls, or advertise
all-model support from a configurable base URL. The same process admits another
Chinese or international provider without redesigning the execution core.
