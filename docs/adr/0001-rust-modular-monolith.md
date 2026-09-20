# ADR 0001: Rust Modular Monolith

Status: accepted. Date: 2026-09-19.

## Context
The gateway prioritizes concurrent streaming, controlled memory usage,
explicit transport implementations, and independent provider integrations.

## Decision
Use Rust, Tokio, and Axum. Use Tower for common request middleware.
Use Tokio's multi-thread runtime and Rust async/await for coroutine-like task
concurrency and nonblocking I/O. Bound task admission and streaming buffers;
the executor owns operation deadlines, cancellation, and child task cleanup.
Supervise background tasks and define bounded shutdown behavior. Isolate blocking
and CPU-heavy work from runtime workers with explicitly limited concurrency.
See ARCHITECTURE.md and DEVELOPMENT.md for task lifecycle requirements and the
distinction between the current runtime scaffold and planned provider execution.
Start with one backend process and explicit module boundaries.
Use Vue/TypeScript with OpenAPI-generated API types as APIs are implemented.
Provider transports may use different networking libraries when justified.
Matching implementation languages does not establish matching wire fingerprints.

## Consequences
Async ownership, cancellation, state machines, and dependency management require
careful engineering. Model-generated code still requires review, failure tests,
and real protocol samples.
Extract modules only when real functionality needs them.

## Alternatives
Go is also a suitable gateway language.
This new project chooses Rust to prioritize transport control without incurring
the migration cost of rewriting an existing application.
