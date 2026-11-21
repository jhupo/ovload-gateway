# Database Restore And Image Storage

The data backup workspace retains its storage and schedule tabs. Backup storage,
cron scheduling, retention, manual exports, downloads and deletion use the backup
service. Security settings use the authentication service described in
[authentication security](AUTHENTICATION_SECURITY.md).

## Database Restore

Only completed, unexpired system-created backups with a recorded size and
SHA-256 digest can be restored. A management principal with
`security.settings.manage`, CSRF protection and any configured password step-up
must submit `POST /api/admin/settings/backups/restore` with
`{ "backupId": "...", "confirmation": "RESTORE" }`.

The response is HTTP 202 with `{id,ticket}` inside the normal management envelope.
The browser keeps the ticket in session storage and polls
`GET /api/backup-restore/status?id=...` with `X-Restore-Ticket`. The ticket is
random, never placed in a URL, and can read only this restore's non-sensitive
status for 24 hours. It cannot initiate or change a restore.

Restore requires the `public` schema and a single gateway instance. Stop other
gateway and worker instances and disconnect external database clients first.
The current process drains HTTP executions, workers and plugins, then closes
the runtime before restoring. Other database sessions cause restore to fail
before any overwrite. This mode is not a rolling multi-instance operation.

The service downloads the object using the saved backup storage, verifies size,
SHA-256 and gzip integrity, and creates a complete pre-restore safety archive at
`<runtime_data_dir>/backup-staging/restore/<restore-id>.before.sql.gz` (0600,
parent directory 0700). Safety archives are retained for operator recovery;
remove them after verifying the restored installation. At least the incoming
archive size plus 1 GiB of free staging space is required.

PostgreSQL `psql` executes schema replacement and the archive in one transaction
with `ON_ERROR_STOP`, using native COPY and pg_dump meta-command handling.
Migration versions and checksums must match this binary's known migrations.
An invalid SQL archive rolls the entire transaction back. Successful restore
revokes all saved login sessions and administrator bearer keys, then creates a
fresh application runtime so cached routing, policies and settings match the
restored database. Keep the installation's provider credential and notification
key files with the backup: database restore does not replace these external keys.

The runtime image includes PostgreSQL 18 `pg_dump` and `psql`. A custom runtime
must provide compatible clients on PATH. Passwords are passed through child
process environment variables rather than command arguments. Restore status is
stored outside the database. An interrupted restore is reported as failed and
requires checking the database before submitting again; a result timeout does
not claim the operation was cancelled.

## Asynchronous Image Storage

Image storage has independent endpoint, region, bucket, prefix and credentials,
an optional HTTPS public domain, and a presigned URL lifetime of 1 to 168 hours.
Credentials are encrypted at rest using the existing installation credential
key. Blank credential inputs preserve saved values. Saving settings invalidates
verification; the connection test performs Put/Head/Get/Delete against a probe
object. Enable the storage and pass this test before submitting jobs.

Send `Prefer: respond-async` to `POST /v1/images/generations` or
`POST /v1/images/edits`. Both JSON and the existing multipart edit inputs are
supported. HTTP 202 returns an image job with a `Location` header pointing to
`GET /v1/images/jobs/{id}`. Poll with the same active model API key. Other keys
cannot access the job, even if they belong to the same user. Normal synchronous
requests keep their existing behavior.

The asynchronous path invokes the existing execution, admission, usage and
billing machinery. It requests `b64_json` from the upstream and uploads PNG,
JPEG or WebP bytes to object storage. It does not fetch upstream image URLs.
Completed polling responses include `result.data[].url`, using either the
configured public domain or a freshly signed private URL. Requests are limited
to 32 MiB, responses to 90 MiB, decoded image data to 64 MiB and 10 images.
There are at most 16 running jobs globally and 2 per API key. Execution has a
15-minute deadline and result storage a 5-minute deadline. Graceful shutdown
marks interrupted jobs failed; after a crash, stale running jobs fail after
21 minutes. Provider execution may already have incurred usage if object
storage subsequently fails.

Jobs and images are retained for seven days. The existing backup maintenance
worker removes expired result objects, partial failed uploads and expired job
records in bounded batches. Changing storage identity is blocked while retained
objects exist; editing settings is blocked while jobs are running. A public
domain must already serve this bucket's keys with correct access policy.
Database backups contain object references, not copies of generated images;
restoring a database does not recover deleted image objects.
