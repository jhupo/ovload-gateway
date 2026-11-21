# ADR 0015: Adopt the imported backend as the implementation baseline

Status: accepted

Date: 2026-10-27

## Decision

The user replaced the previous backend sources with the backend of
https://github.com/zyycn/codex-proxy-rs and authorized adapting that implementation.
This supersedes the extraction plan in ADR 0014. Preserve the imported execution,
provider, storage, plugin, and update behavior while establishing a build baseline.
The exact revision of the user-supplied copy has not been independently verified;
do not describe the entire copy as a verified upstream commit.

The repository has one virtual Cargo workspace at its root. The gateway package
is `src/apps`, containing its conventional `src` and `tests` directories.
Libraries live under `src/crates/{admin,api,core,host,protocol,store}`; concrete
providers remain under `src/crates/providers`, and the existing plugin SDK,
runtime, and CLI live under `src/crates/plugin`. Directory names omit the
`gateway-` prefix. Local library package names use `ovload-`; concrete provider
package names and external protocol identities remain unchanged.

Preserve the imported dependency versions, features, lint policy, release
profiles, and pinned SQLx fix. Use Rust 1.99.1 consistently. Packages inherit the
shared application version. Preserve all existing migration bytes and their
frozen digest manifest; later schema changes append after migration 0033.
The supplied copy had CRLF line endings in all 33 SQL files. Restore their
canonical LF bytes only after verifying that each result matches the imported
frozen SHA-256 digest. Do not change SQL statements or rewrite the digest list.
Keep Apache-2.0 attribution for imported sources alongside the existing notices
for the rest of the project.

## Scope of the first implementation step

Unify workspace metadata, source paths, package imports, architecture tests,
toolchain, and version checks. Supply the missing sanitized configuration example
required by integration tests. Box the three internal Codex attempt-error
payloads that exceed Windows Clippy's result-size limit, retaining typed errors
and retry decisions. Preserve business behavior. Do not restore the
removed backend or introduce old import aliases, dual configuration names, or
compatibility wrappers. A successful build is not evidence that the complete
Ovload product has been implemented.

The imported backend currently has administrator/API-key authentication,
Codex/Grok Build provider execution, and per-key upstream USD cost budgets.
Customer registration, tenant ownership, wallet/subscription reservations,
customer retail pricing, and commerce remain follow-up work. Its single-replica
financial buffer, plaintext model-key storage, provider-owned account selection,
optional raw diagnostic logging, and resource limits require explicit changes
before accepting the full product safety contract.

## Accepted product choices

All customer balances, tariffs, allowances, reservations, settlements, refunds,
and ledger entries use USD. Use checked fixed-point amounts with ten decimal
places, matching the imported Decimal and PostgreSQL numeric(20,10). Procurement
cost and customer retail charge remain distinct facts. CNY payment quotes freeze
the original CNY amount, exchange rate, and USD credit on the order.

The reservation policy remains `max(2 * last_positive_actual_charge, Q)`, where
Q is an enforceable maximum retail USD charge. Unknown execution or usage does
not imply zero charge or release of a reservation. These are target contracts,
not capabilities of the imported budget implementation.

Online updates retain the imported `system_update` release/checksum/staging/
replacement/restart/rollback flow. Adapt project identity and release packaging
in a dedicated step. Restart can interrupt connections; zero-downtime rollout is
no longer an acceptance requirement. PostgreSQL and Redis remain independent
persistent services and are not replaced or reset by application updates.

## Validation

Run formatting, strict workspace Clippy, workspace tests, architecture contracts,
version-tool tests, and migration digest checks. Report missing real PostgreSQL,
Redis, Docker, or provider verification separately. The baseline commit includes
only backend integration and its directly affected tooling/documentation; leave
unrelated frontend changes and generated local artifacts outside it.
