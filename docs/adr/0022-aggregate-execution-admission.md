# ADR 0022: Aggregate execution admission

Status: accepted for implementation.

## Context

An independent customer may own several model keys. Per-key Redis counters alone
allow those keys to exceed a customer's aggregate request capacity. `tenant_id`
is the internal independent-customer partition, not an organization or team.

## Decision

Each logical root model execution acquires platform, customer partition, user and
key concurrency and rolling 60-second request capacity in one Redis script.
All scope keys share one Redis hash slot. Every limit is positive and bounded;
zero does not disable an aggregate ceiling. PostgreSQL supplies current customer,
user and key limits after validating the frozen owner and authority generations.
Platform limits are explicit Store startup configuration with defaults of 1,000
concurrent executions and 60,000 requests per minute. Customer defaults are 100
and 6,000; user defaults are 20 and 1,200.
All replicas serving a shared coordination namespace use the same platform
configuration. Request-local key limits can tighten the live key ceiling but
cannot raise or disable it.

Admission first removes expired members, checks every scope, then writes every
scope. A rejection consumes no request count and holds no partial capacity.
Request IDs identify logical executions, so provider retries neither reacquire
customer capacity nor count another customer request. An already admitted live
request is idempotent. Releasing concurrency never refunds RPM. Renewal succeeds
only while the request exists unexpired in every scope; losing one scope cancels
the execution instead of reconstructing partial permission. Cancellation and
normal completion release every scope atomically; failed cleanup converges by
the bounded lease TTL. Redis or PostgreSQL authority failures fail closed.

The existing bounded per-key waiting mechanism remains the queue owner. It does
not promise cross-customer or cross-replica fairness. Sideband control connections
continue to attach to an existing authorized live call without creating another
logical model execution. Live identity checks and account capacity remain
separate requirements.

Startup recovery restores all four scopes using immutable request ownership and
idempotent request IDs before opening the listener. Nested executions follow the
existing bounded execution graph rather than consuming root RPM again. Historical
records without ownership are not attributed to a current customer; migration
requires any recent or running unowned history to be reconciled first.
The immutable `owns_client_admission` request fact distinguishes root admission
from child observations. Migration initializes existing facts from the recorded
server admission decision; new inserts bind the fact explicitly.

## Limits

This change enforces execution concurrency and logical request RPM. It does not
enforce TPM, retail precharge, monetary budgets, provider quota, distributed fair
queuing, or durable recovery of admissions not yet recorded in PostgreSQL. Redis
remains required shared coordination state and must use persistent deployment
and recovery practices. Real Redis/PostgreSQL failure and concurrency acceptance
has not been run under the current instruction to skip tests.
