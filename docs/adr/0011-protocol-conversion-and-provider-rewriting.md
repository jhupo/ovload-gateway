# ADR 0011: Protocol conversion and provider request rewriting

Status: accepted target boundaries. ADR 0015 supersedes the removed unary
implementation; ADR 0027 defines the imported-workspace standard API and Chat
conversion work. API.md owns the actual executable surface.

Date: 2026-10-27.

The full directional protocol matrix, capability rules, rewrite pipeline,
streaming contracts, diagnostics, and acceptance gates are specified in
[Protocol Conversion and Provider Adapter Design](../PROTOCOL_PROVIDER_ADAPTERS.md).

## Context

The gateway accepts several vendor-neutral client protocol shapes and must route
to concrete providers whose supported boundary protocols may differ. A provider
also has a private endpoint wire format, authentication rules, and documented
request adjustments. Combining these transformations makes it unclear which
layer owns semantic compatibility, provider-specific behavior, and execution
policy.

The existing `ProtocolConversion` value records a source and target pair. It
does not implement a conversion. The existing `ProviderAdapter` executes a
`ProviderRequest`; it does not expose a separate request rewrite contract. The
architecture must describe these planned behaviors without claiming they are
implemented.

## Decision

Keep three representations and their owners distinct:

1. **Client boundary request.** The inbound protocol adapter decodes the
   declared route into a byte-preserving `InboundRequest`. Its `Protocol` is the
   protocol the client actually sent.
2. **Provider boundary request.** If the provider supports the client protocol,
   preserve it and skip conversion. Otherwise, the application selects one
   registered `ProtocolConverter` for the exact directional source/target pair.
   The converter translates protocol semantics into a `ProviderRequest` whose
   `Protocol` is the provider's selected boundary protocol.
3. **Provider wire request.** The concrete provider adapter's
   infrastructure-local typed `rewrite_request` step maps that provider
   boundary request and frozen endpoint/model binding to the selected endpoint's
   private serialization and documented header/query/body adjustments. It is
   not a method on the public core `ProviderAdapter` trait, and private wire
   types do not become core `Protocol` values. The adapter resolves credentials
   for the already selected account and injects authentication at send/dial
   time; secret values never enter immutable request snapshots or diagnostic
   evidence.

Ownership follows the backend boundaries: core owns the portable converter
contract and provider-independent protocol semantics; the application selects
the exact converter from the client protocol and selected provider capability,
then coordinates request and response conversion. Entrypoints decode the client
protocol and encode the final client response. Infrastructure provider adapters
own private wire rewriting, send-time authentication, and parsing the provider
response back to the provider boundary protocol. No provider chooses or runs a
different conversion implicitly.

`ProtocolConverter` is a vendor-neutral contract. It declares supported
operations, tools, content parts, reasoning controls, stream modes, usage and
error behavior, and semantic loss. Request conversion and response/event
conversion are explicit directional behaviors. An inverse pair is separate;
select only one exact registered pair and do not infer transitivity or build
automatic conversion chains. Reject unsupported required semantics before
dispatch. Preserve bounded original/converted evidence and converter revision
under the protected diagnostics policy.

The application keeps two polymorphic boundaries: the core `ProtocolConverter`
contract keyed by an exact ordered pair, and the core `ProviderAdapter` contract
keyed by provider product/endpoint. `RequestExecutor` freezes an immutable
operation `ExecutionPlan` containing ordered compatible candidate plans and
composes those strategies. The plan does not contain a selected account. For
each attempt, the application selects a policy-allowed candidate and converts
its request before acquiring an account lease. `AccountScheduler` returns a
currently eligible `ScheduledAccount` and concurrency lease; `RequestExecutor`
combines those with the operation and candidate to create a fresh immutable
`AttemptContext` with a mandatory `AccountId`, principal reference/revision,
and egress/profile generation. The provider adapter receives this bound context
and cannot select or infer an account. Bootstrap registers compiled implementations and rejects
duplicate keys; this is not a runtime plugin system. Concrete provider adapters
are infrastructure facades composed from provider-local typed rewrite/parse
functions and shared credential/transport components. Add internal traits only
when a real independent implementation needs them.

Provider rewriting may implement only provider-contract-specific wire behavior.
It cannot change the client protocol, choose or switch providers/accounts, make
retry decisions, own the operation deadline/cancellation budget, or settle
billing. Endpoint/account options are typed fields declared by the provider
contract. Generic raw body/header/query patch rules and executable scripts do
not exist. Built-in changes are deterministic and revisioned.

The response path reverses ownership in order: the provider adapter parses
provider-native responses/events into its declared boundary protocol; the
selected directional converter maps them to the client protocol; the outbound
protocol adapter encodes that client protocol over the negotiated stream and
transport. Streaming conversion must be incremental, bounded, cancellable, and
backpressure-aware. Client and provider exchange shapes are separate values in
an immutable exchange plan; the initial implementation admits only matching
shapes. A shape bridge needs its own explicit contract and acceptance tests.
WebSocket forwarding also requires an inbound bounded client-session contract.
A converter must define terminal events, errors, usage, and partial-output
behavior; it may not require an unbounded stream buffer.

Replay decisions use failure classification, dispatch certainty, the frozen
route/replay policy, downstream commitment, and remaining deadline/attempt
budget. The replay barrier is the first committed downstream response head,
accepted semantic output, or accepted bidirectional session state. Every
permitted replay creates a new attempt context. Cross-
provider fallback additionally requires explicit customer authorization for
model semantics and price; an adapter never performs fallback itself.

Only implemented and tested pairs are eligible for routing. Four `Protocol`
enum values do not imply universal all-to-all conversion. Native passthrough is
preferred when the provider supports the client protocol. Unsupported or
unverified pairs fail admission with a structured capability/conversion error.

## Consequences

- Protocol compatibility can be reviewed and tested independently from vendor
  authentication, endpoints, and serialization.
- Every provider can use its own rewrite behavior while sharing the same
  protocol converter contracts and execution engine.
- Diagnostics can distinguish client input, converted boundary input, and
  provider wire output without conflating protocol identity and provider ID.
- The current core conversion value and provider adapter trait are incomplete
  relative to this proposal. Implementing forwarding requires adding the
  converter behavior contract, provider rewrite boundary, application routing,
  response conversion, and redacted directional fixtures together.

## Alternatives

- A universal chat-shaped DTO would erase protocol extensions and provider
  semantics; rejected.
- Provider adapters that each implement arbitrary client protocol conversion
  would duplicate compatibility logic and couple it to vendor code; rejected.
- Treating the private provider wire format as a new public `Protocol` would
  mix provider identity and client boundary semantics; rejected.
- Automatic multi-hop converter chains would make loss, stream behavior, and
  diagnostics ambiguous; rejected.
