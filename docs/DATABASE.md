# Database versioning and recovery

## Imported schema history

SQLx embeds the numbered SQL files under src/migrations, currently through 0050. The directory also
retains .frozen-sha256. Preserve existing bytes, including comments and whitespace.
Append migrations after the latest frozen entry; the removed backend's up/down migration pairs are
not the active history.

Store startup applies pending migrations before listening. SQLx verifies applied
checksums and serializes migration runners. Configuration, migration, and
checksum failures abort startup. Never change stored checksums to bypass failure,
silently downgrade, or combine the different backend implementations' histories.

Migration 0049 adds a versioned `site_settings` singleton and one versioned
`identity_profile_avatars` row per authenticated owner. Customer ownership has
a composite user/tenant foreign key; principal ownership has its own foreign
key and exclusive owner check. Images are bounded canonical PNG bytea values
with dimensions checked in storage. Site identity and avatar revisions never
change provider snapshots or credential generations. Database backups include
images; there is no separate upload directory to reconcile. See
[ADR 0030](adr/0030-site-and-personal-settings.md).

Migration 0050 adds versioned registration policy, immutable consent evidence,
one-time registration gifts, OAuth state/external identities, and leased email
notification delivery. SMTP credentials and OAuth client credentials are
deployment configuration, not database policy. Notification payloads remain
encrypted under the separately backed-up identity notification key. See
[ADR 0031](adr/0031-registration-login-and-consent.md).

Current tables cover provider accounts, client keys, configuration, plugins,
observations, and upstream USD cost budgets. Migrations 0034/0035 add customer
tenants, zero-USD wallets, users, management grants, durable sessions,
authentication budgets and identity audit. Subscription reservations require
further migrations; retail price books and ledger storage are introduced by
migration 0037 below. Real-database
identity/migration acceptance has not been run under the user's current test
instructions.

Migration 0036 consolidates model credentials in `client_api_keys`, backfills
verifiers/prefixes, removes plaintext and rejects a nonempty unused
`identity_model_keys` catalog. Imported keys are disabled in an explicit pending
assignment inventory with their previous enabled state and group evidence.
Management must assign an owner and one granted group before a key can execute.
No automatic tenant assignment or plaintext authentication path survives.
Existing IDs, budget and history references are retained; revocation replaces
hard deletion. New request records freeze tenant/user/key authority facts.
See [ADR 0017](adr/0017-model-key-authority.md) before upgrading or recovering.

Migrations 0040..0043 add platform security roles/approval evidence, global and
customer/user/key admission ownership, independent registration policy and
encrypted single-use challenges, separate customer authority generations, and
the new management audit actor. They do not create team membership. Preserve
all migration bytes and require backup/upgrade validation before release.
These migrations have not been applied to a real database in this change.

Migration 0044 adds private/public channel-group policy, exact model mappings,
and fixed-point retail multipliers. Migration 0046 updates the financial guard
to verify that multiplier before freezing a new reservation. Existing frozen
financial evidence is preserved.

Migration 0045 requires encrypted upstream credential envelopes. Before serving,
Store loads `store.provider_credential_key_file` (exactly 32 raw bytes), converts
historical plaintext under an exclusive account-table lock in bounded batches,
verifies envelopes, and validates the constraint in one transaction. The startup
operation has a 120-second bound and can fail on large inventories; it is not
an uninterrupted online migration. Missing/wrong keys or malformed envelopes
abort startup. There is no runtime plaintext read fallback. Retain the key
separately from database backups, and protect old backups containing plaintext.
See [ADR 0026](adr/0026-upstream-credential-storage.md). These upgrades remain
unverified against a live database under the current test instruction.

## Financial authority

Migration 0037 adds tenant wallet holds, append-only ledger/credit receipts, and
retail price, reservation, dispatch/usage evidence, and reconciliation tables.
Existing positive wallet projections receive one opening ledger credit without
changing the balance. Future opening credits are rejected. The wallet API
commits an operator credit, idempotency command, original balance snapshot, and
identity audit in one transaction, after rechecking live tenant-scoped grants.
The ledger's AFTER INSERT trigger owns the settled balance projection;
reservation transitions own the held projection. Store callers must not adjust
either projection separately. The AFTER trigger only runs for inserted rows,
so a skipped conflicting insert cannot alter the wallet balance.

Migration 0038 adds a singleton retail catalog with a positive generation,
revision row versions/sequence allocation, and append-only idempotent management
commands. PostgreSQL-backed management callers create complete drafts, seal
their canonical digests, validate bounded stored documents, preview samples,
publish immediately and retire. Platform authorization, catalog/revision locks,
command evidence and audit share each transaction. The catalog lock is acquired
in its own statement before validating published state, so a lock wait cannot
reuse an earlier statement snapshot. Catalog generation and target row version
are both checked before a new transition; authorized identical replays are
resolved first.

The added guards require clean draft insertion, one-time sealing, exact version
advancement, and immutable child identities/content after sealing. This also
closes child reparenting paths. Deferred catalog consistency checks permit the
atomic old-retirement/new-publication sequence while rejecting a mismatched
final pointer. Database time sets immediate publication; scheduled publication
is unsupported. Existing frozen migrations remain unchanged. See
[ADR 0019](adr/0019-retail-price-publication.md).

Migration 0039 adds immutable request/owner fingerprints, authority generations,
catalog/route facts, operation versions and database expiry to the internal
funds lifecycle. Direct PostgreSQL commands atomically select a published tariff,
quote/reserve funds, register fresh dispatch permission, append monotonic evidence
and complete or retain the hold. They are independent of buffered request
observations. Operation reads are tenant-scoped with live session/grant checks.

Only proven not-sent attempts may precede another dispatch attempt. Sent and
not-sent evidence cannot contradict each other; ambiguous evidence may resolve.
Exact component fractions belong to the selected frozen card. System resolution
of reconciliation cases and deferred final-state checks retain receipt/ledger
consistency. A bounded supervised worker marks expired holds for reconciliation
without refunding, provider calls or execution retries. Wallet locks precede
reservation/evidence/case locks. See
[ADR 0020](adr/0020-retail-funds-transactions.md).

Because execution was never activated under 0037/0038, migration 0039 refuses
nonempty reservation storage rather than inventing missing historical authority
or request fingerprints. Existing wallet credits and frozen migration bytes
remain intact. Resolve that explicit precondition with verified financial
history before upgrading an installation containing manually created reserves;
never delete the rows or bypass the check.

The complete request billing workflow has not been activated. Migrations 0037
through 0039 have not been applied to a real database or validated with concurrency/recovery
tests under the user's instruction to skip tests. Do not infer release readiness
from static checks or schema definitions. See [ADR 0018](adr/0018-customer-usd-billing.md).

The target uses checked USD fixed-point amounts with ten decimal places.
Procurement cost and retail charge are separate facts. PostgreSQL transactions
must atomically reserve, settle, release, and reconcile; a process-local
pending-cost queue cannot own customer funds.

Use tenant-scoped queries/foreign keys, stable row-lock ordering, unique
business/operation idempotency keys, immutable evidence, and fenced recovery.
Financial facts must survive API-key deletion or deactivation.

## Updates, backups, and recovery

Online update retains the imported application replacement/restart flow.
PostgreSQL and Redis remain independent persistent services. Application rollback
does not undo schema changes. Never flush Redis, remove persistent volumes, or
automatically downgrade when startup fails.

Capture restricted-access backups before upgrade/restore. Checking an archive's
listing does not prove restoration; run isolated recovery drills. PostgreSQL
major upgrades are separate maintenance. Do not overwrite a live database for
a test. The former scaffold's schema-status and schema-revert commands do not
exist in the current CLI.

## Validation

Verify every SQL file against .frozen-sha256, rejecting missing, extra, changed,
or duplicate registrations. With disposable PostgreSQL, verify fresh install,
repeated startup, upgrade from the prior published history, lock contention, and
backup/restore.

Imported Store tests use CPR_TEST_DATABASE_URL and CPR_TEST_REDIS_URL and isolate
their schemas/key namespaces. Missing services may return early locally and fail
explicitly in CI. A local offline pass is not database verification.
Deployment/release automation must be adapted before being described as tested.
