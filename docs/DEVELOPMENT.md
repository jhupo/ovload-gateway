# Development Standards

## Local setup
Install Rust stable, Node.js 22.12+, and pnpm 10.
From the repository root, run cargo run -p ovload-server -- preview for explicit stateless development.
In another terminal, run pnpm --dir web install, then pnpm --dir web dev.
The frontend development proxy forwards /healthz to 127.0.0.1:8080.
OVLOAD_LISTEN overrides the backend address; localhost is the default.
RUST_LOG configures tracing. The scaffold does not require PostgreSQL or Redis.
Set environment variables in your shell; .env files are not loaded automatically.
Deployed mode serves static assets and requires PostgreSQL and Redis. Management authentication is not implemented.
Do not use the development server as a production deployment.

## Required checks
```sh
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
pnpm --dir web build
```
Commit Cargo.lock and pnpm-lock.yaml when commits are authorized.
CI uses --locked and --frozen-lockfile.
Verify dependency maintenance, engine requirements, and licensing before adopting versions.
Do not casually upgrade transport dependencies pinned for protocol reproducibility.
New interfaces define errors, deadlines, cancellation, and resource limits.
Use feat/fix/docs/refactor/test/chore commit prefixes when the user authorizes commits.

## Test strategy
Use domain invariant tests, redacted protocol fixtures, database/Redis integration
tests, and failure tests for disconnects, cancellation, duplicate responses,
multi-instance leases, and idempotent billing.
Use frontend component tests and browser checks across desktop/mobile and both themes.
Load tests cover actual HTTP/SSE/WS behavior.
Performance reports record versions, hardware, concurrency, throughput,
p50/p95/p99, RSS, CPU, and error rates.
Do not claim language-level performance advantages without measured evidence.

## Async concurrency and task lifecycle
Follow the runtime ownership boundaries in ARCHITECTURE.md. Prefer async/await
for network and storage I/O. Spawn a Tokio task only when independent concurrent
execution is needed; ordinary asynchronous calls do not require a new task.

- Bound task admission, channels, queues, connection pools, and blocking workloads.
  Acquire capacity before spawning or submitting work rather than creating an
  unbounded population of tasks waiting for capacity.
- Keep request child tasks under executor ownership. Propagate operation deadlines
  and cancellation, observe task errors, and clean up resources on every exit path.
  Dropping a Tokio JoinHandle detaches its task; it does not cancel it.
- Propagate downstream backpressure through streaming reads and writes. Detect
  client disconnects and cancel upstream work without assuming it is safe to replay.
- Give background tasks a supervisor and a bounded shutdown policy. Stop admission,
  drain within a deadline, cancel remaining asynchronous tasks, and await cleanup.
- Use spawn_blocking for unavoidable blocking calls, with bounded submission.
  Started closures cannot be aborted by cancelling their handles; provide
  cooperative termination or a separately managed worker lifecycle where required.
  Keep CPU-heavy work off async workers and limit its parallelism.
- Do not hold blocking locks across await points. Keep critical sections short;
  use asynchronous synchronization where waiting must yield to the runtime.

When these paths are implemented, test saturation/backpressure, deadline expiry,
client disconnects, task failures, resource/lease cleanup, and shutdown with active
work. Check for leaked tasks and duplicate upstream execution or billing.
The current scaffold's runtime setup alone does not satisfy these future checks.

## Code and data
Do not block Tokio worker threads. Bound CPU-heavy spawn_blocking workloads.
Never log authentication materials. Design secret storage and encryption explicitly.
Append schema migrations; do not edit already-released migrations.
Use strict TypeScript and explicit units for usage values.
Money uses fixed-point representation. Store timestamps in UTC and label display timezones.
Write documentation and agent instructions in English.

## Licensing and provenance
Project SPDX identifier: LGPL-3.0-only. Full terms are in LICENSE and COPYING.
Architecture references do not imply copied source.
When importing third-party code, retain authorship, source URL, revision,
original license, and modification notes in THIRD_PARTY_NOTICES.md.
Dependencies retain their own licenses; do not relabel them as LGPL.

## Additional project checks
python scripts/version.py check
python scripts/check_reports.py
python -m unittest discover -s tests/tooling -v
pnpm --dir web lint
pnpm --dir web exec playwright install chromium
pnpm --dir web test:e2e

See docs/RELEASING.md for version preparation and docs/DEPLOYMENT.md for Compose.
Historical source attachments in reports/source-archive retain their original
language; all maintained documentation and analysis summaries are English.

## Public interface and design previews
The Vite server exposes `/` and `/login`, plus development-only `/test.html`
and `/preview.html?view=user` or `?view=admin`. Only index.html is a production
entry. The login presentation does not submit until an authentication API exists.
Do not promote the dashboard fixtures into live management routes.
The server explicitly serves index.html on `/login` so direct navigation works;
unknown APIs and static files retain their 404 behavior.
