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

Use PrimeVue styled components with an Aura-based theme and shared semantic tokens.
Prefer library primitives over handwritten controls or unnecessary wrapper layers.
The component lab exercises actual library imports before product adoption.
The prior plan to introduce Reka/shadcn is superseded; do not keep two UI libraries.

## Consequences
One image controls frontend/backend version alignment. The process requires healthy
PostgreSQL and Redis in deployed mode, and /readyz probes both. Explicit loopback-only
preview mode supports UI development without claiming runtime dependency health.
Database rollback is a maintenance operation and can lose data; release-specific
migration review and backup restore tests remain mandatory. Model forwarding,
billing, a web-based updater, and business schemas are not implemented by this ADR.
