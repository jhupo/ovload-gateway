# ADR 0006: Bounded execution and durable infrastructure jobs

Status: accepted implementation scope. Date: 2026-09-21.

The current work delivers runtime and storage infrastructure. Model forwarding,
account selection, billing and public job administration remain separate work.

`src/core` owns storage-independent job identities and states. `src/runtime`
owns an in-process FIFO queue, bounded Tokio tasks, deadlines, cancellation and
blocking-work admission. Server adapters own SQLx, Redis and process supervision.
Tokio worker threads execute asynchronous tasks; they are not allocated per request.
Blocking closures use a separate, explicitly limited pool and must cooperate with
cancellation. Aborting an async waiter cannot forcibly stop native blocking code.

PostgreSQL is authoritative for durable jobs, idempotency, attempts and results.
Enqueue serializes capacity checks in a short transaction. Workers claim rows with
`FOR UPDATE SKIP LOCKED`. Every claim advances an attempt fence, and heartbeat and
completion require the same live fence. Expired work can retry only because the
initial `storage_probe` handler is explicitly idempotent and has no external side
effect. It checks PG/Redis and records a small operational result. Future job kinds
must define replay safety before entering this worker. Never put model requests,
credentials or arbitrary executable payloads into this queue.

Redis owns expiring distributed execution slots using atomic Lua scripts and Redis
server time. Slots are namespaced and uniquely owned; renewal/release cannot modify
another owner's slot. Redis failure stops new claims and cancels work whose slot
cannot be renewed. PG attempt fencing protects result writes after ownership loss.
Redis is not the job source of truth. Deployment replicas must share capacity and
namespace settings. Lease expiry can briefly overlap cancelled I/O; it is not an
exactly-once guarantee for external effects.

The `worker` process supervises the durable worker; `serve` runs only the API.
Both roles use the same binary and module graph. Local CLI
commands enqueue, inspect and cancel tenant-scoped probes using operator database
access. No unauthenticated job HTTP endpoints are introduced. Shutdown stops claims,
allows a bounded drain, cancels remaining work, and observes supervisor completion.
Unexpected worker exits fail the process instead of leaving a healthy-looking
server. All durations and pool sizes are validated before runtime startup.

Migration 2 adds only the queue and indexes. Upgrade after stopping writers and
backing up as described in DATABASE.md. Downgrade refuses while job rows exist;
restore a verified backup when records must be retained. Test fresh migration,
capacity, tenant isolation, duplicate enqueue, competing claims, expired ownership,
retry exhaustion, cancellation, Redis loss and graceful shutdown on isolated stores.
