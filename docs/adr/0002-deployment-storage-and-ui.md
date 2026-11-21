# ADR 0002: Application image, stateful services, and UI primitives

Status: accepted. Date: 2026-09-19.

## Decision
Distribute one application image containing the Rust server and compiled frontend.
Axum/Tower serves static assets; PostgreSQL and Redis run in independent containers
with independent named volumes and version pins. Application updates must target
only the gateway service. Infrastructure upgrades are separate maintenance work.

SQLx owns embedded, ordered, checksummed PostgreSQL migrations and advisory locks.
Startup applies upgrades before binding the HTTP listener. It never performs
automatic downgrades. Operators stop writers and take a verified backup before
explicitly reverting a schema with the currently installed application image.
Unsupported newer schemas or changed migration history cause startup to fail.
Redis is not a durable source of truth; no-eviction protects future lease state.

Use the shadcn-admin foundation: shadcn/ui primitives, Tailwind semantic tokens,
TanStack Router, and its shared theme and layout providers. Prefer library
primitives over handwritten controls or unnecessary wrapper layers. The existing
component and route tests exercise the actual library imports before product use.

## Consequences
One image controls frontend/backend version alignment. The process requires healthy
PostgreSQL and Redis in deployed mode, and /readyz probes both. Explicit loopback-only
preview mode supports UI development without claiming runtime dependency health.
Database rollback is a maintenance operation and can lose data; release-specific
migration review and backup restore tests remain mandatory. Model forwarding,
billing, a web-based updater, and business schemas are not implemented by this ADR.
For the accepted blue/green production release contract, ADR 0012 supersedes the
single-slot application replacement and startup-migration behavior described here.
The current Compose implementation still follows this ADR's original single-slot
behavior until the role and release protocol is implemented.
