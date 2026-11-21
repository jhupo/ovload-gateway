# ADR 0019: Immutable retail price publication

Status: implemented management boundary; database acceptance pending. This completes the price source
boundary from ADR 0018; it does not activate request charging.

## Decision

Retail pricing has its own admin service and persistence port, independent of
wallet funding and provider procurement-price settings. Every operation checks
a live platform-scoped `billing.read` or `billing.manage` grant inside its
PostgreSQL transaction. Tenant grants cannot read or modify the shared catalog.

A draft is submitted as one complete document with at most 128 cards and the
finite Core usage-dimension vocabulary. Each card explicitly prices every text
dimension, including free rates. A group/model override replaces all platform
tiers for that model and prices the same dimensions in each tier. Selection
checks the group/model override before selecting a tier; there is no partial
inheritance. Public model IDs are exact literals, not provider model aliases.

The first publication contract supports only one `always` band: UTC, every day,
00:00 through 24:00, and the complete context interval `[0, unbounded)`.
Scheduled publication, time-window pricing and context tiers are not accepted.
Creating a media rate does not assert provider support or enable media billing.

Creation inserts all rows and seals the draft with a SHA-256 digest in one
transaction. The digest covers a versioned canonical document: stable selector
and dimension ordering, canonical USD decimal strings, explicit denominators,
USD currency/scale, and complete supported context/time selectors. Database row
IDs and mutable lifecycle metadata are excluded. Sealed content cannot change;
editing produces a new complete draft. The publication path rehydrates bounded
rows, validates the document and recomputes its digest before changing state.
Unknown, missing, duplicate or unsupported rows fail closed.

An explicit singleton catalog serializes creation, publication and retirement.
Its positive generation advances on each mutation. Creation requires the
catalog's strong If-Match generation. Publication and retirement require the
target detail's strong If-Match tag (`"<catalog_generation>.<row_version>"`)
plus the matching expected catalog generation in the body. Collection tags and
creation preconditions use `"<catalog_generation>"`. Detail, validation and
mutation responses share one representation; `Idempotency-Replayed` is a
mutation response header, not a body variant.
Publication retires the previous revision, publishes the new revision with the
database's current UTC timestamp, advances the catalog pointer/generation, and
records audit and an idempotent command atomically. There is no scheduling gap.
Explicit retirement clears the pointer; new price lookup then fails unavailable.
Old revisions remain available for existing frozen operations.

Commands bind the principal, action, Idempotency-Key and complete payload
fingerprint. Replays recheck live authority before returning the same revision's
current metadata; they never repeat the transition. Changed payloads conflict.
Replay is checked before stale preconditions, permitting recovery from a lost
successful response. GET retrieves the current catalog and row versions.
Lock ordering is principal/session/grant, catalog, then price revisions.
No provider call, process-local acknowledgment or runtime configuration cache
is part of publication. The PostgreSQL generation is the publication token.

## API Boundary

Management routes live below `/api/admin/v1/pricing/revisions`: GET collection
and item, POST complete draft, POST item `validate`, `preview`, `publish` and
`retire`. Mutation inputs are strict, reasoned and idempotent. Lists use bounded
descending revision-number cursors. These routes allow 512 KiB bodies; unrelated
identity routes retain their 32 KiB limit.

Validation verifies stored content integrity. Preview selects a complete card
and calculates a supplied sample usage with an explicit sample multiplier. It
returns exact component fractions and one half-even rounded USD total, without
dispatching, reserving funds, or treating sample quantities as verified bounds.
Preview does not resolve customer/group multipliers from business settings.

## Consequences

Append migration 0038; preserve all previously frozen migration bytes. Use real
PostgreSQL-backed API callers and the existing fixed-point/rational Core
calculator. Retain separate provider price settings. Execution reservation,
provider-bound verification, authoritative usage settlement and reconciliation
remain separate activation work. The user's instruction to skip tests leaves
database, race and recovery acceptance unverified; static checks are not that
acceptance.
