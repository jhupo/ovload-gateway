# ADR 0007: Backend module boundaries and composition

Status: accepted; package layout revised 2026-10-27. Original date: 2026-09-21.

## Context

The first infrastructure slice established bounded execution and durable jobs, but
server startup also parsed commands, ran SQL, assembled HTTP and supervised tasks.
Database, Redis and worker modules occupied the same flat namespace. A general
boxed error was owned by the job adapter and imported by unrelated modules.

## Decision

Use one root Cargo package, `ovload-gateway`, with all backend modules under
`src/`. `src/core` owns portable contracts, `src/runtime` owns bounded execution,
and application, infrastructure and entrypoints retain separate directories.
This revises the original three-package layout following the user's explicit
single-package requirement. No old crate aliases or duplicate module paths remain.
Add a trait or another package only for an actual consumer or independent build
boundary.

Within the server, entrypoints parse/present, application modules orchestrate,
infrastructure modules own storage protocols, and bootstrap owns construction.
Process signal handling and supervision belong to lifecycle, not the generic
runtime. Application workflows receive application-owned behavior ports; they
cannot import concrete infrastructure, SQL/Lua, entrypoints or HTTP response
types. Infrastructure implements those ports and may import their contracts,
but cannot import entrypoints, bootstrap or lifecycle. The operator CLI receives
one constructed maintenance adapter; database handles stay inside that adapter.
The composition root is the only owner of constructing the complete dependency
graph.

Configuration separates process execution, worker policy and storage capacities.
Workers receive constructed stores and their own settings, not process settings.
Expected storage failures have a typed infrastructure error; boxed errors are
reserved for the outer process boundary. SQL queries and atomic Lua scripts live
beside their adapters. Applied migrations retain their paths and checksums.

Public runtime exports are the deliberate module API; implementation modules are
private. Callers use the owning module directly. Remove superseded
paths and the implicit-default database connection wrapper; do not keep aliases.
The CLI is parsed into an exhaustive command enum before accessing dependencies.
Preview is an explicit stateless mode, with no dummy background worker.

## Consequences and validation

The directory map in BACKEND_STRUCTURE.md is the implementation contract.
`tests/architecture_contract.rs` uses the established `syn` Rust parser to check
production module declarations, direct imports and qualified paths. It skips
`cfg(test)` items and checks explicit macro paths, but cannot expand arbitrary
macro token bodies. Rust compilation enforces visibility and type contracts;
the syntax check does not replace code review. Future
provider work adds modules when implemented, not empty speculative directories.
Existing queue, lease, migration and HTTP contracts must survive this refactor.
Exercise real PostgreSQL/Redis integration, command argument rejection, startup
and shutdown. No migration or replay-policy change is part of this decision.
