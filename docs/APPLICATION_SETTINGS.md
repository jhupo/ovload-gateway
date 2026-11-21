# Application integration settings

Mail, Alipay and audit credentials are stored in PostgreSQL by migration 0055.
They use the existing provider credential encryption key. Keep that key with
database backups; restoring the database without it cannot recover credentials.
Gateway settings are independent of these changes.

## Management API

All endpoints below use the `/api/admin/v1` prefix and require
`security.settings.manage`. Writes require the browser CSRF token and the
configured password confirmation policy.

| Endpoint | Behavior |
| --- | --- |
| `GET /settings/integrations/{mail,payment,audit}` | Read values, revision and secret-presence flags |
| `PATCH /settings/integrations/{kind}` | Save `{values,secrets}` with `If-Match: "revision"` |
| `POST /settings/mail/test` | `{recipient:null}` tests SMTP; an email address sends a test message |
| `POST /settings/audit/{id}/test` | Test the saved node, API key and outbound proxy; return measured latency |
| `GET /settings/backups/state` | Read persistent backup storage state |
| `PATCH /settings/backups/state` | Save `{enabled}` with the storage revision in `If-Match` |

Secrets are write-only: omit or send an empty string to retain a saved secret;
send `null` to clear it. Reads never return a saved password or PEM key.
Stale revisions return 409. Changes are recorded in the identity audit log.

## Mail

Save the SMTP hostname, port, username, password, sender address and sender name
on the mail settings page. TLS with port 465 uses implicit TLS; other TLS ports
use STARTTLS. Disabling TLS selects explicit plaintext SMTP for local relays.
Saved settings take effect without restarting the gateway. With no saved SMTP
host, the existing deployment SMTP configuration remains the fallback.

Registration verification, password reset, audit and recharge messages use the
saved event templates. Template variables are validated and HTML escaped. Mail
delivery uses a durable outbox with bounded retries. The frontend origin in
`api.identity_public_origin` supplies password reset links. SMTP credentials
must be configured before enabling email verification or password recovery.

## Alipay balance recharge

Configure the Alipay application ID, seller ID, RSA2 merchant private key and
Alipay public key on the payment settings page. These are different keys: the
merchant signs requests; the Alipay public key verifies responses and callbacks.
The configured public origin must be reachable by Alipay for notifications.

* Notification endpoint: `POST /api/payments/alipay/notify` (form encoded).
* Customer config/orders: `GET /api/v1/payments/{config,orders}`.
* Customer commands: `POST /api/v1/payments`, with action
  `quote`, `create`, `get` or `cancel`.
* Creation requires a UUID `idempotencyKey`; retries preserve the same order.

Recharge amounts and fees are CNY; wallet credit is USD. For example, a CNY 100
recharge with multiplier 0.14, 10% bonus and 2% fee credits USD 15.40 and charges
CNY 102.00. Amounts use integer decimal arithmetic. User-specific offers replace
global tiers for that user. The subscription exchange-rate field is persisted
separately and does not change balance recharge calculations.

The server enforces amount, daily, pending-order, expiry and cancellation limits.
QR checkout and desktop/mobile redirect modes use signed Alipay requests. Each
order snapshots amounts and verification credentials. Credential changes do not
invalidate notifications for an existing order. Valid paid callbacks atomically
write the order, wallet ledger, confirmed recharge, referral settlement and
recharge mail outbox. Duplicate callbacks do not duplicate credit. Cancellation
closes the provider trade and reconciles a payment racing with cancellation.

`OVLOAD_ALIPAY_GATEWAY` overrides the official gateway only for isolated protocol
fixtures or an Alipay sandbox. The default is the official HTTPS gateway.

## Audit nodes and backups

Audit keys belong to their node IDs and are encrypted separately from public
feature settings. Existing environment-based audit keys remain a runtime
fallback. Enabled outbound proxies can be selected in the node editor.

Backup storage must pass its connection test before being enabled. Disabling it
also stops the schedule and prevents new manual or scheduled archives. Existing
archives remain downloadable, deletable and restorable. An active backup must
finish before storage state can change. Re-enabling does not silently restart a
previous schedule. Image object storage retains its separate configuration.

## Server verification

`tests/deploy/application_integrations_fixture.py` provides disposable SMTP,
RSA2-signed Alipay, audit and S3 protocol fixtures on the Docker bridge.
`application_integrations.cjs` exercises HTTP workflows against a cloned database.
`application_integrations_ui.cjs` covers the browser settings and recharge flow.
These fixtures do not use real provider credentials or issue real payments.
