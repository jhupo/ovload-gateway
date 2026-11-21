# Development

## Backend baseline

Use Rust 1.99.1 with rustfmt and Clippy, Node.js 22.12+, and pnpm 10.
Run Cargo from the repository root; there is no nested workspace under src.

```sh
cargo run --locked -p ovload-gateway -- --help
cargo run --locked -p ovload-gateway -- --version
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev
```

The CLI supports serve, plugin, identity bootstrap-owner/provision-operator, help, and version. The removed preview,
worker, migrate, schema-status, and schema-revert commands are not available.
Existing deployment/browser automation referencing them needs adaptation.

Serving discovers deploy/config.yaml from the current directory or a parent.
The sanitized [configuration example](../deploy/config.example.yaml) supplies
the required schema. Set private local database, Redis, and administrator
passwords before serving; empty secret placeholders intentionally fail validation.
It requires PostgreSQL, Redis, configured providers/plugins, and static frontend
assets. Configuration is not derived from frontend preview stores. Consult
[src/apps/src/bootstrap/config.rs](../src/apps/src/bootstrap/config.rs) and its
[tests](../src/apps/tests/bootstrap/config.rs) for the required schema.

Imported overrides include CPR_SERVER_HOST, CPR_SERVER_PORT, CPR_WEB_DIST_DIR,
CPR_DATABASE_URL, CPR_REDIS_URL, and corresponding password variables.
The old OVLOAD-prefixed deployment example is not a contract of this backend.
Keep actual passwords, provider credentials, and private configuration outside Git.
Store startup applies SQLx migrations before opening the HTTP listener.
Set `store.provider_credential_key_file` to a restricted file containing exactly
32 random raw bytes. Paths resolve relative to the configuration directory.
Provision this key outside the repository and retain it separately with backups.
The runtime encrypts historical provider documents before serving; a missing or
incorrect key prevents startup. Management HTTP cannot export credential secrets.
See [credential storage](adr/0026-upstream-credential-storage.md).

New identity routes require `api.identity_public_origin` with an HTTPS origin.
Use HTTPS locally for their Secure cookies. Provision the first management
principal explicitly with `ovload-gateway identity bootstrap-owner <username>
--password-file <path>`; the bounded UTF-8 file contains 12 to 256 password bytes
and may have one final newline. Starting HTTP never provisions this principal.
Create another administrator explicitly offline with `identity provision-operator
<username> --password-file <path>`. Online operator, role, grant and approval
configuration APIs are removed; registration policy is managed through the
existing settings tab with a live `security.settings.manage` grant. See
[ADR 0029](adr/0029-retire-online-permission-configuration.md) and
[ADR 0031](adr/0031-registration-login-and-consent.md).
Imported resource APIs require these management
sessions and live platform grants; old administrator cookies do not authorize them.
The optional `admin.identity_notification_key_file` points to exactly 32 raw bytes
loaded off Tokio workers and protects stored challenges/intents. Configure SMTP
with `identity_smtp_config_file` and OAuth credentials/callback URLs with
`identity_oauth_config_file`; keep both JSON files outside Git. Registration and
recovery default off. Provider switches are limited to credentials configured at
startup. See [ADR 0031](adr/0031-registration-login-and-consent.md).

SMTP JSON shape: `{"host":"smtp.example.com","port":465,"username":"...","password":"...","from":"Gateway <noreply@example.com>","frontend_origin":"https://example.com"}`.
OAuth JSON maps provider IDs to `client_id`, `client_secret` and an HTTPS
`redirect_uri` such as `https://example.com/api/v1/auth/oauth/github/callback`.
Provider endpoints are fixed in the gateway. Keep these files readable only by
the gateway process and use TLS callback/front-end origins. SMTP must be
configured before enabling email verification, recovery, or OAuth signup.
See [API](API.md) and
[ADR 0016](adr/0016-identity-session-authority.md).

For live frontend development, Vite forwards `/api` and `/v1` to the local
gateway at `http://127.0.0.1:8080`, preserving the browser Origin. Set
`OVLOAD_DEV_TLS_DIRECTORY` to a restricted directory outside the repository
containing `localhost.key` and `localhost.crt`, then run Vite with a fixed port,
for example `pnpm --dir web dev --port 5443 --strictPort`. Configure the backend
`api.identity_public_origin` to that exact HTTPS origin. The certificate must
cover the browser hostname. A standalone HTTP preview cannot establish identity
cookies. Keep development passwords, encryption keys and database configuration
outside Git; bootstrapping identities still uses the real CLI and HTTP services.

## Backend checks

The standard Responses product is explicitly registered as `openai_api` beside
Codex (`openai`) and Grok Build (`xai`). Configure it through the live accounts
screen; no additional process or startup secret field is required. Store's
credential encryption key remains required. An account must be explicitly
enabled and granted through channel/key policy before model execution.
POST `/v1/chat/completions` converts the documented text/function-tool subset to
Responses using the same account/execution path. See
[standard provider](STANDARD_API_PROVIDER.md) and
[Chat contract](CHAT_COMPLETIONS_API.md) for supported fields and explicit
rejections. Automatic retail reservation and charging remain disconnected.

```sh
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo test --locked -p ovload-gateway --test main architecture::
python scripts/version.py check
python -m unittest discover -s tests/tooling -p test_version.py -v
```

Set CARGO_BUILD_JOBS=1 on memory-constrained Windows hosts.
Imported real-store tests use CPR_TEST_DATABASE_URL and CPR_TEST_REDIS_URL.
Plugin integration can use CPR_PLUGIN_TEST_DATABASE_URL and
CPR_PLUGIN_TEST_REDIS_URL. Use isolated disposable services. Missing local
services may skip work and must not be reported as integration success; CI
explicitly rejects missing service configuration.

Frontend checks remain pnpm lint/build and relevant browser tests under web.
Backend-only source reorganization requires no new UI screenshots.
See [boundaries](BACKEND_STRUCTURE.md), [API](API.md),
[database recovery](DATABASE.md), and [ADR 0015](adr/0015-imported-backend-baseline.md).

## Frontend data boundaries

The React application retains its shared shadcn-admin layouts, forms, dialogs,
tables, charts, and responsive components. Runtime sample records and local
storage implementations of business operations are removed. An unavailable
backend does not authorize fabricated successes or zero-valued statistics.

Management sessions connect customer administration, account/group directories,
procurement and retail pricing, dashboard and usage observability, proxies,
gateway runtime settings, and backup resources to their existing HTTP APIs.
Customer sessions connect profile, API keys, wallet and usage to their
own API namespace. Management responses must never populate customer pages.
Use session-owned query keys, cancellation, and late-response ownership checks.
The profile page has no session-management panel or manual rotation controls.
Identity revalidation replaces session, profile and management permissions only
after the complete verified snapshot is ready; loading must not clear sidebar
permissions. Current-session inspection and sign-out remain authentication APIs.
See [API contracts](API.md) for exact endpoints, permissions and revision rules.

Orders, subscription fulfillment, redemption, referral rewards, announcements,
content audit, lottery, channel monitoring configuration,
SMTP administration, and payment settings have no implemented management
contract. Their original visual components remain, with unavailable statuses,
unknown statistics, empty records and disabled writes. Tabs and presentation
controls remain usable. Do not reconnect these views to fixture arrays, browser
storage, or success notifications without a real backend contract.

Basic site identity, managed logos and personal avatars have backend contracts
under [basic site and personal settings](API.md#basic-site-and-personal-settings).
Website settings connects the four site-identity fields and managed logo to
those APIs. Personal avatar controls use owner-scoped avatar endpoints.
Website registration, login and agreement settings use `/api/admin/v1/auth/settings`;
SMTP and OAuth secrets remain deployment configuration.

The root route and `/sign-in` share a static centered shadcn-admin login page.
One email-or-username field submits to the public login endpoint. The backend
returns the verified audience; the browser then loads that owner's profile and
management permissions before entering the matching workspace. No audience
selector or animated public scene is mounted.

Run `pnpm --dir web lint` and `pnpm --dir web build` for static validation.
Functional acceptance requires the actual HTTPS frontend and backend; an HTTP
static preview cannot verify Secure cookies, CSRF, or permissions. Use separate
management and customer browser sessions, provision identities through the real
CLI/API, and keep their secrets outside the repository. Visual checks cover
representative changed regions and affected viewport states.
