# ADR 0026: Encrypted upstream credentials

Status: accepted for the live upstream configuration flow.

## Decision

Store owns AES-256-GCM encryption of provider credential documents using the
existing ring library. The configured `store.provider_credential_key_file`
contains exactly 32 raw bytes, is loaded before database initialization, and
must be preserved separately from database backups. Missing or invalid keys
prevent startup. The key is never persisted in PostgreSQL or emitted in logs.

Every import, authorization completion, replacement and automatic refresh uses
the same cipher. Each envelope has a fresh random nonce and authenticates the
account ID. Reads reject malformed, plaintext or unauthenticated envelopes;
there is no plaintext runtime fallback. Ordinary management HTTP APIs are
write-only for credentials, including removal of credential export.

## Upgrade and recovery

Migration 0045 adds an envelope constraint without validating historical rows.
Before exposing any runtime ports, Store holds an exclusive account-table lock,
converts historical plaintext documents in bounded batches, verifies encrypted
documents with the configured key, and validates the constraint. The conversion
and validation commit together. Failure rolls back the conversion and prevents
serving. Concurrent startup processes serialize on the same table lock.

Preserve restricted pre-upgrade backups: they contain plaintext credentials.
Application rollback does not remove the constraint or decrypt persistent data.
Restore into an isolated database with a compatible executable and the original
key. Losing the key requires explicit upstream reauthorization; never substitute
a new key silently. Rotation of the master key is a separate offline operation.

## Validation

Compilation and static analysis do not prove database migration, crash recovery,
or real provider authorization. Tests and live database operations remain
skipped under the user's session instruction.
