# HTTP API contracts

Status: imported resource API plus the implemented identity slice below.
Source describes executable behavior; product documents distinguish the
remaining targets. Tests have not been run for the identity slice.

## Current surface

| Area | Current behavior | Source |
| --- | --- | --- |
| Health | GET /healthz aggregates dependency/worker health; success is 204 | src/crates/api/src/health.rs |
| Authentication | Separate customer/operator identity sessions; imported /api/auth removed | src/crates/api/src/identity |
| Customer identity | /api/v1 sessions, own profile and tenant-owned model credentials | src/crates/api/src/identity |
| Customer usage | Actual scoped requests, detail, summary, daily trend and bounded CSV export | src/crates/api/src/identity/customer_usage.rs |
| Management identity | /api/admin/v1 sessions and scoped customer provisioning/lifecycle | src/crates/api/src/identity |
| USD wallets | Customer tenant balance and scoped management balance/operator credit | src/crates/api/src/identity/billing.rs |
| Billing operations | Tenant-scoped financial operation lists/details; no public reservation or settlement command | src/crates/api/src/identity/billing_operations.rs |
| Retail pricing | Immutable management revisions, sample calculation and authorized effective-price reads | src/crates/api/src/identity/retail_pricing.rs |
| Management | /api/admin/... accounts, groups, proxies, usage, backups, settings, plugins, updates | src/crates/api/src/admin |
| Models | Responses HTTP/WS, directional Chat Completions HTTP/SSE, images, search, models/usage | src/crates/api/src/openai/router.rs |
| Static files | Configured frontend directory with SPA fallback | src/crates/api/src/lib.rs |

Consult the typed route modules for actual methods, DTOs, and status codes.
The live configuration workspace contracts are [upstream accounts](UPSTREAM_ACCOUNTS_API.md),
[channel groups](CHANNEL_GROUPS_API.md), and [retail prices](RETAIL_PRICING_API.md).
Credentials have no HTTP export and are encrypted at rest; see
[ADR 0026](adr/0026-upstream-credential-storage.md).
Some live/realtime operations explicitly return unsupported responses.
There is no separate /readyz or preview server. POST `/v1/chat/completions`
converts the documented text/function-tool subset to Responses through the
same execution pipeline; see [Chat Completions](CHAT_COMPLETIONS_API.md).
Messages and Generate Content ingress are not implemented.

The Codex Live sideband routes pin the upstream account to the call owner. The
durable model-key authority is checked before dialing and before forwarding
frames when the connection's authorization is stale. Active and idle relays
share a five-second freshness window; each authority check is bounded to five
seconds. A revoked key closes both relay halves. The worst-case observed
revocation delay is ten seconds (one check timeout plus one freshness window),
and steady-state relay authority reads are capped at one per connection per
five seconds rather than scaling with audio-frame rate. Setup also checks at
credential and dial boundaries. Process drain and request cancellation still
drop the relay and release its connection guard.

Concrete providers are Codex (`openai`), Grok Build (`xai`) and the separate
standard Responses API product (`openai_api`). The latter uses API keys and
HTTPS base URLs without Codex payload rewriting; see
[standard API provider](STANDARD_API_PROVIDER.md). Existing accounts keep their
provider identity. This does not establish support for public xAI or every
provider accepting an OpenAI-shaped request.

Managed adapter registration accepts the separate `openai_api` identity and
its `api_key` authentication kind. Managed HTTP shares the frozen outbound
policy and live authorization boundary; policy-protected WebSocket adapters
reject before handshake. Standard API canonical usage retains missing counts
as unknown rather than inheriting Codex defaults. These internal contracts add
no HTTP aliases or customer charging routes. See
[ADR 0028](adr/0028-managed-http-outbound-policy.md).

## Management observability

The management dashboard uses `/api/admin/dashboard/summary` and `/trend`;
usage uses `/api/admin/usage/records`, `/records/detail?id=...`, and
`/records/summary`. All require a management session with platform `usage.read`.
Queries use either calendar `period` (`today`, `7d`, `30d`) with millisecond
`asOf`, or explicit RFC 3339 `startTime`/`endTime`, never both. Record pagination
uses `currentPage` and `pageSize` (maximum 100); `status=all|success|error` is
explicit because an omitted record status selects successes; `error` selects
non-success outcomes, including running/cancelled/incomplete records. Record filters are
`clientApiKeyName`, `accountName`, `provider`, and `model`. Summary filtering is
only by time and provider, independently of the record table filters.

Frontend observation queries are partitioned by management session, consume
abort signals, and discard old-owner results. Amounts remain exact USD decimal
strings (the imported dashboard cost card is already formatted USD text), and
missing counts/capacity remain unknown. Dashboard today cards use deployment
calendar days; selected-window trends and usage summaries keep their own scope.
Monitoring displays stored
request/error history and reported account capacity, not synthesized active
requests. There is no live request inventory, machine resource/alert/log stream,
or customer/group channel-health API; those surfaces remain unavailable.
Existing page sections, tables, metric cards, chart frames and detail tabs remain
visible. Unsupported controls are disabled and their original content surfaces
show unknown values or an unavailable state; removing demo facts does not remove
the established component layout.

The ordinary request-detail DTO includes separate `clientStatusCode` and
`upstreamStatusCode`, and optional millisecond facts under `latencyDetails`.
The UI displays these recorded measurements without inventing stage durations,
reconstructing missing phases, or treating an incomplete attempt list as final.
Complete diagnostic events and any collected payload evidence remain restricted
to the existing on-demand `GET /api/admin/diagnostics/export?requestId=...` ZIP;
they are deliberately omitted from ordinary detail responses. This export
requires the same live platform `usage.read` permission, redacts credential
fields, and does not claim that arbitrary business content is automatically
recognized. The browser downloads the archive without caching its contents or
parsing it into the ordinary detail view.

User/group directories exist, but the management usage query has no user/group
filter, and there is no global user-ranking endpoint. Account-scoped model
catalogs describe current provider capabilities, not a complete historical
usage-model directory. The model text filter remains usable; unsupported global
categorical filters remain disabled. Dashboard storage supports several bucket
sizes, but the public dashboard query selects granularity from the requested
range internally and rejects an explicit granularity parameter. The hour/day
selector therefore remains disabled until an executable selection contract is
provided. Per-bucket cache-write values are also absent from the trend DTO.

Customer orders, subscription entitlements, redemption history, referral rewards,
and payment checkout have no executable HTTP contracts. Their existing tables,
tabs, forms, cards, and dialogs remain present with empty record collections,
unknown totals, and disabled actions. They must not consume browser-stored admin
drafts, generate receipts or rewards, invent quotes, or report successful writes.
The recharge balance alone uses the existing customer wallet API and exact USD
formatting; it does not enable checkout.

## Identity and financial boundaries

The identity API uses durable customer/management sessions, customer ownership,
explicit operator grants and CSRF checks. Each customer is independent; tenant_id
is its internal partition key. There are no team memberships or shared team wallets.
Model execution uses the authoritative model-key verifier described below.
Imported management resources now require live management sessions and platform
permissions; imported cookies and administrator API keys are rejected. Management uses the
code/message/data envelope; new identity errors use the stable contract below.

Current per-key budgets record known upstream USD costs without reserving
future customer charges. Tenant wallet reads and operator funding are a separate
implemented billing service described below. Retail prices have a separate
management publication API. Subscriptions, published retail prices, and
double-last-charge reservations are not wired to execution. The accepted target uses
USD fixed-point amounts and is specified in
[Billing and Pricing](BILLING_AND_PRICING_DESIGN.md).

Affected callers and routes must change together when customer/admin v1 contracts
are introduced; do not add legacy aliases or simulate backend success.
General protocol conversion, stricter input bounds, and continuation ownership
require explicit implementation and fixtures before publication.

## Implemented Identity Slice

An operator first runs `ovload-gateway identity bootstrap-owner <username>
--password-file <path>` with a restricted UTF-8 file containing 12 to 256
password bytes and an optional final newline. This refuses any existing
management principal and never replaces a password. Starting HTTP does not
create the new owner or map imported administrator credentials.

Configure the required `api.identity_public_origin` as one HTTPS origin.
Writes require an exact, single `Origin` header. Each audience has separate
`__Host-ovload_customer` or `__Host-ovload_management` access
cookie with Secure, HttpOnly, SameSite=Strict and path `/`. Sign-in returns
the CSRF token, which GET session can recover. All authenticated writes also
require a single `X-CSRF-Token`. No HTTP cookie fallback is provided; local
browser use requires HTTPS. Deployment/model API keys and imported sessions
are rejected by these handlers.

| Method | Path below either `/api/v1` or `/api/admin/v1` | Behavior |
| --- | --- | --- |
| POST | `/auth/sessions` | Unified `login` plus password; the server resolves customer email or management username and returns the session audience, cookie and CSRF |
| DELETE | `/auth/session` | Revoke current session and clear its cookies |
| GET | `/session` | Current verified owner, session expiry and CSRF |

The browser submits `login` (customer email or management username), `password`,
and optional `consent_revision` to `/api/v1/auth/sessions`. It selects no role.
The backend verifies both identity namespaces and requires one password match;
ambiguous credentials receive 401. It returns the verified `audience` and issues
that audience's cookie. Existing scoped `email`/`username` requests remain scoped
to their namespace. See [identity login rules](IDENTITY_API.md#session-and-profile-routes).

Customer GET `/api/v1/profile` reads only the authenticated user's profile.
The browser invalidates an expired session only if it still owns the failed
request. One session-loss observer clears cached queries, reports expiry once,
and replaces the current route with sign-in for reads, mutations and explicit
sign-out alike. Late failures from an older session cannot clear a newer one.
Session revalidation retains the last complete browser snapshot while loading;
the protected route waits for live session, profile and permission verification.
After owner validation and the epoch fence, the store publishes them atomically
without an intermediate permission reset. Errors remain visible, and an owned
401 still clears the expired session through the single session-loss observer.
Public session inventory, manual single-session revocation and manual rotation
are removed for both audiences; their former paths return the normal identity
404. Only access credentials are issued. Migration 0047 drops the unused refresh
verifier while preserving access sessions, absolute expiry and revocation
evidence. Sign-in can atomically replace the current same-owner session;
logout revokes the current session. Password/security changes and suspension
still invalidate affected sessions internally.
The retired session-management permission is removed from new and persisted
permission bundles. Migration 0047 retains the original records in new system
audit evidence with actual before/after snapshots, revokes grants that become
empty and makes every affected pending grant request terminal `retired` without
an invented human decision. Mixed pending bundles are not silently rewritten for
approval. Historical approved/rejected decisions remain unchanged. Online role,
grant and approval configuration is removed by [ADR 0029](adr/0029-retire-online-permission-configuration.md);
the retained records provide historical evidence rather than active HTTP workflows.
Management routes below `/api/admin/v1` are:

| Method | Path | Authorization and input |
| --- | --- | --- |
| POST | `/users` | Platform `identity.users.manage`; email, display_name, password, max_concurrency, requests_per_minute, notes |
| GET | `/users` | Live `identity.users.read` scopes; page, page_size, query, status, role, sort, order; optional tenant_id narrows the authorized directory |
| GET | `/users/{id}` | `identity.users.read`; required tenant_id |
| PATCH | `/users/{id}` | `identity.users.manage`; required tenant_id and strong If-Match; email, display_name, max_concurrency, requests_per_minute, notes, optional password |
| POST | `/users/{id}/suspend` | `identity.users.manage`; tenant_id and strong If-Match revision; no request body |
| POST | `/users/{id}/activate` | Same scoped permission and precondition; no request body |

User records include their UUID, tenant UUID, email, display name, status,
revision and UTC timestamps. Item responses expose a strong ETag such as `"1"`;
commands require that quoted If-Match value. Scope and live authorization are
rechecked inside the storage transaction. Creation commits tenant, zero-USD
wallet, customer and audit together. Suspension advances revision and revokes
customer sessions atomically; activation never restores revoked sessions.
These four customer mutations do not accept an operator reason. Their audit
records retain the authenticated management actor and session, with a fixed
server-generated event description in the existing reason column. Administrative
notes remain editable customer metadata. Financial and other management command
reason contracts are independent and unchanged. Registration policy has no
management HTTP read or update endpoint; public policy reads and transactional
registration/recovery policy checks remain in place.

The customer directory uses one canonical page contract, replacing cursor
pagination. `page` is one-based, `page_size` is 1..100 (default 10), and the
response is `{items,total,page,page_size}` with an exact authorized filtered
total from the same database snapshot as the page. `query` is a literal,
case-insensitive substring of user UUID, display name or email (at most 200
bytes). `status` is a comma-separated selection of active, suspended and revoked;
`role` accepts only `user`, the independent customer domain role. `sort` is id,
display_name, balance_usd or created_at, with `order=asc|desc`; created_at/desc is
the default. A UUID tie-breaker makes ordering deterministic. Invalid values and
superseded cursor/limit parameters fail explicitly.

Omitting tenant_id derives all permitted partitions from live management read
grants locked with the current session. A platform grant reads all customers;
scoped grants expose only their customer partitions. Directory rows include
role=user, the real user max_concurrency/requests_per_minute, notes, nullable
balance_usd, last_active_at and last_called_at. Balance is available funds
(settled minus held), represented as an exact ten-place USD
string only where the actor also holds live billing.read for that partition;
otherwise it is null. Balance sorting requires billing.read across the selected
read scope. No management principals appear in this customer directory.
last_active_at is the most recent successful customer browser sign-in recorded
by a persisted session, including sessions subsequently revoked; last_called_at
is the newest persisted model request started_at for the exact customer owner.
Neither value is synthesized from profile updates or the current time.

Creation and management editing take a single concurrency/RPM pair (1..100000
and 1..10000000), synchronized to the independent customer's user and partition
ceilings in the same transaction. Notes are at most 1000 UTF-8 bytes and may be
empty. Display name and login email are separate user fields. The service derives
the internal partition slug from the new tenant UUID; it is not public input.
Editing an email clears email verification; changing email, password or execution
limits advances authority and revokes customer browser sessions atomically. An
omitted password preserves the existing hash; a supplied password is validated
and hashed with the existing bounded Argon2 worker before the transaction.
Administrative notes are returned only by management customer routes, not by
the customer's own profile. Every mutation retains scoped live authorization,
revision checking and a mandatory audit reason.

Strict JSON rejects unknown fields and bodies above 32 KiB. Identity workflows
have a fifteen-second deadline and PostgreSQL statements a five-second
transaction-local limit. Sessions expire absolutely after twelve hours.
Authentication consumes durable one-minute
global/network/account budgets (1000/30/10), with password work limited to four
blocking tasks. GET session is authentication evidence at that operation's
decision point; it is not a permanent grant for a later command.

All identity responses are no-store and nosniff. Errors contain
`{"error":{"code":"identity.forbidden","message":"permission denied"},"request_id":"..."}`
with stable 400/401/403/404/409/429/503 status categories. Secrets and storage
errors are absent. Customer registration policy, single-use challenges, operator
security and frontend identity integration are described in [Identity API](IDENTITY_API.md).
Mail delivery and automatic execution billing are not activated.
See [ADR 0016](adr/0016-identity-session-authority.md) for credential derivation
and the authority boundaries, and [Identity API](IDENTITY_API.md) for
the remaining target contract.

## Proxy and Backup Workspaces

The proxy workspace reads paginated `/api/admin/proxies` and owned account
associations from `/proxies/accounts`; it sends the actual record revision for
update, delete and explicit connection-test commands. Creation uses the batch
`/proxies/create` response and reports each result independently. Credentials are
write-only in the editor; the server-provided endpoint omits authentication.
Expiry, fallback chains and quality grades have no proxy resource contract;
their existing controls remain disabled and show unavailable state.

The backup workspace uses `/api/admin/settings/backups` for storage/schedule
configuration and `/records` for server-paginated task state. Save, connection
test, queue creation, signed download and deletion use the existing POST routes.
Accepted creation means queued, not completed. `POST /restore` accepts
`{backupId, confirmation:"RESTORE"}` and returns a restore ID and private polling
ticket. `GET /api/backup-restore/status?id=...` requires that ticket in
`X-Restore-Ticket`; it exposes only this operation's status, without session
authentication. See [restore and image storage](DATA_BACKUP.md) for the single
instance maintenance boundary, rollback archive, and reauthentication behavior.
`GET/POST /images` and `POST /images/test` configure and verify separate image
storage. Image settings never return saved credentials; omitted credentials are
preserved and encryption uses the installation credential key.
Settings readbacks return `hasAccessKey` and `hasSecret` booleans instead of
`accessKeyId` or `secretAccessKey`; all settings presenters omit saved credentials.
Storage writes still accept `accessKeyId` and optional `secretAccessKey`;
omitting the secret preserves its private saved value.
This API currently provides no conditional revision on storage or schedule
updates, so the browser does not claim cross-operator conflict protection.
These workspaces use management sessions, live permissions, CSRF and
owner-scoped queries; no preview records or local successful mutations remain.

Subscription administration, redemption codes and announcement publishing
have no implemented resource API. Their existing
workspaces retain their tables, dialogs and controls with unavailable status,
empty typed collections and disabled write commands. They do not seed records,
generate usable codes, publish content or report local changes as saved.

## Engagement execution

Both identity namespaces expose GET `/engagement/{view}` and POST `/engagement`.
The full prefixes are `/api/v1` and `/api/admin/v1`; POST requires the session's
CSRF token. Views are `announcements`, `referrals`, `lottery`, and management-only `audit` and
`referrals-{user UUID}`. Management referral reads require `billing.records.read`;
audit and lottery administration require `security.settings.manage`. Customers
always read their own referral and wallet data. Lottery and referral record arrays contain at
most 500 entries; referral summary totals cover the entire history.

POST uses a tagged `op` object:

| Operation | Input | Effect |
| --- | --- | --- |
| `transfer_referral` | `key` | Move all released referral earnings into the customer's USD wallet |
| `start_lottery` | `key`, `reward_cents`, `winner_count`, `participant_target`, `minimum_recharge_cents`, `human_verification` | Create the single active round |
| `end_lottery` | `round_id` | Draw now, or cancel without awards if eligible participants are fewer than winners |
| `lottery_challenge` | `round_id` | Create a one-use, three-minute PNG challenge, limited to five per minute per customer |
| `join_lottery` | `round_id`, optional `challenge_id` and `answer` | Join once and draw atomically when the participant target is reached |
| `delete_audit` | `ids` | Delete selected audit samples without clearing violation counters |

Announcements use `save_announcement` (`id`, `revision`, `document`),
`delete_announcement` (`id`, `revision`), and customer-only `read_announcement`
(`id`, `revision`). Management writes require `security.settings.manage`.
The document has `title`, Markdown `content`, `status` (`draft`, `published`,
`archived`), `delivery` (`silent`, `popup`), `groupIds`, `startsAt`, and `endsAt`.
Customers only receive currently published announcements matching their live
group grants; explicit revocation overrides public group access. Empty `groupIds`
means all customers. Edits increment the revision, invalidate prior read receipts,
and reject stale updates/deletes with 409. Administrative readership counts use
the same live audience rule. Save/delete operations are audited.

Group create/update payloads include `pricing: { peak: null, modelPrices: {} }`.
Updates replace that full pricing document. An omitted model inherits the gateway
price; `modelPrices[model]` overrides standard `input`, `output`, `cacheRead`, and
`cacheWrite` rates. `peak` contains `timezone`, `startMinute`, `endMinute`,
`peakMultiplierBps`, and `offPeakMultiplierBps`. The selected peak multiplier
combines with `retailMultiplierBps` and is frozen for the request and retries.
Group mappings are aliases, not allowlists: account catalogs and account policies
control model admission. Group usage includes `todayUsd`, `yesterdayUsd`, and
`retainedTotalUsd` (cumulative, preserved across request-log retention). Historical
cumulative usage is backfilled from retained requests; previously deleted logs
cannot be reconstructed. Capacity uses request-group lease metadata and the sum
of configured account concurrency, including disabled members; an unbounded
member makes total capacity unbounded.

`key` is an ASCII idempotency identifier of 1–128 characters. Transfer retries
return the original receipt. A changed start payload with the same key conflicts.
Draws serialize on the round, select active customers using independent system
randomness, and write winners and ledger credits in one transaction. Repeated
end commands cannot award twice. Rewards and transfer amounts are USD; minimum
lottery recharge is CNY cents. Only confirmed paid recharges count toward the
threshold, excluding registration gifts, rebates, prizes and ordinary adjustments.

Operator wallet credits accept optional positive `paid_cny` with at most two
decimals, indicating the operator has confirmed receipt of a real payment.
Omitting it remains an ordinary adjustment. The command fingerprint includes
this field. Grant insertion records the recharge and calculates a referral rebate
using the enabled policy, per-invitee lifetime cap, eligibility period, inviter
rate override and frozen release time. Disabling or changing policy affects new
recharges; existing earnings keep their recorded amount and release time.
Transfers and lottery rewards use the existing append-only wallet ledger.

Content audit executes before provider dispatch for prompts and at the response
boundary for outputs. Policy applies to configured groups and sampled request IDs.
`keyword_only` matches case-insensitive comma/newline-separated substrings;
`keyword_and_api` calls Jev after a keyword match; `api_only` always calls Jev.
The first two modes require keywords. Jev uses the System One Noul question API,
configured endpoints, proxy, timeout, retry count and score thresholds.
Buffered outputs pass audit before downstream delivery; observe delivery records
results after streaming and requires observe/allow policy. Failure action,
custom rejection status/message, retention, violation-based suspension and
durable email notification are enforced server-side. Stored evidence contains
decision summaries and rule scores rather than raw prompts or response bodies.

Configure `OVLOAD_AUDIT_API_KEY` for a shared Jev key, or
`OVLOAD_AUDIT_API_KEYS` as a JSON object mapping configured endpoint IDs to keys.
Keys remain in deployment environment variables. Hit notifications use the
existing configured SMTP transport and durable retry outbox.

## Tenant-owned Model Keys

The customer and management identity namespaces both expose these paths:

| Method | Path | Behavior |
| --- | --- | --- |
| GET, POST | `/api-keys` | Bounded owned list or create; creation requires Idempotency-Key |
| GET, PATCH | `/api-keys/{id}` | Metadata read or replace mutable policy; PATCH requires If-Match |
| POST | `/api-keys/{id}/rotate` | Revoke old row and create replacement atomically; If-Match and Idempotency-Key |
| POST | `/api-keys/{id}/revoke` | Irreversible revocation; If-Match and reason |
| GET | `/api-key-groups` | Current explicitly granted, enabled groups |

Customers derive ownership from their current session. Management key operations
require explicit `tenant_id` and `user_id` query parameters, the corresponding
`identity.keys.read` or `identity.keys.manage` grant, and a reason on writes.
Names, enabled state, admission limits and expiry are mutable; tenant, user,
single group and wallet billing source are immutable. Amount caps and retail
billing are not exposed by this slice. Group grants are explicit; no platform
group becomes customer-visible by default.

Management POST `/users/{id}/group-grants` and DELETE
`/users/{id}/group-grants/{group}` require explicit tenant scope and a reason.
Removing a grant revokes the affected user's bound keys in the same transaction.
Management GET `/api-key-assignments` lists imported keys quarantined by migration
0036. Platform `identity.keys.manage` is required for both this inventory and
POST `/api-key-assignments/{id}`. Assignment explicitly supplies the target owner,
validated name, one granted group, positive limits, enabled state and reason.
The row can be assigned only once. No tenant or group is guessed from imported data.

New key limits are positive integers: concurrency 1..10000 and requests per
minute 1..1000000, defaulting to 4 and 60 on creation. Zero is rejected by this
API. They combine atomically with global/customer/user ceilings under
[ADR 0022](adr/0022-aggregate-execution-admission.md).

New credentials contain 256 random bits and are disclosed only in the successful
creation/rotation response. Storage, snapshots, lists, audit and idempotency
receipts contain no secret. Replays return the original metadata with
`secret_disclosed=false`; a changed payload or target owner returns 409.
Receipts are scoped to the acting principal, command family and idempotency key;
replay reads the same resource's current metadata. Rotation does not overlap
the old and new credentials. Revocation preserves IDs, budget facts and history.
The old global key CRUD/reveal routes, model-key browser login, `/api/key-usage`
namespace and administrator key-ID model bridge are removed rather than aliased.

Core authenticates and revalidates against PostgreSQL, independently of pinned
configuration snapshots. Policy and key generations must match; a stale policy
snapshot cannot supply earlier limits after a key policy change. Verified
tenant/user/key generations accompany execution,
queue resumption, retries and provider dispatch. Model requests freeze these owner
facts when accepted. A committed suspension, expiry, revocation or group-grant
removal prevents later authorization decisions. An earlier authorized request may
already have executed; cancellation does not prove that no charge occurred.
Plugin model calls require a verified credential or an active parent's delegated
identity. Installing a plugin, listing a key or presenting its ID is insufficient.

See [ADR 0017](adr/0017-model-key-authority.md) for migration, idempotency and
execution authority boundaries. Real-database and concurrency acceptance have
not been run under the user's current test instructions.

## Tenant USD Wallets

The following PostgreSQL-backed routes use the independent identity sessions:

| Method | Path | Authorization |
| --- | --- | --- |
| GET | `/api/v1/billing/balance` | Current customer session; derives its tenant |
| GET | `/api/admin/v1/billing/wallets/{tenant_id}` | Current management session and live scoped `billing.read` |
| GET | `/api/admin/v1/billing/wallets/{tenant_id}/credits` | Current management session and live scoped `billing.read`; bounded operator-funding history |
| POST | `/api/admin/v1/billing/wallets/{tenant_id}/credits` | Current management session, live scoped `billing.manage`, CSRF, exact configured Origin, and `Idempotency-Key` |

Balances expose `tenant_id`, `currency: "USD"`, `scale: 10`, and decimal strings
`settled_usd`, `held_usd`, and `available_usd`. Availability is exactly settled
minus held. Model API keys and deployment administrator sessions cannot access
these routes. Responses use the identity error contract and no-store protection.

Credit input is `{"amount_usd":"10.25","reason":"operator funding"}`. Unknown
fields, zero/negative amounts, values outside `numeric(20,10)`, and more than ten
fractional digits are rejected. Reasons contain 1..512 bytes with no leading or
trailing whitespace or control characters. Idempotency keys contain 1..128
printable non-whitespace ASCII bytes. The scope is tenant and management
principal; a changed amount or reason in that scope returns 409.

Credit returns 200 with `ledger_entry_id`, `amount_usd`, `balance`, and a UTC
`created_at`. Identical retries return the immutable original receipt, including
the original settled/held balance snapshot, even after later wallet activity.
The current balance is obtained from GET. Authorization is rechecked on replay.
The wallet lock serializes concurrent credits and holds; the ledger, credit
command, receipt and management audit event commit together. Cancellation or a
lost HTTP response is retried with the same idempotency key.

Credit history reads the committed operator-credit ledger entries, credit grants,
and their commands. It accepts only `limit` (1..100, default 50) and optional
`cursor` (a ledger UUID in the same tenant's operator-credit history). Unknown or
foreign cursors return 400. Entries are ordered exclusively by descending
`(created_at, ledger_entry_id)` and expose `ledger_entry_id`, `tenant_id`,
`principal_id`, `kind: "admin"`, exact `amount_usd`, `reason`, and UTC `created_at`.
The page contains `items`, `next_cursor`, `currency: "USD"`, `scale: 10`, and
`total_credited_usd`, the exact sum of all committed operator credits in the
tenant at that read snapshot. The lifetime sum can exceed a single wallet's
`numeric(20,10)` range and remains an unrounded decimal string. The query does
not expose command fingerprints, idempotency keys, sessions, or unrelated
tenants. Opening balances, corrections, model reservations/settlements, payment
orders, redemption codes, and refunds are not relabeled as operator funding.
The existing append-only ledger is the source; no replacement or duplicate
financial storage is introduced.

The management customer directory reads permission-filtered available balances
inside its bounded directory query instead of issuing one request per row.
Wallet detail and history query keys bind the session owner and explicit tenant;
unused reads are canceled and failures remain unknown instead of becoming zero.
The original balance and credit-history components retain their presentation.
Credit submission creates a bounded in-memory command intent only on explicit
operator action. An uncertain outcome retains the same amount, reason, and
idempotency key for a retry, including closing and reopening the form within the
same session; changing that unresolved command is rejected. Logging out or
changing session ownership clears these private pending intents. A successful
receipt refreshes the current balance and history rather than treating its
immutable original balance snapshot as current. The browser does not persist
financial intents or synthesize funding history. A first, explicit 400/403/404
rejection can release an intent only if no earlier attempt had an uncertain
outcome. Once any attempt has an unknown outcome, a later rejection cannot prove
that the earlier attempt did not commit; only its successful idempotent receipt
resolves that intent.

This is audited operator funding, not a payment order or proof of customer
payment. Request reservation, provider usage settlement and reconciliation are
not connected to execution yet. Provider cost metering
remains a separate fact. [ADR 0018](adr/0018-customer-usd-billing.md) defines the
remaining activation requirements. Database acceptance has not been run under
the user's instruction to skip tests.

## Retail Price Management

These routes require an independent management session and a live
platform-scoped grant. Tenant-scoped grants, customer sessions, model keys and
deployment administrator sessions cannot access the shared catalog. POST also
requires CSRF and the exact configured Origin. All responses use identity
errors and no-store protection.

| Method | Path below `/api/admin/v1/pricing` | Grant and input |
| --- | --- | --- |
| GET | `/revisions` | `billing.read`; optional exclusive revision-number `cursor`, `limit` 1..100 (default 50) |
| GET | `/revisions/{id}` | `billing.read`; complete canonical document and metadata |
| POST | `/revisions` | `billing.manage`; complete `cards`, `reason`, catalog `If-Match`, `Idempotency-Key` |
| POST | `/revisions/{id}/validate` | `billing.read`; empty JSON object `{}`; bounded hydration and digest validation |
| POST | `/revisions/{id}/preview` | `billing.read`; group/model/tier, explicit sample multiplier and usage |
| POST | `/revisions/{id}/publish` | `billing.manage`; version preconditions, reason and idempotency key |
| POST | `/revisions/{id}/retire` | `billing.manage`; version preconditions, reason and idempotency key |
| GET | `/effective` | `billing.read`; exact group/model/tier, published price plus persisted group multiplier |

Only this subtree accepts bodies up to 512 KiB. Unknown fields are rejected.
A create body has `cards` (1..128) and `reason` (1..512 trimmed bytes, no control
characters). Each card has optional `account_group_id`, exact `public_model_id`
(1..256 bytes), `service_tier` (1..64 bytes), and `rates`. Each rate has
`dimension`, `unit`, a ten-place decimal string `rate_usd_per_unit`, and
`billable` (false exactly when the rate is zero). All five base text dimensions
must be explicit, including free rates. Additional dimensions use the finite
Core vocabulary and matching denominators; duplicate dimensions/selectors fail.
Group/model replacements cover exactly the platform model's service tiers and
each corresponding tier's dimension set. No per-component inheritance occurs.

The document fixes `time_band_id: "always"`, UTC, all weekdays, 00:00..24:00,
and context `[0, unbounded)`. Alternate schedules/context bands are rejected as
unsupported inputs. A media rate does not enable provider media execution.
Create seals the complete draft with a canonical SHA-256 digest atomically;
sealed content has no edit route. A changed tariff requires a new draft.

Collection responses include `catalog`, `items`, and `next_cursor`, with
`ETag: "<catalog_generation>"`. Creation uses that catalog tag as `If-Match`.
Detail, validation and mutation responses include `currency: "USD"`, `scale: 10`,
`catalog`, and `revision` with a canonical `document`. Their strong ETag is
`"<catalog_generation>.<row_version>"`. Draft `effective_at` is null. Publish
and retire require that composite tag and a body
`{"expected_catalog_generation":3,"reason":"approved tariff"}` with matching
tag generation. Composite tag versions are positive canonical decimal integers
within bigint.
Malformed preconditions return 400; stale catalog/row versions return 409.

Create/publish/retire return 200 and `Idempotency-Replayed: true|false`.
Keys contain 1..128 printable non-whitespace ASCII bytes and are scoped to the
management principal and command. Replays recheck live authority and compare
the complete canonical command fingerprint before version preconditions. An
identical retry returns the same revision's current metadata without repeating
the transition; a changed payload conflicts. Publication retires the old
revision, publishes the new one immediately using database time, advances the
catalog, and writes command/audit evidence in one transaction. Retirement clears
the current pointer. Old revisions remain readable; retirement is terminal.

Preview takes `account_group_id`, `public_model_id`, `service_tier`,
`multiplier_bps` (0..1,000,000; 10,000 means 1x), and `usage` entries containing
`dimension` and unsigned integer `quantity`. The five text dimensions are
required, including zero quantities; duplicate or unpriced supplied dimensions
fail. It returns the selected group override (or null for platform), revision,
rates, quantities, exact rational USD component subtotals as string numerator
and denominator, and one half-even rounded `total_usd`. The multiplier is sample
input; persisted group multipliers are resolved by the separate effective-price endpoint. Preview
does not verify provider bounds, dispatch, reserve, or charge funds.

See [ADR 0019](adr/0019-retail-price-publication.md) for lock order and immutable
publication. Migration 0038 and these database transactions have not been run
against PostgreSQL under the user's instruction to skip tests. Request billing
activation remains separate work. The existing pricing workspace uses these real
revision APIs. Customer `GET /api/v1/pricing/effective` verifies live customer
authority and group eligibility before returning a public effective price.
See [Retail Pricing API](RETAIL_PRICING_API.md) for exact effective rates, group
policy, UI revision lifecycle, and the internal frozen multiplier contract.

## Runtime Settings Administration

The non-pricing tabs under `/gateway-settings` read `GET /api/admin/settings`
and replace settings through `POST /api/admin/settings/update`. Both require
the platform `security.settings.manage` grant; writes require the management
session CSRF token and use the normal `{code: 200, message, data}` envelope.
The write contains all `RuntimeSettingsFields`, `modelMappings`,
`rotationStrategy`, and the loaded `configRevision`. The store checks that
revision atomically; a conflict leaves the editor dirty until an explicit
reload discards it. There is no automatic rebase or mutation retry.

The editor exposes account concurrency/queues, refresh and retention limits,
automatic account freezing, Codex minimum versions and session affinity.
Untouched privacy, location, smart-scheduling, warmup, reset-credit, and model
mapping values are retained from the same loaded snapshot. Provider request
profiles are omitted from writes, preserving them server-side. Derived GET
metadata and compatibility profile fields are never echoed to the mutation.
The settings snapshot and draft live only in component memory, scoped to the
current session; they are not written to browser storage or a query cache.
Numeric values must be safe integers before a replacement can be sent.

The former local timeout/cooldown, streaming-action, maximum-version,
fingerprint and client-rule controls have no matching runtime contract and
are unavailable. The UI does not translate them to unrelated backend fields.

Site branding and owner avatars use the live contracts described in
[basic site and personal settings](#basic-site-and-personal-settings).
Registration, email verification/recovery, configured OAuth providers, USD
signup gifts, and immutable login-agreement consent use the independent identity
contracts in [IDENTITY_API.md](IDENTITY_API.md) and
[ADR 0031](adr/0031-registration-login-and-consent.md). SMTP transport and OAuth
client secrets remain deployment-only configuration. Feature and page settings
use revisioned GET/PATCH `/api/admin/v1/workspace/settings/{features|pages}`;
GET `/api/v1/workspace/visibility` exposes only public visibility flags. Referral
settlement, content audit and lottery execution use the contracts below.
Payment-channel/offers remain separate incomplete integrations. Live administrator
authorization and customer isolation remain enforced; see
[ADR 0029](adr/0029-retire-online-permission-configuration.md).
The channel-monitoring configuration likewise has no scheduling or policy API:
its existing checks, provider/model, group and threshold controls remain empty
and disabled. Provider names and error-category labels are static vocabulary,
not evidence of configured providers, available models or active health checks.

## Procurement Price Administration

The model-price tab under `/gateway-settings` uses the existing platform
`GET /api/admin/settings/pricing` and
`POST /api/admin/settings/pricing/update` contracts. These require a live
platform `security.settings.manage` grant; mutations also require the management
session CSRF token. Responses use `{code: 200, message, data}`. Reads contain
`defaults`, `synced`, `overrides`, `syncedAt`, and `syncedAtDisplay`.

An update addresses one exact provider and model with
`{provider, models: [model], change: {action: "replace", pricing}}`.
`pricing` contains integer `multiplierBps` (0..1,000,000; 10,000 means 1x) and
`bands`; every supplied band has all four decimal-string rates `input`, `output`,
`cacheRead`, and `cacheWrite`, in USD per million tokens. Rates have at most four
fractional digits and are at most 1,000,000; explicit zero differs from an absent
band. Unknown models require a complete `standard` band. The independent
`openai_api` identity requires explicit text-tier prices and has no default-price
fallback. These procurement prices do not publish retail tariffs or enable
customer charging.

The UI saves one model at a time and reloads the catalog after a successful
mutation. Removing a manual override uses `change: {action: "reset"}`, leaving
built-in and synchronized prices intact. The existing endpoint accepts no
client revision or `If-Match`: the store locks current settings, changes only
the addressed models, commits audit and configuration revision together, and
publishes the snapshot. Concurrent writes to the same model use last-committed
writer semantics; the UI does not claim optimistic conflict detection or an
atomic multi-model save. Existing local model-price storage is neither read nor
migrated. Runtime settings and procurement overrides use independent save
actions. A procurement update also advances the global configuration revision;
a subsequently stale runtime editor must reload explicitly after a conflict.

## Billing Operation Reads

These PostgreSQL-backed GET routes use the independent identity sessions and
the same identity errors/no-store protection as wallet reads:

| Path | Authorization |
| --- | --- |
| `/api/v1/billing/operations` | Customer session; derives the tenant |
| `/api/v1/billing/operations/{id}` | Customer session; tenant-scoped operation lookup |
| `/api/admin/v1/billing/wallets/{tenant_id}/operations` | Management session and live scoped `billing.read` |
| `/api/admin/v1/billing/wallets/{tenant_id}/operations/{id}` | Same explicit tenant and permission |

Lists accept only `limit` (1..100, default 50) and optional `cursor` (an operation
ID). Operation IDs use the existing bounded `req_` identity contract. The cursor
must name a row in the same tenant; unknown or foreign cursors return 400.
Ordering is exclusive descending `(created_at, operation_id)`; responses contain
`items` and `next_cursor`. A missing or foreign item returns 404. Management
tenant scope is never inferred from an operation ID.

Items expose `operation_id`, `tenant_id`, `user_id`, `api_key_id`,
`account_group_id`, `public_model_id`, `service_tier`, `price_revision_id`,
`currency: "USD"`, `scale: 10`, `state`, `row_version`, and UTC
`created_at`, `updated_at`, `expires_at`, `completed_at`. Money fields are decimal
strings: `maximum_charge_usd`, `initial_reservation_usd`, `reserved_usd`,
`held_usd`, `settled_usd`, `released_usd`. State is `held`, `settled`, `released`
or `reconciliation_required`. These are customer financial amounts, not provider
costs. Responses omit provider/account/egress details, private evidence, request
digests, credentials and procurement prices.

Internal Core/Store commands provide durable reservation, fresh dispatch intent,
append-only evidence and idempotent completion; they are not HTTP mutation
routes. No customer-supplied quote, token bound or usage becomes financial
authority. As explicitly selected by the user, model execution does not call
these commands yet and automatic charging is not enabled. Empty history is real
empty storage, not simulated usage. See
[ADR 0020](adr/0020-retail-funds-transactions.md). Database acceptance has not run.

## Basic site and personal settings

Website settings loads and saves the basic site-identity fields and managed logo
through the management API. Personal avatar frontend integration remains pending.
See [ADR 0030](adr/0030-site-and-personal-settings.md).

| Method and path | Contract |
| --- | --- |
| GET `/api/v1/site-settings` | Anonymous safe public site metadata |
| GET `/api/v1/site-settings/logo` | Current managed PNG; 404 when absent |
| GET `/api/admin/v1/site-settings` | Current session and platform `security.settings.manage` |
| PATCH `/api/admin/v1/site-settings` | Same grant, CSRF, Origin and If-Match; replaces four text fields |
| PUT/DELETE `/api/admin/v1/site-settings/logo` | Same mutation requirements; upload or remove logo |
| GET `/api/v1/profile/avatar` and `/api/admin/v1/profile/avatar` | Current owner's avatar metadata |
| PUT/DELETE `/api/v1/profile/avatar` and `/api/admin/v1/profile/avatar` | Current owner, CSRF, Origin and avatar If-Match |
| GET `/api/v1/profile/avatar/image` and `/api/admin/v1/profile/avatar/image` | Current owner's PNG; 404 when absent |

Text replacement requires exactly `name` (1..80 Unicode scalar values),
`subtitle` (0..160), `support` (0..500) and `endpoint` (0..500). Reject control
characters and leading/trailing whitespace. Endpoint is empty or an absolute HTTP(S) URL
without credentials, query, fragment or whitespace. It never triggers a server
fetch. Unknown fields fail. Mutations use positive quoted numeric If-Match,
such as `"1"`. Stale versions return 409 without changes. Metadata returns the
new revision, managed image URL and UTC updated_at, never binary data.

Logo uploads contain raw image/png or image/jpeg bytes up to 307200 bytes.
Avatar uploads additionally accept image/webp and allow up to 2097152 bytes.
WebP must be a valid static container; animation and inconsistent inner sizes
or chunk lengths are rejected before decoding.
Actual format must match Content-Type. Multipart, SVG and URLs are unsupported.
Canonical PNG output fits within 256x256. Four blocking processing slots reject
excess work with 429. Image extraction overrides the ordinary 32 KiB body bound
only for uploads; oversized bodies return 413. Responses use no-store and
nosniff. Private image routes derive the owner from the authenticated session.
Avatar revisions are independent of profile and credential revisions. Removing
an image retains its version history. Site text and logo share one revision.
Persistence, live authorization and audit are transactional; database backups
include the managed images. Authentication policy, agreement consent, OAuth
providers and one-time registration gifts use their separate contracts in
[identity API](IDENTITY_API.md) and [ADR 0031](adr/0031-registration-login-and-consent.md).
The website editor retains a draft until confirmed writes complete. Text and
logo changes are separate versioned requests: each confirmed response advances
the editor's baseline before the next request. A partial failure preserves the
remaining draft. Conflicts and uncertain write outcomes require an explicit
reload, with confirmation before discarding edits; the editor never retries a
write automatically.
Both management and customer sidebar branding reads the anonymous public site
metadata. Confirmed management reads and writes update that shared public cache;
draft edits never change the brand. A late public read cannot replace a newer
confirmed revision. The sidebar renders the saved site name, nonempty subtitle
and managed logo when present for both audiences.

## Operations monitoring

Management monitoring uses the identity session and `usage.read` permission.
`GET /api/admin/v1/monitoring` accepts `from`, `to`, `provider`, `group_id`,
`active_page` and `active_page_size` (1–100). `activeSummary` reports all matching
users and requests independently of the active-row page. Client admission waits
are not yet assigned to a provider; they appear under the all-provider filter.
Account waits are marked queued, and cancellation removes the queue observation.
Queue observations belong to the serving gateway process.

`GET /api/admin/v1/monitoring/resources` returns host CPU/memory, the application
PostgreSQL pool, Redis server clients, worker health and bounded log-writer health.
Redis uses multiplexed connections, so it is not presented as an idle/active pool.

`GET /api/admin/v1/monitoring/logs` queries persisted structured application logs
with `from`, `to`, `level`, `component`, `search`, `requestId`, `provider`, `groupId`,
`accountId`, `page` and `pageSize`. Time windows are bounded to 90 days; page size
is at most 100. Request correlation joins support provider/group filtering.
Collection starts with this deployment; raw request dumps and OAuth recovery
channels are excluded, and only allowlisted structured fields are indexed.

`GET/PUT /api/admin/v1/monitoring/logs/config` loads/saves `revision`, `enabled`,
`level` (DEBUG/INFO/WARN/ERROR) and `retentionDays` (1–90). Writes require matching
`If-Match`, CSRF, step-up when configured, and `security.settings.manage`.
`POST /api/admin/v1/monitoring/logs/cleanup` takes an exclusive `before` cutoff and
deletes up to 10,000 records per transaction, returning `deleted` and `hasMore`.
Configuration and cleanup write durable management audit records. The bounded
writer retries idempotent log IDs and exposes dropped/write-failure counters.

## Verification

API tests live under src/crates/api/tests; application and CLI contracts live
under src/apps/tests. Offline tests do not establish real provider, database,
Redis, payment, or frontend integration.
