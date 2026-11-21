# Next refactor: customer identity and authorization

Status: identity sessions, independent customer lifecycle, scoped operator security,
model credentials, aggregate admission and customer usage are implemented.
The customer and operator identity frontend uses real APIs; mail delivery and
commerce integrations remain incomplete. This is the product adaptation after the
imported workspace baseline. It implements the
identity boundary defined by [Identity API](IDENTITY_API.md) and
[admission and tenancy](ADMISSION_AND_TENANCY.md) without replacing the imported
execution framework. [API](API.md) records current executable behavior.

The first slice now provides portable `AccessContext` contracts, typed tenant,
user, management-principal, model-key and session identifiers, validated
management/customer projections, and migration `0034_identity_and_tenancy.sql`.
The migration stores only password/key/session verifiers, enforces customer
ownership with composite foreign keys, and keeps identity audit rows
append-only. `IdentityService`, `PgIdentityStore`, explicit owner CLI bootstrap
and the implemented `/api/v1` and `/api/admin/v1` routes now provide real
customer/management sessions, customer provisioning, own profile, session
revocation/rotation and customer activation/suspension. Migration 0035 adds
bounded durable authentication budgets. [ADR 0016](adr/0016-identity-session-authority.md)
records the authority boundary. Imported resource routes now require live
management sessions and platform grants. Model keys now
use verifier-only storage and durable execution authority under
[ADR 0017](adr/0017-model-key-authority.md). See [Identity API](IDENTITY_API.md)
for the actual routes and verification limits. Tenant is an internal customer
partition; team membership and shared organization wallets are outside scope.

## Outcome and scope

Establish a complete customer/management identity boundary: provision a customer,
sign in with the correct audience, manage only owned profile/sessions/keys,
authenticate a model operation, read only owned usage, and enforce revocation
or suspension against subsequent authorization decisions. Carry ownership through
HTTP/SSE/WebSocket requests,
queued dispatch, continuation, internal plugin calls, and audit.

Management principals are separate from customer users. Platform provider
accounts, shared egress, and public groups remain platform inventory; do not add
a tenant column indiscriminately to shared resources. Tenant-private grants,
customer keys, sessions, usage, and future financial records require explicit
verified ownership. A shared upstream account never authorizes cross-user state.

This phase does not introduce customer retail charging, payments, subscriptions,
or new provider families. Current model execution remains a controlled development
integration until the following USD reservation/settlement phase is complete;
do not publish it as a paid customer gateway.

## Source ownership

| Owner | Changes |
| --- | --- |
| `core` | Portable verified principal/tenant/key context and execution ownership; keep provider identity separate |
| `admin` | Customer and management identity use cases, scoped authorization, session/key lifecycle, and ports |
| `store` | Authoritative PostgreSQL ownership, verifier/session/grant persistence, transactions, and audit adapters; bounded Redis authentication/admission state |
| `api` | Strict identity DTOs, audience-specific sessions, Origin/CSRF checks, stable errors, and scoped handlers |
| `host` and `src/apps` | Bounded password hashing, operator bootstrap, required configuration, and composition |
| Plugin runtime | Verified caller/delegation propagation into host services and nested model calls |
| `web` | Replace existing preview authentication and affected customer/management flows with real clients and honest unavailable states |

Reuse existing services and ports where their ownership fits. Add a customer
access module rather than mixing tenant ownership into the current provider
`identity` module. Record durable schema and authorization decisions before
implementation; architecture assertions change only with the corresponding
decision and real callers.

## Implementation sequence

1. Define customer, tenant, management principal, grant, session, model-key and
   audit aggregates and their state transitions. Append migrations after 0033.
   Provision the initial management owner via bounded secret file/stdin, with
   an explicit audited bootstrap procedure; no implicit HTTP default owner.
   Registration/provisioning atomically initializes only a zero-USD account;
   balance changes belong to the financial workflow.
2. Implement customer and management session use cases with separate audiences,
   durable revocation, strict Origin/CSRF checks, bounded password hashing and
   authentication budgets. Complete settings policy, challenges, notification
   intents, profile and session operations against the Identity API contract.
   A durable notification intent is not a delivered email.
3. Apply default-deny scoped authorization to every management entry point,
   including deployment-level API keys and internal plugin principals. Replace
   unscoped bypasses and enforce tenant/actor context inside use cases as well
   as HTTP translation. Grant changes and suspension update authority and audit
   atomically; Redis or an old snapshot must not extend revoked access.
4. Replace plaintext model-key storage and snapshot matching with verifier-only
   authentication. Disclose a random secret once on creation/rotation. Remove
   reveal endpoints, configuration exports and usage responses that expose
   secrets. Idempotent replay returns metadata without the secret. Bind each key
   immutably to its tenant, user, authorized group and billing source.
5. Carry verified ownership into existing execution and observations. Revalidate
   each logical WebSocket operation and immediately before every upstream dispatch,
   including initial attempts, retries and queue resumption. Store must serialize
   the authoritative dispatch decision with relevant key/user/grant revocation;
   a committed revocation prevents subsequent authorization decisions. Work
   authorized earlier may already execute: cancel it within bounded lifecycle
   rules without claiming that cancellation proves nonexecution. Bind continuation
   to tenant, credential principal, session and profile/egress generations;
   unavailable ownership evidence must not become external continuation fallback.
   Apply the same checks to plugin key-ID resolution and nested calls.
6. Connect existing React forms and affected workspace flows through real clients
   under `web/src/api/`, preserving the shared shadcn-admin layout. Replace
   corresponding preview state and callers together. Do not add routes outside
   the authorized feature scope or relabel legacy numeric balances as USD.

The sequence defines implementation order, not parallel public aliases. A slice
is accepted only when its complete behavior, callers, errors and ownership checks
work together. Unsupported endpoints remain explicit rather than returning
synthetic success.

## Data transition and acceptance

Before enabling the new identity boundary, take a backup and inspect existing
keys, group bindings, usage and management configuration. Require an explicit
operator mapping for records without customer ownership. Multiple old groups
must not be guessed into the target single-group binding. Migration 0036
quarantines imported unowned keys, preserving IDs, previous enabled state,
group evidence and financial history. It reports pending assignments through
the management identity API; every assignment is explicit and audited.
A nonempty unused identity-key catalog rejects migration with an actionable report;
there is no automatic default tenant, dual plaintext/verifier authentication,
schema downgrade, or silent orphaning of history.

Acceptance must cover cross-tenant reads/writes and continuation, revoked or
suspended identities during queueing, between attempts and during WS operations,
the authorization/revocation ordering boundary, concurrent key rotation,
session/CSRF failures, grant approval/revocation, authentication capacity limits,
plugin delegation, and migration interruption/recovery. Verify secret absence in
storage exports, logs, DTOs and replayed responses. Real PostgreSQL/Redis evidence
is required for the corresponding guarantees. Respect the user's current test
instructions; these are future acceptance requirements, not checks run by
writing this plan.

After identity acceptance, implement the separate USD price/reservation/settlement
flow using `max(2 * last_positive_actual_charge, Q)` and retained holds for unknown
execution, as specified by [Billing and Pricing](BILLING_AND_PRICING_DESIGN.md).
