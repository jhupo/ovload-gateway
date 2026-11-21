# Audit scope, method, and validation

[Main catalogue](README.md) · Source version **0.2.34**, commit `4b9488732a560797446ee677517adbd6581c8d60`. Static source inventory; not runtime verification.

## Provenance

| Item | Value |
| --- | --- |
| Audit date | 2026-09-21 |
| Source checkout | C:\Users\jhupo-pc\Desktop\sub2api\sub2api |
| Git commit | 4b9488732a560797446ee677517adbd6581c8d60 |
| Embedded server version | 0.2.34 |
| Tracked files | 4037 |
| Final source git status | Clean |
| Content integrity | All 4,037 tracked file SHA256 values match the pre-audit baseline |
| Catalogue entries | 241 |
| Catalogue status counts | {'G': 156, 'I': 79, 'L': 6} |
| Go production files | 1383 |
| Go test files | 1381 |
| Feature execution tests | Not run; this was a read-only source audit |
| Live integrations | Not called |
| Repository changes for this request | Documentation only under reports/sub2api-feature-inventory-2026-09-21/ |

## Inspection and extraction method

1. Enumerated the tracked checkout rather than treating README claims as the inventory. Inspected route registrations, handlers, services and frontend guards; used implementation to resolve documentary conflicts.
2. Resolved nested Gin route groups within each registration function and retained aliases/mode distinctions. Independently counted lexical HTTP method-registration statements: 698, matching the route index; no unresolved groups remained. Setup and normal mode share one method/path pair.
3. Enumerated the Vue router array only, excluding redirect object literals in navigation guards. Recorded 66 definitions and their auth/feature metadata, component, alias and redirect. Dynamic guards are explained separately.
4. Indexed 595 configuration struct fields and 669 central settings/DTO declarations; added subsystem-local setting constants and direct environment lookup names. These are scoped lexical inventories, not proof of all effective runtime values.
5. Indexed 768 selected backend modules and their exported symbols, then added other authored backend/frontend paths to expose settings or helper families without standalone routes. Followed startup wiring to identify worker ownership.
6. Listed 43 Ent schema files including mixins and all 293 SQL migration files. CREATE TABLE names are historical evidence only.
7. Cross-checked deprecated data-management services, async/batch feature gates, Live platform support, provider-specific admission and acknowledgement-only telemetry against executable source.
8. Recomputed the SHA256 baseline for every tracked source file and checked clean git status after inspection. No source code, dependency, configuration, database or runtime state was modified.

## Coverage limits

This is a comprehensive source-surface inventory at the recorded commit, not a security certification or execution proof. It does not claim every code branch, provider model ID, remote service behavior or possible runtime configuration was exercised. External provider/merchant credentials were not used. Generated code, test fixtures, historical proposals and build caches are not independent product capabilities. Endpoint aliases and unsupported/deprecated paths remain visible rather than being silently omitted.

The frontend and configuration appendices have explicit lexical boundaries. The API list excludes static asset expansion and separates the 11 explicit pprof patterns. A default/guard observed in source may change if a deployment overrides it. Names of secret fields are documented, but secret values and user prompts are not copied.

## Report validation

- All source evidence targets were checked to exist in the local checkout.
- Feature IDs are sequential and unique; each catalogue entry has source evidence.
- HTTP registration counts, distinct method/path counts and frontend route counts were asserted during rendering.
- Markdown report links, placeholder removal and whitespace were checked after writing.
- Existing unrelated Ovload backend working-tree changes were preserved; no commit or push was performed.
