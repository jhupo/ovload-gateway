# ADR 0009: Protocol capability planes

Status: accepted implementation scope. Date: 2026-09-22.

## Context

The gateway must support native protocol shapes, HTTP SSE, bidirectional
WebSocket sessions, transport keepalives, content compression, search and
other operations. Treating every concern as a protocol would mix wire shape
with transport behavior and would make a provider capability declaration form
an invalid Cartesian product. A provider that supports Responses over SSE is
not automatically a provider that supports Responses over WebSocket.

## Decision

Keep `Protocol` vendor-neutral and limited to boundary wire shapes:

- Responses
- Chat Completions
- Messages
- Generate Content

Represent the remaining dimensions independently:

- `ConnectionTransport` selects HTTP or WebSocket.
- `StreamMode` selects unary, server-sent events or bidirectional behavior.
- `FrameFormat` selects JSON, SSE events or WebSocket messages.
- `KeepalivePolicy` selects transport control traffic that carries no semantic
  output and is excluded from usage accounting.
- `CompressionSelection` and `CompressionSupport` model request, response and
  message content coding independently from business fields such as image
  output compression.
- `OperationKind` models generation, search, token counting, compaction, media
  and live operations.
- `ToolCapability` models function, custom, namespace, search and hosted tools.

Providers advertise a list of complete `ProviderCapability` variants. Each
variant binds protocol, transport, stream, frame, keepalive, compression,
operation and tool support. Runtime selection checks one variant instead of
combining unrelated arrays.

Provider execution returns a typed `ProviderExchange` with a common response
head and a shape-specific body: unary response, pull-based SSE event stream, or
bidirectional WebSocket session. The common head identifies provider protocol
and shape, status, sanitized headers and provider request IDs. A stream or
session reports its terminal outcome when it ends; SSE frames preserve their
protocol metadata, and provider-native usage observations are handed to
accounting separately from client response conversion. Pull boundaries
preserve cancellation and backpressure. Keepalive events are separate from
semantic frames. The current core enum describes the body variants but lacks
the full response head, complete event metadata and usage/terminal handoff;
those are required before model forwarding, as detailed in the
[protocol and provider adapter design](../PROTOCOL_PROVIDER_ADAPTERS.md).

## Consequences

The core contract can describe Sub2API-style heartbeat, search and compression
support without pretending that any of them is a new protocol. Provider
adapters remain responsible for private upstream formats such as Bedrock event
streams. Server entrypoints and provider implementations are not added until a
real vertical slice consumes these contracts, so the server continues to
advertise only verified endpoints.

Replacing the previous independent capability arrays and `ResponseMode` is an
intentional interface change. Callers must construct a valid capability
variant and a typed exchange; no legacy aliases or fallback branches are kept.
WebSocket model routes also require a bounded inbound client-session contract;
an upstream provider session alone cannot represent the client connection.
