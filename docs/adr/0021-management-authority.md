# ADR 0021: Live platform operator authority and independent grant approval

Status: live authorization and offline provisioning remain accepted. Online
principal, role, grant and approval administration is superseded by
[ADR 0029](0029-retire-online-permission-configuration.md). The original decision
below records the removed configuration workflow, not current HTTP capability.

Management principals represent platform operators. A tenant scope identifies
one independent customer's data partition; it does not introduce organizations,
team membership, invitations, shared wallets or ownership transfer.

The management security service and PostgreSQL adapter own principal lifecycle,
bounded role bundles, explicit customer/platform grants and durable grant
requests. Each protected read and write rechecks a live management session and
its current permission. Platform-only adapters call an explicit platform
authorization method; a customer-scoped grant never authorizes global control.
The current session's effective grants can be projected for UI decisions, but
the projection never replaces authorization at a later operation.

Security mutations require the current password and a reason. Password work
uses a bounded blocking pool; the transaction rechecks the exact credential
hash used for reauthentication. Password changes and principal suspension or
revocation advance authority and revoke sessions atomically. Principals and
grants are revoked rather than physically deleted so audit references survive.
Revoked principals cannot be restored.

Roles are permission bundles with platform or customer scope, bounded to one
hundred records. A grant request copies its selected role's permissions and
revision. Subsequent role edits do not alter pending requests or issued grants.
Requests carry an explicit platform or customer scope and expire after twenty
four hours. A different active operator must approve or reject with a current
password and reason. Both requester and approver must still have security
management and every copied permission for that exact scope at approval time.
Neither participant can assign permissions they do not possess. Approval also
rechecks target status and inserts one additive grant in the same transaction.
No direct grant-creation bypass or self-approval endpoint exists.

One bounded PostgreSQL security mutex serializes all security mutations before
principal/session/grant locks. Reads use existing live identity authorization.
This prevents concurrent revocations, status changes and approvals from
disabling the last active platform security administrator. Permanent platform
security grants are required; temporal expiry cannot silently remove the last
administrator. The mutation and metadata-only audit commit together. Lists use
exclusive UUID cursors and a one-to-one-hundred page limit; roles return the
complete bounded catalog. HTTP writes use strong revision preconditions.

The existing operator bootstrap remains the sole first-owner path. HTTP creation
of another operator grants no permissions automatically. Explicit offline
`identity provision-operator` provisioning requires an existing owner, accepts
its password from an operator-owned file and grants a permanent platform bundle
with a system audit event. This establishes administrative redundancy without
weakening HTTP independent approval or adding a self-approval exception.

No database acceptance or concurrency tests have run under the user's active
instruction to skip tests. Static compilation does not establish recovery or
financial/authorization readiness.
