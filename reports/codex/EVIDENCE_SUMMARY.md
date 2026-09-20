# Codex Evidence Summary

Imported: 2026-09-19. Source observations: 2026-09-17.
This is an English synthesis, not a replacement for the archived source reports.

## Evidence inventory
The source work recorded Windows Codex 0.151.0, Linux codex exec 0.144.1,
Docker Go 1.26.7, Windows Codex 0.154.0 production HTTP, and a two-step tool turn.
The Docker sample used a one-off Go program, not the full sub2api gateway path.
Stable source revision: 6b9826e3aa83b1a5947db50f4332cb9c65f1b340.
The inspected main revision was 3a589370a49ddf197de8e5ae03a92615bcad58bf.
These are historical baselines, not claims about today's latest release.

## Observations
- The observed 0.154.0 /responses request carried UA and originator but no version or OpenAI-Beta header.
- Session, thread, turn, root-turn, window, and cache identity persisted across a tool continuation.
- The root turn had root_turn_id equal to turn_id.
- The response's opaque x-codex-turn-state was echoed by the next request in the same turn.
- The observed store=false HTTP continuation replayed history and tool output without previous_response_id.
- Official Rust and Go samples had different TLS/ALPN/HTTP behavior.
- Stable 0.154.0 retained /responses/compact; the inspected main used a different remote compaction flow.
- Telemetry exists, but these client-side observations cannot prove its use in server-side risk decisions.

## Source-project findings
The Go implementation contained partial account scoping and immutable attempt snapshots.
Additional fingerprint rewriting could break root/parent/fork relationships,
replace turn IDs across separate continuation requests, and hold windows at thread:0.
Turn-state attribution was partly process-local. UA settings, egress, and other
protocol routes lacked a complete shared lifecycle model.
These are source-workspace findings; verify current code before applying any fix.

## Implications for this new gateway
Preserve protocol-specific payloads. Use explicit account and tenant ownership.
Bind an operation to immutable application and egress snapshots.
Maintain bounded retry budgets and account exclusion in the executor.
Treat device IDs, lineage, transport configuration, and hardware attestations as
different concepts. Do not synthesize attestations or telemetry.
Rust dependency reuse may reduce transport differences but requires fresh captures.

## Remaining evidence
Production multi-step WS, compact, native search/image, macOS hardware attestation,
and the new gateway's full end-to-end path need separate validation.
No current report proves why an account was restricted or why any individual
429/502/503 occurred.

## How to use the archive
The transport report holds sample details. The gap analysis describes the old
implementation. The identity/egress and refactor plans are historical proposals.
The outbound identity and WS reuse notes document narrower source-code decisions.
Some proposal details conflict or overgeneralize samples; they are not normative.
For example, locale cannot be uniquely inferred from IP, and observed field
presence on one endpoint does not define every platform's protocol contract.
