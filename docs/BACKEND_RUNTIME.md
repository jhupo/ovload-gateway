# Backend runtime

Status: imported backend baseline; see
[ADR 0015](adr/0015-imported-backend-baseline.md).
The previous backend's standalone probe-job CLI and runtime modules were removed.

## Composition and execution

The application in src/apps creates the Tokio runtime and assembles Host, Store,
providers, core, admin, API, plugins, and supervised worker contributions.
Core defines execution and worker contracts; Host owns process signals and OS
execution. The core runtime module owns snapshot publication, not another Tokio
runtime.

Request execution retains the imported service, AttemptCoordinator,
ExecutionSession, provider streams, connection leases, and cancellation paths.
The coordinator calls the selected provider's `AccountScheduler` to obtain an
account-bound one-shot dispatch. It checks provider/account scope and current
authority before invoking that dispatch. Scheduling adapters never send model
traffic; dispatch cannot choose another account. The stream metadata must agree
with the scheduled binding. This replaces the combined provider `execute` hook.
A provider stream is cold: business traffic cannot be sent until its first poll.
Future durable financial dispatch intent belongs before that first poll, after
authorization, validated retail quote, and reservation.

Chat Completions HTTP/SSE uses this same lifecycle with pure protocol conversion;
its usage metadata retains the inbound protocol and endpoint. The standard
`openai_api` product uses bounded account-bound HTTPS and native Responses
payloads, independently of Codex profile rewriting. See
[ADR 0027](adr/0027-standard-api-and-chat-conversion.md),
[Chat contract](CHAT_COMPLETIONS_API.md) and
[standard provider contract](STANDARD_API_PROVIDER.md).

Managed HTTP adapters retain one frozen outbound preparation pipeline per
attempt. Account authentication, privacy, outbound middleware, final
origin/purpose validation and live authority precede the existing Host send
boundary. A bounded retained preparation failure wakes setup or stream
consumption and cannot be erased by the plugin. Adapter-instance scope prevents
recursive entry into that instance's middleware. Managed WebSockets with
applicable privacy/outbound policy reject before any handshake; the split SDK
opening/message callbacks do not establish atomic preparation. See
[ADR 0028](adr/0028-managed-http-outbound-policy.md).

The existing best-effort observation queue is not a financial journal.
The imported client-budget pending queue is process-local. Shared retail
reservation, settlement, and recovery must precede multi-replica customer billing.

## Commands and configuration

The CLI supports serve, plugin, help, and version. It discovers deploy/config.yaml
and consumes CPR-prefixed overrides documented in [Development](DEVELOPMENT.md).
There are no aliases for the removed preview, worker, migrate, schema-status,
or schema-revert commands.

## Shutdown and updates

The baseline retains imported Host shutdown and system_update behavior.
Update checks releases, verifies checksums, stages and replaces application files,
records state, and restarts or rolls back. Active connections may be interrupted;
zero downtime is no longer required.

Project identity, release archives, and Docker packaging need a dedicated
integration step. The current old deployment assets are not verification of the
imported updater. PostgreSQL and Redis stay independent and persistent.

## Validation

Execution, worker, cancellation, queue, and stream contracts are mirrored in each
package's tests. Real Store tests require isolated CPR_TEST service URLs.
Customer USD precharge, retail settlement, tenant isolation, and financial
recovery require their own tests when implemented; an imported runtime build is
not evidence of those guarantees.
