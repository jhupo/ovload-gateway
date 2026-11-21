# ADR 0014: Backend workspace and composition boundaries

Status: superseded by [ADR 0015](0015-imported-backend-baseline.md)

Date: 2026-10-27

## Context

This document records the earlier extraction plan. The user subsequently replaced
the entire backend with an upstream copy. Its implementation and OVL assumptions
do not describe the current source tree; ADR 0015 defines the active baseline.

The requested source organization now follows the responsibility categories of
codex-proxy-rs, adapted to Ovload. This supersedes the single-package layout in
ADR 0007 and the physical paths in ADR 0008, without changing their encapsulation
or domain safety requirements. A crate is a compile-time boundary, not a process.

Reference inspected at commit `86a27bed9493feb3096baac86ac246463d794411`:
https://github.com/zyycn/codex-proxy-rs/tree/86a27bed9493feb3096baac86ac246463d794411/backend

## Decision

- The repository root is a virtual Cargo workspace. `src/apps` is the application
  package with `src` and `tests`; it owns composition and operator commands.
- `src/crates/core` owns portable values in `domain`, bounded mechanisms in
  `runtime`, and request/billing/job workflows with injected ports. Domain cannot
  import runtime or workflows; runtime cannot import domain or workflows.
- `src/crates/admin` owns identity, routing administration, commerce, rewards,
  operations, and their repository/security ports. It depends on core contracts.
- `src/crates/api` owns HTTP contracts, authentication input translation, and
  response encoding. It depends on core/admin, never concrete adapters.
- `src/crates/store` owns PostgreSQL, Redis, migrations, transactional payment
  configuration, and persistence-backed credential/transport resolution.
- `src/crates/host` owns validated environment settings, process lifecycle,
  bounded filesystem/network mechanisms, cryptography, images, and mail adapters.
  It cannot depend on the store or concrete providers.
- `src/crates/protocol` owns implemented semantic converters. Protocol identity
  remains portable and provider independent in core domain contracts.
- `src/crates/providers/openai` owns the concrete OpenAI adapter and pinned wire
  contract. Credentials and account-bound transport are injected; it has no SQL,
  account selection, or independent retry loop.
- `src/migrations` contains the existing SQLx history, moved without byte changes.
  Shared integration tests remain in `tests`; package tests live beside owners.

Only the application depends on all concrete libraries. Dependency manifests and
architecture tests enforce these directions; old module trees and import aliases
are removed rather than retained as compatibility layers.

## Preserved business contracts

Ovload retains tenant/customer ownership, immutable OVL pricing and ledger entries,
pre-dispatch reservation `max(2 * last_positive_actual_charge, verified_cost_bound)`,
unknown-usage reconciliation, atomic multi-scope admission, and independent
infrastructure deployment. The reference's API-key budget accounting and
single-replica assumptions do not replace these contracts. No additional protocol
or provider is considered implemented because its directory exists in the reference.

SQLx and Redis scripts remain encapsulated store implementations. Adopting a
workspace does not change database isolation, lease fencing, or migration checksums.
No reference source is copied as part of the structural extraction; any later
source reuse must preserve its Apache-2.0 attribution and applicable notices.
