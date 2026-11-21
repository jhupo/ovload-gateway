# ADR 0016: Durable browser identity authority

Status: accepted for the identity session and customer-provisioning slice.

## Decision

The new `/api/v1` customer and `/api/admin/v1` identity handlers use a separate
`IdentityService` and `IdentityStore` port. Their credentials never authenticate
the imported management routes. Imported administrator, model-key and internal
plugin credentials never authenticate the new identity routes. These are
different resource surfaces, not aliases or alternate verifiers for one route.
Migrating the remaining imported resources requires replacing their callers
and authorization together. No automatic mapping of old records is performed.

An operator explicitly provisions the first management principal with the
`identity bootstrap-owner` CLI and a bounded password file. A transaction locks
the principal catalog, refuses any existing principal, creates an explicit
platform grant and records audit. Starting HTTP never creates this owner.

PostgreSQL owns sessions, authentication budgets and authorization. Every
session lookup joins active owner/tenant state and verifies the current
authority generation. Protected management commands check the live session,
principal, permission and explicit platform/tenant scope within their
transaction. Customer suspension and session revocation commit atomically,
serialized with session issuance. Redis and runtime snapshots cannot extend
this identity access. User revision currently fences customer sessions; profile
mutation is not included in this slice.

Sessions expire absolutely after twelve hours, at most ten per principal.
Access secrets contain 256 random bits; only their SHA-256 digests persist.
There is no manual session enumeration, revocation or credential rotation API.
Sign-out revokes the current session; password and account security events still
invalidate affected sessions internally. The removed manual rotation path has
no refresh credential, cookie or runtime storage field. An append-only migration
removes its digest column without changing earlier migration checksums.
The same migration retires the unused `identity.sessions.manage` permission.
It records before/after evidence, revokes grants that lose their only permission,
preserves empty historical roles as unassignable, and retires affected pending
requests without inventing an approving operator. A new request must use the
current role revision. Existing approval
decisions retain their decision metadata. Normal role writes require nonempty
permissions, and a historical empty role cannot produce a new grant request.
CSRF tokens are HKDF-SHA256 outputs derived from the random access
secret with the distinct `ovload-identity/csrf/v1` label. This lets GET session
recover the token without plaintext storage or an encryption key. The persisted
CSRF digest is metadata, not an independent authentication mechanism.

Cookies use separate customer/management `__Host-` names, Secure, HttpOnly,
SameSite=Strict and path `/`. Writes require one exact configured HTTPS public
Origin; authenticated writes also require one CSRF header. Forwarded headers
never establish the Origin or network budget identity. The public Origin is a
required configuration field. There is no insecure-cookie fallback for HTTP.

Argon2id work uses at most four blocking tasks, with permits retained until the
work actually finishes even if its caller is cancelled. Authentication consumes
durable fixed-minute global/network/account budgets before password lookup.
Unknown accounts still perform password verification against a random dummy
hash, and audit uses a null actor rather than recording an unknown email.

## Scope and verification

This slice includes explicit owner bootstrap, management/customer sign-in,
current-session inspection and sign-out, own customer profile, management user
provision/read/list and activate/suspend. Provisioning atomically creates a
tenant, a zero-USD wallet, a user and audit. It does not expose retail charging,
self-registration, password recovery, model-key issuance, grant approvals,
provider execution authorization or frontend sign-in integration.

Frontend revalidation publishes the verified session, matching profile and live
management grants as one snapshot. Navigation and intent preloading must not
clear the displayed grants while that snapshot is loading. Route authorization
still waits for the live result; request failures surface normally, and an owned
401 invalidates the session. This prevents the sidebar from briefly collapsing
to its unrestricted help entry without extending backend authorization.

The user has requested that tests remain skipped. Static compilation and
format/diff checks do not prove database concurrency, migration recovery or
browser security. Those guarantees require isolated integration acceptance
before production use.
