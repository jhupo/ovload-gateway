# ADR 0025: Customer-owned execution usage

Status: accepted for implementation.

Customer browser sessions can read their own root execution observations through
list, detail, summary, daily UTC trend and CSV export. Store revalidates the live
session inside each transaction and derives both customer partition and user ID
from it. Queries never accept an owner supplied by the browser. Internal child
observations are excluded using the immutable admission ownership fact.

Filters use a required half-open UTC range of at most 31 days, and optional key,
public model and outcome. Lists use an exclusive descending start-time/request-ID
cursor, scoped to the same owner and filter, with 1..100 results. Detail returns
not found for other owners. Summary and trend inspect at most 100,000 source rows
and reject an exceeded budget rather than return partial totals. Each database
statement has a five-second timeout. CSV exports require at most 1,000 rows,
reject truncation and use the CSV library with spreadsheet-formula escaping.

Only customer-safe execution identity, outcome, HTTP status, times and token
facts are exposed. Unknown quantities remain null. Retail USD comes only from a
matching settled retail reservation with the same request, customer, user and
key. Provider procurement costs, raw errors, account identities, credentials,
headers and payloads are never exposed or interpreted as customer charges.
No retail reservation means an unknown retail charge, not a free request.

These reads do not activate retail charging. Observations retain their existing
buffered durability and freshness semantics. No real-database acceptance tests
have been run under the current instruction to skip tests.
