# ADR 0013: Product workflow implementation boundaries

Status: accepted. Date: 2026-10-27.

## Decision

The remaining product workflows use the existing single-package module boundaries.
Identity owns customer/management sessions, permission grants, users and model keys.
Routing owns inventory and immutable publication; billing owns prices and financial
authority. Commerce owns quotes, payment evidence, fulfillment and rewards. Operations
owns content, settings, notification delivery, diagnostics, proxy and backup jobs.

Customer and management cookie audiences are separate from each other and from model
API keys. All unsafe browser requests require an allowed Origin and a session-bound
CSRF token. Application commands authorize the actor and explicit target scope before
loading protected records. Management scopes never default to a tenant or to platform.

The identity migration creates the shared append-only `audit_events` table. Feature
repositories append redacted audit facts in the same transaction as their mutations.
There is one audit persistence adapter, not one security log per feature. Workflow
state and financial grants use their own durable idempotency constraints; a generic
JSON CRUD endpoint must not substitute for domain commands.

Protected values use a shared `SecretCipher` port with AES-256-GCM and a fresh OS nonce
per write. Associated data includes the resource and tenant/principal identity.
The master key is operator-provided outside source control. Challenge tokens are
hashed for verification and encrypted only for durable notification delivery. Raw
model secrets are disclosed once and never included in ordinary reads or audit data.

Password hashing, SMTP, payment signing, HTML sanitization, template rendering and
object storage use maintained libraries. Blocking work has explicit native permits.
External side effects follow durable intent, bounded execution and fenced completion;
unknown payment/dispatch results require reconciliation. No network call runs inside
a database transaction and no local preview state establishes server success.

Each feature publishes its implemented HTTP/OpenAPI contract and failure tests.
Schema changes append numbered migrations; existing checksums are preserved. The
complete resource inventory remains in [Product Domain Design](../PRODUCT_DOMAIN_DESIGN.md).
