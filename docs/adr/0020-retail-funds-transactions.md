# ADR 0020: Durable retail funds transactions before execution activation

Status: implemented in code; database acceptance remains unverified. The user selected the funds
transaction stage without activating automatic model-request charging.

## Scope

Implement a portable internal financial port and its direct PostgreSQL adapter,
tenant-scoped operation reads, and supervised expiry reconciliation. Keep the
current model-forwarding lifecycle unchanged in this stage. No HTTP endpoint
accepts a customer-provided quote, token bound, selected tariff or charge as
financial authority. Provider execution activation requires a later adapter
contract proving enforced bounds and complete authoritative usage.

Current Codex removes the requested output cap. Grok Build catalog context
fields are presentation/compaction metadata, and its available output parameter
does not establish a ceiling for every billable token. Existing normalized
observation usage also fills missing dimensions with zero. These facts cannot
be used to activate the strict precharge policy from ADR 0018. A tokenizer
dependency alone does not establish the upstream request-framing contract.

## Reservation And Dispatch

Core owns validated operation references, internal commands, typed outcomes and
the `RetailBillingPort`. Store owns transaction-local authorization, immutable
price hydration and financial persistence. Reuse the Core calculator and USD
scale ten. The internal reserve command supplies frozen identity, requested
public model/group/tier, route revision, a transformed-request digest and
verified bounds. It never supplies a retail price revision or amount. This
stage freezes the selected group's persisted multiplier in integer basis
points. The initial policy is 10,000 basis points. Sample preview inputs never
change that business policy; see [effective prices](../RETAIL_PRICING_API.md).

Reserve locks and rechecks tenant, user, group, grant and key authority, then
the wallet and existing operation for replay. New reservations subsequently lock
the catalog and published revision. Price publication never acquires a wallet,
so this ordering has no reverse financial lock path. Replay does not depend on
today's published catalog still existing. After obtaining the wallet lock,
a separate statement reads the latest positive settled customer charge
for the exact tenant/key/source/group/model/tier. Store calculates `Q` and
`R = max(2 * A, Q)` and writes one hold and append-only event. Insufficient funds
reject the entire transaction. An existing operation ID requires the same
canonical command fingerprint and live authority; it cannot create another hold.
Frozen owner generations and request facts are immutable.

Reservations expire thirty minutes after database creation. Expiry prohibits
new dispatch; it never proves nonexecution or authorizes a refund. Dispatch
checks live authority, wallet and reservation state, expiry and exact ownership
in the same transaction. Attempt identity freezes provider, mapped model,
account, request-profile generation and egress generation. At most 100 attempts
are accepted, and another attempt is permitted only when all preceding attempts
are proven not sent. There can be at most one potentially executed attempt.
This restriction avoids settling several executed attempts from one receipt.

An intent is a fresh dispatch permission, not a replayable idempotent command.
Duplicate intent creation conflicts. A lost acknowledgment cannot authorize
resending; it leaves durable uncertainty. Dispatch evidence is append-only and
idempotent by command fingerprint. Ambiguous evidence may resolve, but sent and
not-sent final evidence cannot contradict each other or revert to ambiguous.

## Completion And Recovery

Completion locks the wallet before the reservation and its evidence. It uses
frozen ownership even if the credential was subsequently revoked. Identical
completion retries return the durable outcome; changed payloads conflict.

Proven nonexecution releases only when every intent is confirmed not sent,
including the case where no intent exists. Complete authoritative usage requires
exactly one sent attempt and no unresolved attempts. Missing usage remains
unknown. Store revalidates the frozen price digest and bounds, calculates one
half-even rounded total and preserves exact rational component subtotals. It
never substitutes provider procurement cost or independently rounds components.

With a frozen tariff and validated bounds, the rounded actual charge cannot
exceed the upward quote or initial hold. Usage exceeding the saved bounds is a
contract violation and retains the hold for reconciliation; this stage never
widens bounds or adds an unreachable extension path. A successful settlement writes
usage evidence, receipt, reservation transition and positive ledger debit in
one transaction. Zero charges have a receipt and no debit. Unknown execution or
usage retains funds and opens a case. Later authoritative completion can close
that case using an explicit system resolution actor.

A scheduled worker scans at most 32 expired held operations per invocation.
Each candidate uses its own bounded transaction, locks wallet then reservation,
and rechecks database expiry/state. It only opens an idempotent reconciliation
case; it never calls providers, retries execution, settles or releases money.
Concurrent workers need no financial lease/fence because all decisions and
effects occur under these PostgreSQL locks. The existing worker supervisor
bounds scheduling, cancellation and shutdown. Redis leadership is an efficiency
mechanism, not financial authority.

## Reads And Schema

Customer billing-operation reads derive their tenant from the live session.
Management reads require an explicit tenant and live scoped `billing.read`.
Both expose USD quantities and frozen public selectors without provider account,
credential, procurement data or private evidence. Lists are bounded and cursor
ordered by creation timestamp and operation ID; cursor lookup remains tenant
scoped. Read authorization is rechecked inside its transaction.

Append migration 0039 for immutable fingerprints/authority facts, expiry and
versions, evidence monotonicity, selected-rate component integrity, and explicit
reconciliation resolution actors. Preserve migrations 0037 and 0038 byte for
byte. Deferred checks validate the final reservation/receipt/ledger/case state.

The user's instruction to skip tests remains active. Static checks cannot prove
PostgreSQL concurrency, migration execution, provider limits or recovery. No
database is migrated and no automatic charging is advertised by this stage.
