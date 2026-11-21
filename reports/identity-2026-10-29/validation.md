# Independent customer identity integration

The product model is an LLM relay with independent customer accounts. Tenant IDs
are internal partitions, not organizations. No team invitations, member roles,
shared team wallets, member departure or ownership transfer were introduced.

The implementation connects customer/operator sessions, profile/password/session
controls, customer administration, operator roles/grant approval, model keys,
aggregate admission, scoped usage and exact USD balance display. Automatic model
retail charging remains disabled by the user's earlier decision. Encrypted
notification intents are not a mail delivery integration. Payment/subscription/
referral previews remain separate work.

## Static verification

- Workspace Clippy with all targets and warnings denied passed.
- Final Rustfmt check, frontend TypeScript/Vite production build, migration digest,
  document file-link and diff checks passed. Frontend lint passed with two existing
  TanStack/React Compiler warnings; Vite reported its existing large-chunk warning.
- No Rust/frontend tests, real database operations, migrations, upstream traffic,
  commit, push or deployment were performed.
- Read-only review found no concrete customer-usage schema mismatch or identity
  authority blocker. Platform-resource authorization linearizes at request-time
  as ADR 0024 specifies; already authorized operations may finish after revocation.

## Rendered review

The actual Vite application ran at http://127.0.0.1:5174. Playwright browser
transport fixtures supplied synthetic layout-only API responses. They did not
alter production clients or demonstrate server behavior. Profile session reads
were deliberately unavailable and exercised its persistent error/retry state.

Inspected desktop 1440x1080 and mobile 390x844 light-theme regions: customer and
operator sign-in, model-key table and create dialog, customer dashboard and daily
chart, usage filters/table, profile/password/session form, customer directory,
operator directory/registration policy. Tables retain contained horizontal
scrolling on mobile. No page-level horizontal overflow or JavaScript page errors
were observed. Corrected a hidden single-point chart and removed the profile's
superseded sample badge; recaptured only affected regions.

Evidence is under `output/identity-review/`. No theme/palette/shared outer layout
changes were made, so dark-theme/1920px checks were not required. Screenshots
cannot establish database migrations, runtime isolation, concurrent admission,
grant approval, recovery delivery or money transaction correctness.
