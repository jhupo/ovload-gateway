# ADR 0023: Independent Customer Lifecycle

Status: accepted except online registration-policy administration, superseded by
[ADR 0029](0029-retire-online-permission-configuration.md). Database acceptance has not been run under
the user's instruction to skip tests.

## Decision

Each customer owns an independent identity and zero-USD wallet. `tenant_id`
remains an internal partition key; registration never joins an organization,
shares a wallet, transfers ownership, or accepts an invitation.

An authoritative singleton registration policy defaults to closed registration,
disabled verification/recovery, and explicit positive customer admission
ceilings. Platform security administrators read and replace it with a reason
and optimistic version. Registration reads that policy inside its transaction.
Email addresses are validated and normalized before identity lookup. Argon2id
password work has bounded blocking capacity and durable authentication budgets.
Responses do not reveal whether an email address is already registered.

Customer records separate optimistic `revision` from credential
`authority_generation`, initially preserving the previous generation value.
Display-name changes advance only revision. Password and security changes advance
both and revoke sessions. Management revision remains its credential authority;
management identity mutations revoke all management sessions. Password changes compare the verified password hash,
live session, and expected revision inside the final transaction, so concurrent
password changes cannot authorize each other with a stale verification result.

Registration verification and customer password recovery use random 256-bit,
single-use bearer challenges, with twenty-minute expiry and purpose-bound
SHA-256 digests. Password-reset consumption also compares the original owner
generation. Tokens and pending registration data are encrypted using the
library AES-256-GCM implementation with random nonces, a deployment key, and
purpose/identity associated data. The database stores no plaintext tokens or
pending passwords. An encrypted notification outbox is bounded under the policy
lock and expires alongside its challenge. Replacing a challenge cancels earlier
pending notifications for the same email and purpose.

The optional notification key must be loaded from a restricted deployment file.
When it is absent, verification/recovery requests fail unavailable. An outbox
acceptance means a notification intent is pending, never that mail was delivered.
There is no simulated SMTP success. A future delivery adapter must preserve
encrypted payloads, use bounded claiming and retry, and acknowledge actual
transport delivery separately.

All mutations lock existing identity owner/session rows before changing shared
authority and append an audit record in the same transaction. Registration and
challenge issuance lock the policy first; challenge consumption locks policy,
then the target owner, then the challenge, avoiding reverse owner lock order.
No public endpoint accepts a password hash, internal owner assignment, or
customer wallet amount. Customer profile mutation changes only the name.
