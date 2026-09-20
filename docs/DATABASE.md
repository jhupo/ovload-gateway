# Database versioning and recovery

## Current implementation
SQLx embeds `crates/ovload-server/migrations/*.up.sql` and `*.down.sql` into the
binary. `_sqlx_migrations` records versions, descriptions, SHA-384 checksums,
success, installation time, and execution duration. PostgreSQL advisory locking
serializes migration runners; each migration uses its transaction by default.
Never edit an applied migration. Add a new numbered pair with reviewed SQL.
Only the infrastructure metadata baseline exists today, not accounts or billing.

`serve` applies pending migrations before opening its listener. A checksum mismatch,
unknown applied version, dirty history, or SQL error aborts startup. Redis must also
respond before serving traffic. `/healthz` is liveness; `/readyz` checks both stores.
CLI commands use DATABASE_URL and do not need frontend assets or Redis:

```sh
docker compose run --rm --no-deps gateway schema-status
docker compose run --rm --no-deps gateway migrate
```

## Application updates
Record the prior image digest and schema version. Stop all gateway replicas before
the database backup. Keep PostgreSQL and Redis running. Change only OVLOAD_VERSION,
pull only gateway, and recreate only gateway with `--no-deps`. A failed update does
not automatically revert a schema. Inspect migration status using the new image.
Never use an old binary to revert migrations it does not contain.

## Backup and explicit downgrade
Run from deploy/ in a POSIX shell; execute backup commands separately and stop on error.
Use a new backup directory per operation, restrict access, and keep an off-host copy.

```sh
docker compose stop gateway
mkdir -m 700 backups/upgrade-YYYYMMDD-HHMMSS
docker compose exec -T postgres pg_dump -U ovload -d ovload -Fc > backups/upgrade-YYYYMMDD-HHMMSS/ovload.dump
docker compose exec -T postgres pg_restore --list < backups/upgrade-YYYYMMDD-HHMMSS/ovload.dump
```

Create the parent backups directory first if necessary. Listing an archive checks its
structure, not its restorability: perform a restore into an isolated database before
relying on it. PowerShell users should avoid native binary-output redirection on old
PowerShell versions; dump to a file inside postgres with `pg_dump -f /tmp/ovload.dump`
and copy it out using `docker compose cp postgres:/tmp/ovload.dump BACKUP_PATH`.

After stopping all writers, verifying the backup, and reviewing the release-specific
down migrations, run the **new/current image** with the prior schema version:

```sh
docker compose run --rm --no-deps gateway schema-revert PRIOR_SCHEMA_VERSION --confirm
```

Then restore OVLOAD_VERSION to the previous application release and start only gateway.
Version 0 means an empty schema. Revert refuses invalid targets, unknown versions,
changed checksums, and dirty migration records. Down SQL must explicitly refuse
unsafe destructive downgrades when no lossless reversal exists; in that case restore
the verified pre-upgrade backup into an isolated database and switch the deployment
after validating it. Never silently discard post-upgrade writes.

An image rollback alone is insufficient after an incompatible schema change. There
is no automatic fallback schema or dual implementation. PostgreSQL major upgrades
require pg_upgrade or dump/restore and their own maintenance window; changing its
image tag is not an application upgrade. Redis AOF is persisted independently; never
flush lease state during an application update. Future Redis key formats must carry
explicit schema namespaces and an expiry/migration plan.

## Verification
The CI storage job runs real PostgreSQL migration tests for fresh install, repeated
startup, downgrade/re-upgrade, checksum tampering, and unknown newer versions.
Docker CI exercises the complete topology, readiness, and gateway-only recreation.
Local machines without Docker/PostgreSQL cannot claim these integration checks ran.

Migration sessions close after use, including failures/cancellation, so advisory
locks never leak back into the runtime pool. Revert validates history under its lock.
