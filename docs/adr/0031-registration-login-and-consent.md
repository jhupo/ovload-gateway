# ADR 0031: Website authentication and consent

Status: accepted.

This change authorizes the existing website registration/login and agreement
tabs. It supersedes ADR 0029 only for registration-policy administration and
ADR 0030's exclusions for mail, OAuth, registration gifts and legal consent.
Permission, role and principal editors remain retired.

The static public sign-in page uses one identifier/password form. The server
checks customer email and management username credentials and returns the
verified session audience; the browser never selects a role. Both candidate
passwords are verified with bounded work and absent records use dummy hashes.
Exactly one match is required; ambiguous credentials fail without issuing a
cookie. Audience cookies, protected APIs and live management grants remain
independent. Management login can recover policy without accepting customer
agreements, and all password login shapes share the identifier attempt budget.

Admin owns authentication policy and lifecycle commands. Store owns policy
revision checks, immutable agreement versions, consent evidence, OAuth state,
external identities and registration gifts. Host implements SMTP and fixed
provider OAuth HTTPS adapters. API translates requests and cookies; the
application composes adapters and supervised notification workers.

Management settings require live platform security.settings.manage, strict
Origin, CSRF and If-Match. Public metadata exposes only login capabilities and
published agreement content. Secrets are deployment configuration and never
returned by management/public APIs or logged. An enabled capability without
its required deployment configuration must fail explicitly.

Registration checks policy under its transaction lock, creates the user and
wallet, records current agreement consent, and credits the configured USD gift
through the append-only wallet ledger in that transaction. Gifts use ten decimal
places and are issued once per newly created customer, including OAuth signup.
Existing accounts and replayed challenges receive no second gift.

Customer password login, registration and OAuth require explicit acceptance of
the current enabled agreement version. Management login remains available for
policy recovery. Agreement versions are immutable, consent records bind the
customer, version and event, and stale acceptance conflicts instead of silently
accepting new text. Markdown is rendered without raw HTML.

OAuth uses fixed GitHub, Google and LinuxDo endpoints, a random state bound to
a secure browser cookie, single use expiration and PKCE where supported. The
provider subject identifies the external account. Never link an existing local
account by matching email alone. Callback failure creates no session or gift.
Do not log authorization codes, state, tokens, mail bodies or credentials.

Notification delivery consumes the encrypted existing outbox with bounded
leases, retry attempts and timeouts. Expired/cancelled challenges are not sent.
SMTP requires TLS; credentials and notification encryption keys remain outside
the repository and database backups must retain their separate key recovery.
Delivery is at least once; challenge consumption is single use.
