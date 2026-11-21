# ADR 0017: Tenant-owned model key authority

Status: accepted for the model credential cutover. Database and concurrency
acceptance remain unverified while tests are skipped at the user's request.

## Decision

Extend `client_api_keys`, the existing owner of key IDs, upstream-cost budgets,
plugin references and request history. Do not introduce a second credential
catalog. Migration 0036 rejects a nonempty unused `identity_model_keys` table
before removing it. Existing migration bytes remain frozen.

Each usable credential has an immutable tenant, customer user, single authorized
account group and wallet billing source. Customers manage their own keys through
the browser identity session. Management commands require an explicit target
tenant/user, current permission and an audit reason. PostgreSQL revalidates the
session, owner and grants inside the command transaction.

The secret contains 256 random bits. Persistence receives SHA-256 verifiers and
a nonsecret prefix; snapshots contain policy only. Creation and rotation disclose
the secret once. Actor/action-scoped idempotency receipts bind the target owner
and a payload fingerprint, never a recoverable secret. A repeated payload returns
the original resource's current metadata without disclosing a secret; a changed
payload or target owner conflicts.
Rotation revokes the previous row and inserts its replacement atomically. Revoked
rows cannot be restored. Revocation retains historical usage and budget facts.

Imported keys have no trustworthy customer owner. Migration disables them and
records their previous enabled state in an explicit pending-assignment inventory.
An operator with a platform grant must select the tenant, customer, name,
positive admission limits and one granted group;
no default tenant or group is inferred. IDs and history remain intact. This
quarantine is an explicit cutover state, never an authentication fallback.

Core depends on the portable asynchronous `ModelKeyAuthority` port. PostgreSQL
authenticates a presented digest and supplies tenant/user/key generations.
Snapshots cannot prove that a credential is active. Execution carries these
facts and requires policy/key generations to agree; a stale policy snapshot
fails closed after a key policy change. Execution rechecks authority at logical
operation and dispatch boundaries,
including queue resumption and retries. Revocation and authorization decisions
serialize through database locks. Previously authorized work may already have
executed; cancellation does not prove nonexecution.

Long-lived live sideband sessions carry the same execution guard. The provider
rechecks before dialing and after connection-capacity waits. The API relay checks
before forwarding frames in either direction and runs an independent watchdog,
sharing a five-second freshness window to bound database load per connection.
Each authority lookup has a five-second deadline; revoked keys close both sides
with policy code 1008, and unavailable authority closes with 1011. Revocation
therefore reaches an idle session within at most ten seconds under a responsive
process, while authority outages fail closed. This bound does not imply that
work already accepted by the upstream has been undone.

Private group eligibility requires an explicit customer grant. Removing that
grant revokes bound keys in the same transaction. Provider inventory remains a
platform resource. Plugin installation is not customer delegation: the unscoped
`host.keys.ensure` issuance path is removed from the SDK and host. A key ID alone
does not prove tenant authority.

## Consequences

Plaintext reveal, raw-key configuration responses, global key mutation routes,
custom caller-supplied secrets and snapshot secret matching are replaced rather
than retained as aliases. Existing internal nonsecret catalog and upstream-cost
budget operations do not authorize customer browser access or model execution.

Wallet binding identifies the future charging owner; it does not implement
retail pricing, precharge or settlement. Those remain the separate financial
workflow in [Billing and Pricing](../BILLING_AND_PRICING_DESIGN.md).

Before an upgrade, take a restricted backup and record the pending-assignment
inventory. A database backup taken before the cutover still contains old secret
columns and needs the same protection as credentials. Application rollback does
not restore removed columns or undo the schema. Recovery must use an isolated
database restore and a compatible executable, never modified migration checksums.
