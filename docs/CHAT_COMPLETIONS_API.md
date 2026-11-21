# Chat Completions conversion

`POST /v1/chat/completions` authenticates the same durable model key as Responses.
It executes once through the existing group policy, admission, attempts,
cancellation and finalization path. Execution records retain the
`chat_completions` client protocol and original endpoint. Provider input uses
Responses; no local HTTP forwarding or inverse converter is involved.

The supported direction accepts one completion, text conversations with system,
developer, user and assistant roles, function tools, assistant function calls and
matching tool results. Requests support `max_completion_tokens`, `temperature`,
`top_p`, `parallel_tool_calls`, `reasoning_effort`, `response_format`,
`service_tier`, `metadata` and `store`. Unknown fields, non-text modalities,
deprecated function syntax, multiple choices and unmatched tool results fail
before dispatch. Tool definitions explicitly default `strict` to false to retain
the Chat contract. Structured-output format definitions map to Responses text
format without changing the JSON schema.

The body uses the configured decompressed Responses request limit. Conversations
contain at most 256 messages and 128 function calls/tools. Text part lists contain
at most 256 elements. Tool and item state are bounded. Conversion accepts no
provider-owned continuation handle. Converted SSE frames are limited to 4 MiB;
oversized or unsupported frames fail explicitly. Stream content is checked with
fixed-size per-part and per-call digests, without retaining generated text.

Buffered responses map native text/refusal/function-call output, status, model,
timestamp and authoritative usage to one Chat choice. Streaming uses data-only
SSE chunks, stable completion identity, per-call indexes and argument deltas.
`stream_options.include_usage` requests a final empty-choice usage chunk. Missing
usage remains unknown. Input cache tokens and output reasoning tokens are detail
subsets, not additional token charges. A successful finish is emitted only after
the Responses delivery path confirms terminal execution. Incomplete output maps
its supported reason to `length` or `content_filter`; errors do not become stop.
Truncation, invalid events and unsupported output semantics terminate with an
error. Disconnect cancels/finalizes the same execution and proves no refund.

Response middleware may rewrite content but cannot change the completion
identity, model, authoritative usage, finish reason or terminal execution fact.
The final Chat delivery validator checks these facts after middleware runs and
rejects invalid JSON/SSE ordering, multiple choices and forged successful output.
Conversion and delivery failures produce bounded diagnostic events without
including request or generated content.

Total execution timeout follows the existing execution settings. There is no
separate fixed Chat first-frame deadline; the existing configuration can leave
the total timeout unset. Chat does not send keepalives before its first validated
frame. After that frame it uses the shared SSE delivery heartbeat. This does not
change the native Responses first-frame keepalive behavior.

Automatic retail billing remains disabled. This endpoint does not infer token
ceilings or debit customer wallets. The current session skips tests and real
upstream/database acceptance; compile checks are not integration evidence.

Official contracts: [migration](https://developers.openai.com/api/docs/guides/migrate-to-responses),
[Chat streaming](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events).
