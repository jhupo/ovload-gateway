# Identity and browser access contract

Status: implemented HTTP and persistence contracts, with static verification only.
Real PostgreSQL/Redis migration, isolation and concurrency acceptance has not
been run under the user's instruction to skip tests. See [API](API.md),
[ADR 0021](adr/0021-management-authority.md),
[ADR 0022](adr/0022-aggregate-execution-admission.md),
[ADR 0023](adr/0023-independent-customer-lifecycle.md), and
[ADR 0024](adr/0024-independent-customers.md).

## Product ownership

Ovload is an LLM distribution and relay service. Each independent customer owns
one customer partition, login, wallet, model keys and usage. `tenant_id` is the
internal customer isolation identifier. There are no organizations, shared team
wallets, membership invitations, member roles, departures or ownership transfers.
Platform management principals represent the service's operators. Customer-scoped
operator grants restrict support access to a particular customer; they are not
customer membership roles. Provider accounts and shared routing groups remain
platform inventory.

## Browser authority

Customer `/api/v1` and management `/api/admin/v1` use independent opaque sessions.
Model bearer keys, deployment keys and imported cookies cannot authenticate them.
Imported `/api/admin/...` resource routes now require a live management session
and the corresponding live platform permission. Unknown resource families deny
access. Internal plugins use declared capabilities, not browser administrator
context injection.

Platform resource authorization is decided at the live request check. Already
authorized in-flight platform operations may complete after a revocation;
subsequent requests are denied. Identity, security and customer financial writes
revalidate authority inside the owning transaction. This is not a guarantee that
revocation cancels side effects from an already authorized request.

Cookies use separate `__Host-ovload_customer` and
`__Host-ovload_management` access names, Secure, HttpOnly,
SameSite=Strict and path `/`. Browser use requires HTTPS. Writes require the
configured exact Origin and authenticated writes also require
`X-CSRF-Token`. Sign-in returns the CSRF token; GET session recovers it.
Session secrets use 256 bits of OS randomness and only SHA-256 verifiers persist.
CSRF uses domain-separated HKDF-SHA256 from the access secret. Passwords contain
12..256 UTF-8 bytes and use bounded Argon2id work. Sessions expire absolutely
after twelve hours and are capped at ten active sessions. Sign-in may replace
the current same-owner session atomically; it does not extend any other session.

Authentication consumes durable one-minute global/network/account budgets of
1000/30/10. Forwarded headers cannot define network identity. Responses are
no-store and nosniff. JSON rejects unknown fields, bodies are limited to 32 KiB,
workflows to fifteen seconds, and transactional statements to five seconds.
Errors use stable `error.code`, safe `error.message` and `request_id`, with
400/401/403/404/409/429/503 categories.

## Session and profile routes

These paths exist below both audience namespaces:

| Method | Path | Contract |
| --- | --- | --- |
| POST | `/auth/sessions` | Unified `login` plus password; the server resolves a customer email or management username and returns the authoritative audience |
| DELETE | `/auth/session` | Revoke current session and clear cookies |
| GET | `/session` | Current session and CSRF token |
| GET | `/profile` | Own customer profile or operator principal |
| POST | `/profile/password-change` | Current/new password and If-Match; revoke all sessions |

The browser sends `{ "login": "...", "password": "...", "consent_revision": 1 }`
to POST `/api/v1/auth/sessions`. It never sends a requested role or audience.
Customer email matching trims whitespace and ignores case; management usernames
retain their case. Both candidate passwords are checked with bounded Argon2id
work, using dummy hashes for missing records. Exactly one verified identity must
match. Ambiguous identical credentials and invalid credentials receive the same
401 without cookies. The returned `audience` determines the cookie and workspace;
management grants remain live backend authority. Customer login enforces the
current agreement; management login does not require agreement acceptance.
Existing namespace-specific `email` and `username` requests retain their scoped
behavior. All login forms share the same per-identifier attempt budget, and
relogin replaces only the matching owner's current audience session.

Customer PATCH `/profile` changes only `display_name` using If-Match.
There is no public active-session inventory, arbitrary single-session revocation,
or manual session rotation. These paths return the ordinary identity 404 rather
than aliases. Refresh credentials are not issued, parsed or stored. Migration
0047 removes the feature-exclusive refresh verifier without changing access
verifiers, session expiry, ownership or existing revocation evidence.
Current-session logout remains transactional. Password changes/reset, suspension
and security revocation retain their internal all-session invalidation.
The removed `identity.sessions.manage` permission is no longer accepted or
issued. Migration 0047 removes it from roles, grants and copied request bundles,
increments their revisions and appends system audit events with actual before
and after records. Mixed roles/grants retain their remaining authority. An empty role is
retained as historical evidence. Empty grants become revoked. Already approved/rejected requests retain
their original decision metadata. Every affected pending request becomes a
terminal `retired` record with a system reason and no invented approver,
including mixed bundles. Migration never silently changes an approval intent;
online role and approval configuration is now removed by ADR 0029.
No historical record or existing audit event is deleted. The request mutation
guard is suspended only inside the migration transaction and restored before
commit; retired requests cannot subsequently be approved or rejected.
Profile row versions and credential authority generations are separate:
renaming does not invalidate model keys or sessions; password, suspension and
admission-policy changes advance credential authority. Avatar upload and
customer OAuth follow their independent lifecycle described below and in
[ADR 0031](adr/0031-registration-login-and-consent.md).

## Independent customer lifecycle

| Method | Path below `/api/v1` | Contract |
| --- | --- | --- |
| GET | `/auth/registration-policy` | Public revision, agreement, registration/recovery and configured/enabled OAuth capabilities |
| POST | `/auth/registrations` | Email/display_name/password/consent_revision; non-enumerating 202 |
| POST | `/auth/registrations/verify` | Single-use registration token |
| POST | `/auth/password-reset` | Email; non-enumerating 202 notification intent |
| POST | `/auth/password-reset/confirm` | Single-use token/new_password; revoke sessions |
| POST | `/auth/oauth/{provider}/start` | Provider authorization URL; secure browser-bound state cookie |
| GET | `/auth/oauth/{provider}/callback` | Single-use state/code callback; customer session or verified signup |

The browser presents one reset-password flow without a request/confirmation
mode selector. Email submission advances to the token and new-password form;
the SMTP link opens that same form directly. A successful confirmation returns
to sign-in. The email response does not disclose whether an account exists.

Registration and recovery default off. Allowed email domains, initial
customer/user concurrency and RPM ceilings, provider toggles, agreement content
and one-time USD registration gift are persisted policy. Registration atomically
creates a new customer partition, customer account, wallet, optional gift,
consent evidence and audit. No shared existing customer membership can be
created. Management policy reads/writes require `security.settings.manage`,
Origin/CSRF and If-Match revision.

Challenge workflows require `admin.identity_notification_key_file` containing
exactly 32 raw bytes. AES-256-GCM payloads bind challenge purpose and UUID in
associated data. Tokens expire after twenty minutes, consume once, and retain
immutable evidence. At most 1000 active challenges/intents may exist.
An encrypted outbox intent is not proof of delivery. A bounded worker sends via
the deployment SMTP adapter with TLS, short timeouts and leased retries. OAuth
uses fixed provider endpoints, PKCE where supported, short-lived one-use state
bound to a secure browser cookie, and provider subject identifiers; it never
links an existing account by email. See
[ADR 0031](adr/0031-registration-login-and-consent.md).

Management paths below `/api/admin/v1`:

| Method | Path | Contract |
| --- | --- | --- |
| GET, POST | `/users` | Authorized page directory or provision one independent customer with explicit execution limits and administrative notes |
| GET, PATCH | `/users/{id}` | Explicit tenant_id; email, display name, notes, execution ceilings and optional operator password reset |
| POST | `/users/{id}/suspend`, `/activate` | Explicit tenant_id and If-Match; no request body |
| POST | `/users/{id}/group-grants` | Assign an allowed private routing group |
| DELETE | `/users/{id}/group-grants/{group}` | Remove grant and revoke its keys |

GET users derives every permitted customer partition from live
`identity.users.read` grants; a platform grant reads all customers and optional
`tenant_id` only narrows the directory. Its canonical page/page_size, global
search/filter/sort, exact total and same-snapshot contract are specified in
[API](API.md). Directory balances require independent live billing.read per
partition; balance sorting requires that permission across the selected read
scope. Last activity means the latest persisted successful customer browser
sign-in, and last call means the latest persisted owned model request start.
Missing activity remains null. Item access always carries an explicit
customer scope. Mutations recheck live authority in their transaction.
Administrative notes are present only on management customer reads and never
on a customer's own profile. Customer creation and updates accept notes without
a separate operation-reason field. Creation, updates, activation and suspension
write a fixed server-generated event description to the audit reason column;
the authenticated management principal and session remain the audit actor.
These descriptions are system-generated evidence, not operator-entered reasons.
One editor concurrency/RPM pair is committed to
both independent customer ceilings together. Operator password edits reuse the
bounded password hashing worker; email changes reset verification, and email,
password or limit changes advance authority and revoke customer sessions in the
same transaction. Profile display-name and note edits do not revoke sessions.
Suspension revokes sessions atomically; activation never restores them.
Registration policy is read and updated through management `/auth/settings`.
The public registration-policy read and persisted-policy checks in registration
and password-recovery transactions remain available.

## Platform operator security

An offline operator first runs
`ovload-gateway identity bootstrap-owner <username> --password-file <path>`.
It refuses any existing management principal. HTTP startup does not bootstrap
this identity. Provision another administrator explicitly offline with
`identity provision-operator <username> --password-file <path>`. Secret files are
bounded UTF-8, never plaintext CLI arguments.

GET `/profile` reads only the authenticated operator, and GET
`/session/permissions` projects only that operator's current live grants for
navigation. Every later operation independently rechecks its actual permission.
Online principal, role, grant and approval configuration APIs and their exclusive
implementations are removed, as is management GET/PATCH `/identity-policy`.
Historical records and audit events remain intact. See
[ADR 0029](adr/0029-retire-online-permission-configuration.md).

Existing resource APIs continue to enforce live platform or customer-scoped
grants; customer scope identifies one independent customer rather than a shared
organization. Administrator login, logout, own-profile password changes and
customer isolation remain enforced. Registration policy is managed through
`/api/admin/v1/auth/settings`; the public registration-policy read and internal
transactional registration/recovery policy checks remain.

## Model keys and admission

Personal avatar metadata is available at GET `/profile/avatar` in both identity
namespaces, with authenticated PNG delivery at GET `/profile/avatar/image`.
PUT replaces the image; DELETE removes it. Mutations require Origin, CSRF and
the avatar's own quoted If-Match revision, independent of the password/profile
revision. Neither path accepts another customer's or principal's ID. Image
processing and storage follow [ADR 0030](adr/0030-site-and-personal-settings.md)
and the [settings contract](API.md#basic-site-and-personal-settings).
Existing customer display-name and both password-change flows retain ownership
of their text/credential fields. No online permission editor is introduced.

Both namespaces expose GET/POST `/api-keys`, GET/PATCH `/api-keys/{id}`,
POST `/api-keys/{id}/rotate` or `/revoke`, and GET `/api-key-groups`.
Customer ownership derives from the verified session; management requires
explicit tenant_id/user_id and a reason. Group and wallet billing bindings are
immutable. Eligible groups come from public availability or existing private
grants. Lists contain prefixes only. Creation/rotation requires Idempotency-Key;
replays retain metadata and never reissue secrets. Changed payloads conflict.
Updates and irreversible revocation require If-Match. Revoked keys cannot return.

Atomic Redis admission enforces global/customer/user/key concurrency and RPM,
with all scopes checked before any write. Rejected admissions consume no RPM.
Duplicate request IDs do not consume capacity twice. Renew/release/recovery
carry the exact frozen scope; only root requests own customer admission.
See [ADR 0022](adr/0022-aggregate-execution-admission.md).

## Customer usage and USD funds

Customer-only GET `/usage`, `/usage/{id}`, `/usage/summary`, `/usage/trend`
and `/usage/export` read actual root request facts by the live session's customer
and user. Collection queries require UTC `from`/`to`, half-open and at most
31 days; optional key/model/outcome filters apply before pagination/aggregation.
Lists use cursors and limits 1..100. Export rejects more than 1000 rows instead
of truncating. Aggregates reject over 100000 roots and have bounded DB time.
No upstream account, IP, raw diagnostics or procurement cost crosses this API.
Unknown token values remain null. Retail charge appears only from a settled
financial operation, not an estimated provider cost.

GET `/billing/balance` returns settled, reserved and available USD strings at
scale 10. Funding belongs to the separately authorized audited billing service.
The frontend customer session, profile, keys, wallet, dashboard and usage use
these real interfaces. Registration accepts an optional `invitation_code`,
preserved through verification and OAuth registration, and binds it once when
creating the customer. Referral settlement and lottery awards use the wallet
ledger; see [execution contracts](API.md#engagement-execution).
SMTP delivery requires deployment credentials. Payments, subscriptions and
automatic execution charging remain separate incomplete integrations.
The user selected funds transactions without enabling automatic model charging.
See [Billing and Pricing](BILLING_AND_PRICING_DESIGN.md).
