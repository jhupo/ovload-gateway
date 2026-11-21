# Channel configuration acceptance — 2026-10-03

## Scope

Channel pricing is a configuration list with a scrollable channel editor. Channel monitoring contains configuration only. The latest user instruction supersedes the generated monitoring transfer-list design: monitored groups use the shared managed-group checkbox table, and ignored errors use a separate checkbox collection below it.

## Freeze diagnosis and fix

The pricing table received `channels.filter(...)` directly as its data. Every component render produced a new data identity. TanStack Table's pagination auto-reset could then schedule another state update, creating an unbounded render/reset loop after actions such as opening the editor. The filtered array is now memoized by channels, status, and query. The user and group tables pass stable imported fixture arrays and do not share this pattern.

A second interaction obstruction was found: validation toasts covered the sticky monitoring actions. Channel validation messages now clear the footer; opening the model catalog dismisses the editor validation toast. Mobile pricing rows keep name, status, and actions visible and show group/price counts beneath the name.

## Real-page evidence

Screenshots are from the integrated Vite application, not static mockups. Evidence is under `web/output/channel-qa/regression/`. Original PNGs were inspected directly and in labeled contact sheets. Earlier in-app browser captures are under `output/channel-qa/`; some old filenames misidentify the theme during a stalled transition, so the regression set is the authoritative evidence.

| Viewport | Themes | Reviewed components and states |
| --- | --- | --- |
| 1440 × 900 | Light, dark | Pricing list, empty list, create editor, provider-filtered group table (selection and empty states), mapping inputs, model catalog, expanded pricing, time windows, discard confirmation, delete confirmation |
| 390 × 844 | Light, dark | Same pricing states, internal editor scrolling, fixed editor footer, compact mobile list |
| 1440 × 900 | Light, dark | Monitoring settings, provider/model controls, group search/select-all, ignored-error selection, thresholds, validation toast, reset |
| 390 × 844 | Light, dark | Same monitoring components stacked vertically, internal checkbox scrolling, bottom actions |

## Regression checks

`tests/e2e/channels-preview.spec.ts` exercises repeated create/open/cancel and focus restoration, invalid save, provider selection, mapping, model import, expanded billing, time windows, discard/cancel, local save/reopen, search, deletion, status toggle, monitored-group search/select-all/empty state, ignored-error changes, invalid thresholds, and reset. It asserts no browser page errors and no backend write requests. A separate case opens and dismisses existing user creation/invitation and group creation dialogs.

The full workflow includes many real-page interactions and screenshots. Its overall test budget is 180 seconds on this machine; opening the create dialog retains a 5-second action/assertion bound to catch the original freeze.

## Limits

All channel changes are local preview state. Vendor catalog prices are explicitly sample data; live synchronization, persistence, health probes, and backend billing are not implemented or verified. This is Chromium desktop/mobile viewport acceptance, not physical iOS/Android or full cross-browser certification. The in-app browser has been recovered and checked interactively at port 5173.

## Final verification

- Five integrated browser tests passed (four viewport/theme workflows and one neighboring-dialog regression).
- Frontend lint and production build passed; existing large-chunk build warnings remain.
- Targeted diff whitespace and credential-pattern checks found no issues. No dependencies were added or changed by this task.
- The original card/list/dialog screenshots and the revised mobile list/model-catalog screenshots were opened and reviewed.


## Follow-up: provider groups and daily intervals

- Reorganized the creation editor into aligned name/billing fields, description,
  provider selection, and a consistent switch block. Retained internal scrolling
  and fixed header/footer. Removed an unnecessary vertical scrollbar in the tabs.
- Both group pickers reuse the managed group fixtures and shadcn Table/Checkbox.
  Pricing filters adapters by vendor; unsupported vendor/group combinations are
  rejected and unsupported vendors show an explicit empty state.
- Monitoring group and error sections now stack at all widths.
- Peak/off-peak intervals recur daily in their selected timezone. Removed weekday
  state and controls. Unit coverage verifies midnight overlap and adjacent ranges.
- Review found and fixed mobile empty-table column spanning, and adjusted editor
  error toasts to clear the footer and dismiss when fields change.

Evidence: `output/channel-qa/current/` contains interactive in-app browser captures.
`web/output/channel-qa/regression/` contains the integrated browser workflow
captures. All workflow states were opened and inspected, individually or in
labeled contact sheets. Desktop 1440 x 900 and mobile 390 x 844 were checked in
light and dark themes: create/default/invalid, group selection/search/empty,
provider mapping, model catalog, expanded pricing, daily intervals, discard,
pricing list/empty/delete, monitoring settings/groups/errors/validation/reset.
The final empty-state correction was recaptured and inspected separately.

Five domain validation tests passed. Five browser workflow tests passed; after
fixing empty-table spanning, the four affected channel workflows were rerun.
Lint and production build passed; existing large-chunk warnings remain. No API,
production data, real billing execution, physical mobile devices, or non-Chromium
browsers were verified. No dependencies, credentials, commits or pushes were added.


## Follow-up: fixed toolbar and custom monitoring models

Channel pricing and monitoring now enable the existing fixed Header with an
opaque semantic background. Provider rows offer Add model through shadcn Popover,
Input and Button. The draft validates empty/whitespace/duplicate names, trims
outer spaces, selects added names, and retains them on deselection. Cancel/Escape
clear unsent input and restore focus. Local save/reset includes custom models.

Reviewed integrated Chromium screenshots at 1440 x 900 and 390 x 844, light and
dark: provider default, open popover, empty and duplicate errors, added/selected
model, scrolling with pinned toolbar, and pricing toolbar. Evidence uses
`web/output/channel-qa/regression/models-*` and the refreshed list captures.
Four model-entry browser tests and four existing channel workflows passed.
The scrolling assertion waits for popover close/focus restoration before scrolling;
otherwise focus restoration correctly scrolls back to the trigger during the test.
Frontend lint and production build passed (existing chunk warnings). This remains
local preview; backend model discovery and actual health probes are not verified.

## Subscription management implementation (2026-10-03)

Implemented the approved subscription list and compact plan editor using the
existing shadcn/TanStack table, pagination, view options, dialogs, popovers,
searchable choices and group-selection table. User subscriptions and Plans have
separate tabs. Plan pricing, duration, quotas, reset rules, timezone, groups,
notes and publication state are editable. Assignment copies purchased terms;
later plan edits/deletion do not rewrite existing subscriptions. Adjustment,
quota reset and revocation remain explicitly labelled in-memory previews.

Screenshot evidence: `web/output/subscriptions-qa/implementation/`.
Reviewed integrated Chromium renders at desktop 1440 x 900 and mobile 390 x 844,
in light and dark themes. Every workflow screenshot was opened and inspected,
individually or in labelled contact sheets: subscription/plan lists, pagination,
filters, empty results, action menus, create/edit forms, field errors, group
selection/search/empty state, user selection, assignment, date adjustment,
discard/reset/revoke/delete confirmations and resulting local records. Desktop
column visibility menus and hidden-column layouts were also inspected.

Review found overlapping save feedback on the mobile editor footer. Feedback now
uses a single toast identifier and clears on editor entry. The four viewport/theme
combinations were recaptured and inspected in `final-*-editor.png` and
`final-*-feedback.png`. Date adjustment no longer displays an unrelated assignment
validation message. Portal captures wait for entry positioning to settle.

Validation: five domain/responsive browser tests passed, followed by a targeted
four-combination regression for feedback dismissal and preservation of purchased
quota snapshots. Frontend lint and production build passed after the final change.
Subscription locale keys match in English/Chinese. Scoped whitespace and secret
pattern checks passed. No runtime dependency was added by this implementation.

Not verified: backend persistence, real purchases/payments, billing enforcement,
server authorization, physical mobile devices, virtual keyboards or non-Chromium
browsers. This frontend intentionally uses local sample data; reloading resets
preview edits. No commit or push was made.


## Subscription plans without group binding — 2026-10-03

Removed group association from the plan contract, fixtures, create/edit validation,
plan table/mobile rows and both locales. Account grouping is a separate domain.

Integrated Chromium screenshots were recaptured and opened for desktop 1440x900
and mobile 390x844, each in light and dark themes: create, filled create, invalid
name, saved plan list, edit plan and discard confirmation. Evidence lives in
`web/output/subscriptions-qa/implementation/`; `current-*` contact sheets were
created from the fresh screenshots and every cell was visually reviewed. Fields,
actions and plan rows remain aligned with no viewport overflow. Old `groups*`
screenshots are historical and do not describe the current editor.

Validation: all six subscription Playwright tests passed; frontend lint and
production build passed. No dependencies were added. Real backend persistence,
physical mobile devices and non-Chromium engines were not verified.

## Account management — 2026-10-04

Reused the existing shadcn-admin table headers, column visibility control and
pagination. Reworked overview cards, separate upstream plan and multi-group
assignments, combined creation/use/expiry timestamps, and added local preview
create/edit/status/delete flows. The filtered TanStack dataset is memoized to
avoid pagination reset render loops. Detail dismissal restores the corresponding
visible trigger even if its table cell was remounted. Toasts use stable IDs and
are dismissed on editor entry/exit instead of stacking over mobile actions.

Screenshot review: integrated Chromium at 1440x900 and 390x844 in light and dark
themes. Opened and inspected screenshots for overview cards, account table/mobile
rows, filters, pagination, empty results, desktop column visibility and hidden
column state, row actions (OAuth and API Key), create/default/filled/validation,
provider-specific groups, edit, saved rows, local status change, delete and dirty
confirmation. Reviewed usage, profile/activity daily-weekly-cumulative, forecast
week-month, reset credits, and the scrolled bottom of each details dialog.
Evidence: `web/output/accounts-qa/`, including the opened `review/desktop-*`,
`review/mobile-*` and `review/final-*` sheets. Empty-state screenshots were
recaptured and directly inspected after retaining the desktop table header.
Mobile overview cards were compacted after visual review to expose the first
complete account row. The shared column picker follows the existing desktop-only
behavior. Mobile details/editors use fixed headers/footers and native body scroll.

Frontend lint and production build passed (existing chart/homepage chunk-size
warnings remain). Account browser flows cover local CRUD, group selection,
provider scoping, filters, pagination, missing telemetry, disabled upstream
mutations, dialog focus return and absence of write requests/browser exceptions.
No runtime dependencies were added. Account source and locale files were checked
for replacement characters, matching locale keys and credential-like literals.

Not verified/implemented: real account persistence, OAuth/import, connection
checks, credential/model refresh, live telemetry, upstream quota resets, physical
mobile devices, virtual keyboards or non-Chromium engines. All preview changes
reset on navigation/reload; live upstream actions stay disabled. This work does
not assert that backend account management is operational.

### Upstream account identity correction

Removed generated account avatars from list rows and all detail dialogs. Email
is a nullable upstream attribute displayed as read-only text in the editor;
preview creation leaves it unset and metadata edits preserve existing email.
The reference OAuth start/complete interfaces do not accept a manually entered
email; OpenAI credential preparation projects email from token identity claims.

Repeated all four integrated account browser flows after this correction; all
passed. Lint and production build passed. Opened and inspected the new desktop
1440x900 and mobile 390x844 light/dark screenshots for lists, create/edit,
validation, saved states, menus, and all four detail dialogs, including period
switches and scrolled states. Evidence is in
`web/output/accounts-qa/review/identity-{desktop,mobile}-*.jpg`.
Real OAuth exchange and automatic email acquisition remain unimplemented and
were not tested against upstream providers.

### Account authorization presentation

Add account now presents OAuth URL generation, copy/open controls and callback
input, or an API-key field, using existing shadcn primitives. Credential inputs
and completion actions are disabled until management APIs exist. It no longer
creates unauthenticated preview records. Existing OAuth accounts open the same
authorization section from their row menu, with identity fixed. Metadata editing
retains local preview validation, groups, concurrency, weight and notes.

Integrated Chromium screenshots were opened and reviewed at 1440x900 and 390x844
in light and dark themes: default creation, group selection, scrolled form,
API-key selection, provider switching, dirty confirmation, existing-account
authorization (top/bottom), editing and validation. Evidence is in
`web/output/account-authorization-qa/`. Review found that Select focus restoration
could scroll the outer dialog and hide its header on mobile. The editor shell
now clips overflow while its form owns scrolling; regression assertions check
the shell scroll offset and header/footer visibility after provider selection.
The corrected editor states were recaptured and inspected in the
`review/fixed-{desktop,mobile}-{light,dark}-*.jpg` sheets. All four integrated
account browser flows, frontend lint and production build passed. A separate
four-cycle mobile provider-switch check also passed. Existing chart/homepage
chunk-size warnings remain.

Real OAuth URL generation, token exchange, automatic email discovery and account
persistence remain unimplemented and unverified. Physical devices, virtual
keyboards and non-Chromium browsers were not tested. No dependencies were added.

### Compact account dialogs

Reduced the shared account editor to a 576px desktop width and a maximum height
of 720px, bounded by the viewport with 48px vertical clearance. Mobile dialogs
now retain 12px side margins and rounded corners instead of filling the screen.
Shorter content determines its own height; only the form body scrolls. Section
spacing, header/footer padding, callback input and group list height were reduced.

Opened and inspected 40 integrated Chromium screenshots in
`web/output/account-dialog-size-qa/`, including all `review/` contact sheets:
1440x900 and 390x844, light/dark, creation and its scrolled bottom, API-key mode,
provider menu and selected state, dirty confirmation, authorization and editing
at both scroll positions. Viewport-bound, header/footer visibility, internal
scrolling, Escape and focus-return checks passed. Lint and production build
passed; existing large chart/homepage chunk warnings remain. Physical mobile
keyboards and non-Chromium browsers were not verified.

### Two-step account onboarding correction

Supersedes the single-form creation and authorization layout described above.
Reviewed codex-proxy-rs AccountCreateModal model/presenter, onboarding and
OAuth composables, and API-key fields at revision
7c266b469b8b24878488e68b58b6adae520465f5 for flow semantics; no source was imported.

Creation now separates settings from provider-specific import. The settings
step includes provider, concurrency, weight, a scrollable group popover and notes.
OpenAI offers OAuth/API Key/AT/RT/JSON; xAI offers OAuth/JSON. API configuration
has name, Base URL, key and transport preference. OAuth has no callback input
before a server-issued session. Reauthorization skips settings. Back preserves
configuration; changing provider resets its groups and API draft.

The creation dialog is 512px wide on desktop with natural content height:
approximately 502px for settings, 354px for OAuth, 566px for API configuration,
and 304px for existing-account authorization. The viewport remains the upper
height bound; the body owns overflow and the header/footer remain visible.

Opened and visually inspected all 170 integrated Chromium screenshots, including
all 44 review sheets, in `web/output/account-onboarding-qa/`. Matrix: desktop
1440x900 and mobile 390x844, each in light and dark themes. Reviewed settings,
invalid settings, group menu selection/scrolling, all import methods, API fields
and transport menu, Back, provider changes, dirty-discard confirmation and
reauthorization. Also reviewed metadata editing/validation and existing list,
filter, pagination, row menus and detail-dialog regression states.

All four integrated account browser scenarios passed. Frontend lint and build
passed; existing chart/homepage chunk-size warnings remain. Locale key parity,
replacement-character and credential-literal checks passed. No dependencies
were added. No unintended clipping, horizontal overflow or hidden primary
controls was found in the changed onboarding states at the tested viewports.

Not implemented or verified: real OAuth sessions/callbacks, credential import,
account persistence and automatic upstream email discovery. These actions and
secret inputs remain disabled in the authorized frontend-only preview. Physical
mobile devices, virtual keyboards and non-Chromium engines were not tested.

### Independent five-hour quota window

Added independent five-hour and weekly quota observations to account previews.
Reused shadcn Progress and a shared quota presentation across list, usage and
reset-credit views. Missing windows are not rendered as zero. No palette,
dependency, API or backend changes were introduced.

Opened and inspected all 16 integrated Chromium screenshots and four contact
sheets in `web/output/account-quota-qa/`: 1440x900 and 390x844, light and dark,
covering account list, dual-window usage, remaining quota/reset details, and
missing API-key quota. No overlap or horizontal overflow found. Four focused
browser scenarios passed, checking independent 24/42 percent used and 76/58
percent remaining values, independent reset labels, unavailable data and no
browser exceptions. Frontend lint and production build passed (existing large
chunk warnings remain). Real provider quota retrieval and physical mobile
devices remain unverified; displayed values are deterministic preview fixtures.

### Quota actions and bounded group membership

Placed available reset count, Query and Reset in one row under list quota bars
and inside usage details. Reset opens the existing credit detail view, preserving
focus on dismissal. Query and actual credit consumption remain unavailable.
Credits are account-scoped with separate unknown and zero states. Group display
is bounded to two names plus +N; the shadcn popover exposes all names with native
scrolling, keyboard focus, Escape dismissal and focus restoration.

Opened and inspected 32 integrated Chromium screenshots (eight review sheets)
in `web/output/account-actions-qa/`: 1440x900 and 390x844, light/dark, list,
group expansion/scrolled state, usage, reset opened from both entrypoints,
unknown counts and zero counts. Actions remain in one row; group names do not
expand the table unboundedly. Four browser scenarios, lint and production build
passed after correcting a missing group-name import caught by build/browser
checks. Existing large bundle warnings remain. No dependencies were changed.
Real upstream query/reset operations and physical mobile devices are unverified.

## 2026-10-04 Account plan and status labels

- Scope: account list plan/status badges only; existing application palette and shared Badge primitive preserved. Plan column widened from 65 to 90 to keep Business separate from status. Preview fixtures include Free, Plus, Pro, Business and absent plans.
- Tokens: Radix Colors 3.0 step 3/11 surfaces/text, with light info/success/warning foregrounds darkened for small-label readability. Neutral slate tokens are limited to these labels. No dependency or lockfile changes.
- Skills: frontend-design and web-design-guidelines applied. Local radix-colors and shadcn skill files were unavailable; existing shadcn Badge/config and official Radix color values were used directly.
- Actual running page: http://127.0.0.1:5173/accounts, Chromium, desktop 1440x900 and mobile 390x844, light and dark themes.
- Captured and visually inspected all 20 final screenshots through four contact sheets in `web/output/account-labels-qa/review-*.png`. States: initial list and scrolled records covering all four plans, normal/limited/disabled/error states, and absent plans. No badge collisions or document horizontal overflow at those viewports; no browser page errors.
- Repaired during review: Business initially overflowed its table cell; widened the plan column and recaptured. Light text contrast was increased and the final screenshots recaptured/reviewed.
- Validation: frontend lint and production build; no behavior test added for this visual-only change. Existing account dialogs, backend operations, other browsers and other viewport sizes were not revalidated in this pass.

## 2026-10-04 Account table theme divider synchronization

- Reproduced on the running accounts page: row `transition-colors` animated borders for 150ms while the table frame and cell surfaces switched immediately. Browser frame samples showed old light row borders against the new dark outer border.
- Scoped fix: disable transitions on account list header/body/empty rows. Existing cell hover feedback remains. Shared table primitives and other pages are unchanged.
- Actual Chromium checks: desktop 1440x900 and mobile 390x844, light/dark, populated and empty lists; desktop row hover. Captured and opened screenshots in `web/output/account-theme-qa`. Inspected switch-time and settled dark screenshots separately; existing button/label color transitions are outside this border-only fix.
- Five consecutive theme changes per viewport: row/frame border colors equal immediately, zero row border transitions, zero page errors, no horizontal document overflow. Search empty state and restoration passed.
- Lint and build passed (existing bundle-size warning). Other pages, dialogs and browsers were not revalidated.

## 2026-10-05 Announcements preview

- Scope: announcements navigation below Accounts, list, local editor, Markdown preview and sample readership. Start/end/created timestamps intentionally share one table column per user instruction. Existing theme, shadcn primitives and shared TanStack table controls are reused.
- Browser acceptance: actual Vite page at `/announcements`, in-app Chromium. Desktop 1280x720 (additional 1440x900 list/editor inspection), mobile 390x844. Light and dark list, editor, group scrolling, preview, readership, operation menu and delete confirmation were captured and opened. Additional captures cover required-field errors, date-order errors, dirty-close protection, filtering/empty state, pagination, column visibility, and desktop English copy. Evidence: `output/qa/announcements/`; design comparison: `design-comparison.jpg`.
- Behavior verified: local create/edit/delete, UTC date round-trip, end-before-start rejection, required fields, selection of the last group in a scrollable list, Markdown formatting/HTML suppression/unsafe-link suppression, filter reset to first page, pagination, column visibility, cancel/discard and focus restoration. Fresh-tab browser error log was empty.
- Repairs during acceptance: grouped toolbar actions, widened the operation column, changed datetime input handling to synchronize native input events, anchored Radix hidden form inputs to their row, and prevented the outer dialog from scrolling. Recaptured fixed editor scrolling with title/footer visible. Older `desktop-dark-date-error.png` and `desktop-dark-groups-bottom.png` record the pre-fix problem; `*-groups-fixed.png` supersedes them. `desktop-light-create.png` caught the opening transition; `desktop-light-editor-fixed.png` is the settled desktop editor. Some early `desktop-dark-view*` captures from the old tab are not menu evidence; `desktop-light-view.png` verifies the actual column menu.
- Design comparison: preserved table hierarchy, compact status labels, monochrome actions and responsive stacked records. Intentional differences: consolidated three-line time cell, truthful local-preview status, existing shared pagination, and three separate time rows on mobile.
- Validation: `pnpm --dir web lint`, `pnpm --dir web build`, and `git diff --check` passed. Existing bundle-size/plugin timing warnings remain. react-markdown 10.1.0 is MIT and attributed in THIRD_PARTY_NOTICES.md. No backend interfaces or live data writes were added.
- Limits: management/delivery/readership APIs, persistence, real audience delivery, physical mobile devices, other browsers, and exhaustive theme-by-state combinations are not verified. There is no loading/network-error UI because this is an in-memory preview. Current screenshot coverage establishes the major components at both sizes/themes, not every possible combination.

## Proxy management — 2026-10-05

Implemented the approved proxy list, standard editor and quick-import design using
the existing shadcn/TanStack components. The sidebar entry follows Accounts.
The follow-up request uses the original shared DataTableBulkActions toolbar,
centered above pagination. It no longer consumes space above the table.

### Integrated screenshot review

Screenshots were captured from the running Vite application and individually
opened/viewed, not inferred from builds. Evidence: `output/qa/proxies/`.

- Desktop: 1440 x 960; mobile: 390 x 844, light and dark.
- List, status/quality metadata, pagination and selected rows; floating bulk
  toolbar, disabled probes, clear selection and deletion confirmation.
- Standard add and edit dialogs, authentication marker, custom expiry, backup
  selection, quick-import valid/error rows, skip-errors selection, required-field
  error and unsaved-change confirmation.
- Read-only associated accounts dialog in both widths/themes.
- Additional inspected states: desktop column-visibility menu, mobile row menu,
  filters, empty search results, second page and English desktop labels.
- Core evidence: `desktop-light-selected-final.png`,
  `desktop-dark-list-final.png`, `mobile-light-selected.png`,
  `mobile-dark-selected-final.png`; `desktop-{light,dark}-edit.png`,
  `mobile-{light,dark}-edit.png`; add/import/accounts/delete screenshots alongside.

Fixed mobile toolbar text wrapping and transparency, disabled-button keyboard
traversal, English table-label overflow, and field-error focus. The full table
starts at 1400px; narrower layouts use stacked records. The desktop English
DOM overflow check reported no overflowing table cells at 1440px.

### Behavior and checks

- Exercised standard creation with custom expiry and backup, editing and clearing
  authentication metadata, mixed-validity import, local delete, cancel/discard,
  protocol filtering, empty search, pagination, selection and Escape/End handling.
- Exported two selected example addresses to `proxy-addresses-preview.txt`;
  inspected the downloaded file: only scheme/host/port, no authentication fields.
  The browser download-event waiter timed out although the download succeeded;
  verification used the actual downloaded file.
- 19 parser/export/fallback boundary tests passed.
- `pnpm --dir web lint` passed with one TanStack React Compiler memoization warning.
- `pnpm --dir web build` passed; existing large scene/chart chunk warnings remain.
- Fresh browser tab error log was empty. No dependencies or lockfiles changed.

### Limits

All data changes remain page-local previews. No backend persistence, probes,
quality detection, live locations, real account bindings or fallback execution
were verified or represented as available. Real-device keyboard behavior and
Safari/Firefox were not tested; mobile evidence uses an emulated Chromium viewport.


## Sidebar and bulk toolbar correction — 2026-10-05

Renamed Pages to Features in synchronized Chinese/English resources, moved
Channel management into that group, and removed Auth/Errors navigation entries.
The proxy bulk toolbar floats over the bottom of the table viewport, centered
on the actual content width. It does not occupy a layout row; pagination remains
visible in its original position. Selected scroll containers have trailing padding
so their final records can scroll above the overlay.
The shared toolbar has one caller. Removed the viewport-relative placement and
proxy-specific bottom offsets rather than retaining a second positioning path.

Also corrected collapsed-sidebar dropdown dismissal: navigation prevents the
native click for the workspace transition, so the menu must close explicitly.
Verified pricing and monitoring navigation, menu dismissal, restored page clicks,
mobile drawer dismissal, and toolbar End/Escape handling.

Captured and opened/viewed integrated screenshots in `output/qa/sidebar-bulk/`:
- 1440 x 960, light/dark: default list, selected toolbar, expanded sidebar.
- 1440 x 960, light/dark: collapsed sidebar and channel dropdown; English labels.
- 390 x 844, light/dark: default/cleared list, selected toolbar and expanded
  mobile navigation drawer.

Final overlay screenshots: `desktop-{light,dark}-floating-final.png`,
`desktop-dark-floating-collapsed-final.png`, `desktop-light-floating-page2.png`,
and `mobile-{light,dark}-floating-final.png`. All were opened/viewed. The initial
reserved-footer screenshots are superseded for toolbar placement.

Toolbar geometry was centered within main in both sidebar states; mobile had no
horizontal document overflow. Pagination coordinates stayed unchanged across
selection (desktop y=892, mobile y=736), and selected-page navigation succeeded. Lint passed with the existing TanStack compiler
warning; build passed with existing chunk-size warnings. Changed-file whitespace,
locale-reference checks and the tracked diff whitespace check passed. No new
dependencies, credentials, routes or backend changes were introduced.

Unverified: physical mobile devices and Firefox/Safari. Mobile evidence uses a
real Chromium page at an emulated viewport; backend operations remain unavailable.


## Security audit navigation and redemption concepts — 2026-10-05

Implemented navigation-only destinations: General / Redemption Codes and
Features / Security Audit / Content Review and Prompt Review. Chinese and English
labels are synchronized. New routes reuse the shared Header/Main and explicitly
show Design in progress. No redemption or moderation controls were implemented.

The running Chromium page was captured and each screenshot opened/viewed:
`output/qa/redemption-navigation/`, desktop 1440 x 960 and mobile 390 x 844,
light/dark. Reviewed sidebar default/expanded audit children, mobile drawer,
and all three route placeholder headings and header controls in both widths
and themes. New links navigate and mobile selection dismisses the drawer.
Existing auth/error navigation entries remain absent. Collapsed dropdown and
English checks were also performed. No clipping or horizontal page overflow.

Lint and build passed; existing TanStack compiler warning and large scene/chart
chunk warnings remain. Generated router types include all three destinations.
No dependency or lockfile changes, API integration or credentials in files.
Changed-file/reference review and documentation diff whitespace check passed.

Generated redemption mockups use the existing project script as previously
requested by the user. Actual reference image and actual product screenshots
were attached to the generator. Every output was opened; early mobile drafts
were rejected because they retained desktop layout. Final design references are
listed in `output/imagegen/redemption-codes-2026-10-05/README.md`.

Unverified: backend operations, real mobile hardware, Safari/Firefox. Generated
list/dialog mockups are review images, not implemented or browser-tested UI.


## Redemption code management — 2026-10-05

Implemented local frontend previews for balance, concurrency, subscription and
invitation codes. Promotional codes are excluded. Total redemption limits and
per-user limits are independent; the default per-user limit is one. Generation
is bounded to 100 codes per batch. Included filtering, pagination, CSV export,
redemption history, enable/disable and protected deletion with confirmations.
All changes reset on reload; no backend persistence or benefit issuance exists.

Reviewed actual Chromium screenshots at 1440 x 960 and 390 x 844 in light and
dark themes, under output/redemption-qa/. Opened and inspected the final contact
sheets and full-size detail images. States covered: list, row menu, selection,
confirmation, updated records, generation, validation, code types, plan selection,
discard confirmation, generated results, empty results, status filters, empty
history, unlimited total uses and pagination. Desktop column visibility was also
checked. No document horizontal overflow or browser page errors were observed.
Validation is inline to keep the mobile dialog footer unobstructed.

Validation: pnpm --dir web lint and build passed. The focused redemption browser
test passed (1 test), covering invalid limits, batch bounds, export, reload reset,
used-code deletion protection, history and dirty dismissal. Existing proxy-table
React Compiler and build chunk-size warnings remain. Locale parity and scoped
credential checks passed. No dependencies or lockfiles changed in this task.

Unverified: backend redemption, real device hardware and Firefox/Safari. Viewport
checks use actual Chromium rendering with desktop/mobile viewport dimensions.


## Referral navigation — 2026-10-05

Added Features / Referral Rewards with three localized child routes: Invitation
Records, Rebate Records and Withdrawal Records. Reuses existing navigation and
planned-page components. No financial operations or sample records added.

Real Chromium screenshots captured and opened under output/referral-qa at
1440 x 960 and 390 x 844, light/dark: all three page destinations, collapsed
and expanded menu, active child and keyboard focus. Mobile navigation dismisses
on selection; keyboard Enter expands the menu. No horizontal page overflow or
page errors. Lint/build passed with existing proxy compiler/chunk-size warnings.
No new dependencies. Backend records and real mobile hardware remain unverified.


## Calendar-05 adoption — 2026-10-05

Adapted the requested Shadcn Space calendar-05 into a controlled shared calendar
using existing shadcn primitives. Integrated account birthday, announcement start
and end, subscription expiry, redemption expiry and custom proxy expiry. Date/time
fields retain local wall-clock strings and existing feature timezone conversion.
Rolling telemetry windows and recurring peak/off-peak time inputs are unchanged.

Viewed all screenshots and contact sheets under output/calendar-qa: 1440 x 960
and 390 x 844, light/dark, defaults, calendars, month menus and selected values
for all five features; time entry/clear for redemption and Chinese announcement
end-date/year menus. Verified leap day 2028-02-29, time input and Escape focus.
Opened the four subscription invalid-date screenshots under web/output as well.
No new horizontal overflow. Existing preview explanations are outside this change.

Lint/build passed (existing proxy React Compiler and large chunk warnings).
Redemption regression passed; subscription desktop/mobile light/dark flows passed
after updating selectors for localized month/year order. Date/time failures still
block subscription saving. The registry attempted a major dependency upgrade;
react-day-picker was restored/pinned to the already installed 9.14.0. Existing
base UI components were not overwritten. Attribution added to THIRD_PARTY_NOTICES.
Unverified: physical mobile devices, Safari/Firefox and backend operations.

## Referral records implementation — 2026-10-05

Implemented the three existing referral routes with shared shadcn table headers,
column visibility and pagination. User links open a Sheet with three record tabs.
Search, date filters and CSV export operate on explicitly local preview fixtures.
No billing or withdrawal API is called.

Reviewed actual Chromium screenshots in output/referrals-implementation at
1440x960 and 390x844, light and dark: all three lists, their detail tabs,
calendar popovers, search empty states, and second pages. Opened contact sheets
and inspected the captured layouts. Fixed detail pagination container queries
and removed redundant identity columns inside the detail view. Mobile records
scroll within their available area while pagination stays available.

Additional English desktop checks: column menu, numeric descending sort, CSV
download and Escape focus restoration. Fixed focus restoration when the table
replaces its original button node. Lint and build passed; existing proxy React
Compiler warning and large build chunks remain. Scoped diff whitespace check passed.
Unverified: backend behavior, real devices, other browser engines, exhaustive
calendar-range boundaries and all column-visibility combinations.

### Referral overview revision — 2026-10-05

The user reference supersedes the detail Sheet and its tabs. User links now open
one centered shadcn Dialog: identity block followed by six metrics in two columns
(code, rate, invited count, rewarded count, available balance, lifetime rebates).
All values are local preview values. Reviewed overview-1440-light/dark.png and
overview-390-light/dark.png in output/referrals-implementation, including identity,
all six tiles, close control, boundaries and spacing. No horizontal overflow;
Escape closes and restores focus. Lint/build passed with the same pre-existing
warnings. Backend and physical mobile devices remain unverified.

## Order navigation and design review — 2026-10-05

Added General > Order management with Payment overview, Order management and
Subscription plans children. These three routes deliberately use the existing
planned-page shell pending design approval; payment and refund actions are not
implemented. Existing subscription management is unchanged.

Reviewed actual Chromium screenshots in output/orders-menu-qa at 1440x960 and
390x844, light/dark: all three route shells, desktop expanded navigation and
mobile navigation drawer. Confirmed headings, active items and readable menu
spacing. Lint and build passed (existing proxy compiler/chunk-size warnings).
Generated raster mockups are design proposals, not evidence of implemented
payment functionality. Backend and non-Chromium browsers remain unverified.
