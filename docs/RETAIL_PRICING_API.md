# Retail pricing workspace and effective prices

The existing `/channels/pricing` workspace reads and mutates the immutable retail
catalog through `/api/admin/v1/pricing/revisions`. It no longer stores local
channels, provider prices, or fabricated model catalogs. Procurement settings
remain a separate concern.

## Revision workflow

List at most 50 revisions per cursor page. Read the selected complete document,
inspect its explicit dimensions and units, validate its digest, and calculate a
sample usage total on the server. A changed document creates a new sealed draft;
published and retired content is immutable. The editor supports the finite Core
dimension vocabulary, all five required text dimensions, complete group/model
replacements, and a maximum of 128 cards. Decimal rates remain strings.

Creation uses the observed catalog ETag and a stable idempotency key. Publication
and retirement use the selected detail ETag, its catalog generation, a reason,
and a stable idempotency key. A failed or lost response retains the command key
for an identical retry. Conflicts require an explicit reload before a changed
command. Neither validation nor a sample calculation dispatches or charges.

## Effective price queries

`GET /api/admin/v1/pricing/effective` requires live platform `billing.read`.
`GET /api/v1/pricing/effective` requires a live customer session and an enabled
group available to that customer. An explicit denied group grant overrides a
public group. Both require exact `account_group_id`, `public_model_id`, and
`service_tier` query parameters. Unknown or missing selectors fail closed.

Within one bounded transaction, lock and verify authority, the group policy,
the catalog, and the immutable published document. Select a complete group/model
replacement before service-tier selection; otherwise select the complete
platform card. Return public selectors, the published revision identifier,
catalog generation, persisted group `multiplier_bps`, base rates with units,
and exact effective unit prices. Effective prices multiply the scale-ten base
rate by integer basis points without rounding; they can require fourteen
fractional digits. Rounded request totals still use the existing scale-ten,
half-even calculator. No customer multiplier is inferred or accepted.

Customer results contain no provider account, credential, procurement cost,
other group's selector, or management-only revision history. Reads do not
authorize execution or prove provider support. Unpublished or retired catalogs,
disabled groups, denied access, and absent prices do not produce zero prices.

The internal funds reservation freezes the selected persisted group multiplier
with the tariff. Replays retain the original frozen amount even after policy
changes. Automatic model-request reservation and charging remain disabled.

## Frontend state

Queries and editors belong to the initiating management session. Session changes
unmount their state. Writes verify that owner before sending and before applying
responses. Loading, permission denial, failures, empty catalogs, and request
conflicts are explicit. The existing shared table, original Main layout, dialogs,
field labels, root Sonner feedback, and English/Chinese resources are reused.

Database migrations and live integration acceptance are not run under the user's
existing instruction to skip tests. Static builds do not prove database races,
recovery behavior, or upstream support.
