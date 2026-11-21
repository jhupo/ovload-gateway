# Account management source review and design proposal

Reviewed on 2026-10-03. Reference: zyycn/codex-proxy-rs, commit `7c266b469b8b24878488e68b58b6adae520465f5`.

This is a frontend source review, not a claim that the reference application was run. Its Vue UI is not being copied into Ovload. The accompanying generated images are proposals, not screenshots of implemented account features. Only subscription-plan group removal was implemented in this task.

## Source layout

The reference uses Vue 3, its own `@codex-proxy/ui` package, and utility CSS. The page has a title/description, four overview cards (total, normal, quota/rate limited, attention), then a large table card. Search/filter/actions occupy the table header. Rows are 72px; XL layout reserves a fixed-height scrolling table, smaller layouts use a 400px table. Expanded rows split quota and usage at 1.05:2.45; the usage pane further separates totals and a model table. Dialogs cover editing, onboarding, diagnostics, profile, forecasting and task progress.

## Complete functional inventory

| Area | Observed source functionality | Important conditions |
| --- | --- | --- |
| List and filtering | Account search; provider, status and group filters; ungrouped/disabled-group options; sorting; pagination (default 20); column visibility/order/reset; cross-page selection; refresh after mutations | Search is debounced. Preserve selection and scroll on refresh. |
| Account identity | Avatar/initial, email/account name, notes popover, provider, authentication kind, upstream subscription, group chips, last use, access-token expiry | Upstream subscription is not a local Ovload purchased plan. |
| Status | Normal, quota exhausted, rate limited, disabled, error; diagnostics for unverified, expired/invalid credential, banned; refresh backoff, capacity freeze and recovery-probe conditions | Render backend status rather than independently reconstructing status precedence. |
| Capacity and usage summary | Used/total concurrency slots, representative quota window, additional-window indicator, local total tokens | Unknown/unlimited are different. API-key upstream quota is not provided; reference draws a green decorative bar with a tooltip, which we should replace with an explicit unknown/unsupported state. |
| Per-account operations | Edit, delete, test connection, enable/disable scheduling, recover state | Each action has independent pending/disabled handling. Delete confirms. |
| Credential operations | Refresh token and reauthorize OAuth accounts; download OpenAI OAuth model catalog | Hide unsupported operations on API-key accounts. |
| Export | Export selected account documents, including credentials; server confirmation token; validation of selected provider/context | Proposed redesign adds an explicit sensitive-export confirmation. Source does not have the same confirmation UI. |
| Provider support | OpenAI and xAI; mixed-provider account bundle | No Gemini/Antigravity implementation was found in this frontend provider registry. This is not an Ovload provider-support decision. |
| Onboarding settings | Provider/source selection, model access policy, enabled scheduling, concurrency, scheduling weight, account groups, outbound proxy, notes | Concurrency can be blank/default or integer 1..4294967295; weight 1..100; notes up to 500 characters. |
| Proxy selection | Direct egress, proxy catalog, tested/failed/untested presentation, preserve-current for editing | The picker includes all proxy states; do not claim code only permits successfully tested proxies. |
| OAuth | Generate/open/copy link, paste callback, regenerate, expiry, paused/retry states, credential reauthorization | Reauthorization retains the account identity and skips initial settings. |
| API Key | Name on creation, base URL, masked key, HTTP/SSE or preferred WebSocket transport | OpenAI-specific in this source. Blank key on edit preserves the existing key. |
| Access/refresh tokens | One token per line, AT and RT import paths, validation/exchange | OpenAI source. Mask in design artifacts and avoid logging. |
| JSON imports | Paste JSON, single-file picker/read errors; provider document or mixed-provider envelope; maximum 200 entries | Existing identities update credentials. xAI supports OAuth and JSON in the inspected flow. |
| Single editor | Provider-specific connection settings, model policy, concurrency, weight, account groups, proxy and notes | Scheduling switch is hidden in the single editor; row action owns scheduling toggle. OAuth transport can be changed. |
| Model access | Unrestricted, allowlist, denylist; searchable catalog, refresh, exact custom ID via Enter/add; retain selected unavailable IDs | Up to 256 models; each ID up to 256 UTF-8 bytes; reject wildcard/control characters/reserved `__` names. |
| Batch editor | Scheduling, concurrency, weight, groups, model policy and proxy; mixed/preserve semantics | Untouched fields must retain each account's value. Proposed UI makes field application explicit with checkboxes. |
| Import task progress | Recent task selector, total/imported count, segmented progress, pending/running/succeeded/failed/unknown/skipped, all/needs-attention results, refresh, stop pending work, view accounts | Stopping does not cancel the current item. Retained for 1h; server restart loses task records, not imported accounts. Polls at 1.5s, backs off to 5s on error. Unknown result must be reconciled before resubmission. |
| Connection test | Upstream model picker/catalog refresh, start/retest, streaming event timeline, idle/running/success/error, start/end/duration | Error details include gateway/provider/upstream source, request send state, HTTP status/content type/body and provider code. No fabricated TTFT metric. |
| Quota details | Grouped native reset windows, percent/local use/reset time, quota refresh and timestamp, upstream plan, capability-gated actions | Local-only usage and unavailable upstream quota have distinct states. Keep quota units and window labels native. |
| Local usage details | Input/output/cache/reasoning/read/total tokens, estimated USD cost, per-model requests/success/tokens/cost/last use | Local accounting is distinct from upstream quota. |
| Account profile | Identity/avatar/email/upstream plan, cumulative/peak tokens, longest conversation, current/longest streak, subscription dates/renewal/billing | Shown by returned profile/subscription capabilities. Handle missing sections/partial errors. |
| Profile activity | 52-week heatmap with daily/weekly/cumulative modes; fast-mode ratio, common reasoning effort, skills explored/used, threads; top plugin/skill calls | Redesign can use a compact mobile window; it must retain access to the full range and mode controls. |
| Quota forecasting | Week/month, observed percentage/tokens/equivalent cost versus extrapolated capacity; refresh and timestamp | Approximate, insufficient sample, extrapolation, stale reset-window and unavailable states. No invented time-series or guaranteed remaining balance. |
| Upstream reset credits | Credit inventory/count/title/expiry, point balance (including unknown/unlimited), selection, explicit consumption confirmation, refresh | Capability-gated. An ambiguous previous consumption blocks a new one and offers continued reconciliation. Unrelated to resetting local purchased subscriptions. |

## Ovload redesign

Keep the existing shadcn-admin shell, Inter/Noto Sans SC, Lucide icons and semantic theme variables. No extra UI runtime library is required. Replace the four large source overview cards with a compact status strip, leaving space for identities, quota windows and actions. Keep detail on demand; account list, not a dashboard, is the primary job.

Desktop uses an aligned table, a focused expandable detail region, and bounded scrollable dialogs with fixed title and footer. Mobile uses compact records and full-height dialogs rather than squeezing every desktop column into a horizontal scroller. Model lists and long import task results scroll inside their own bounded area. Account settings may reference account groups; subscription plans do not.

Hide unavailable actions by capability/provider/authentication kind. Never show OAuth renewal controls for API-key credentials, represent missing quota as a full green quota bar, or equate provider with protocol. Preserve mixed batch fields until explicitly applied. Keep export/delete/reset confirmations distinct. Diagnostics must redact sensitive headers and payloads.

## Design coverage

Each numbered board pairs a desktop proposal with a mobile proposal. The image gallery is in `output/imagegen/accounts-20261003`.

| Board | Workflow |
| --- | --- |
| 01 | Account list, filters, status strip, quota/concurrency, row menu |
| 02 | Expanded quota and local model-usage detail |
| 03 | Import source and common account settings |
| 04 | OAuth callback and reauthorization |
| 05 | API-key connection and transport |
| 06 | AT, RT and JSON/file import |
| 07 | Account editor and model allowlist |
| 08 | Batch edit, export and delete confirmations |
| 09 | Import task progress and attention results |
| 10 | Connection test and error diagnostics |
| 11 | Profile, upstream subscription and activity |
| 12 | Quota forecast and estimate presentation |
| 13 | Reset-credit selection/confirmation and ambiguous result |

Images are layout proposals with sample data. Exact copy, validation limits, conditional controls and accounting semantics are governed by this inventory and later approved contracts, not AI-rendered labels. No account backend or account UI has been implemented or tested here.

## Evidence and source links

- [frontend/src/views/accounts/index.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/index.vue)
- [frontend/src/views/accounts/constants.ts](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/constants.ts)
- [frontend/src/utils/providers.ts](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/utils/providers.ts)
- [frontend/src/views/accounts/components/AccountTableActions.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountTableActions.vue)
- [frontend/src/views/accounts/components/AccountCreateModal/index.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountCreateModal/index.vue)
- [frontend/src/views/accounts/components/AccountCreateModal/model.ts](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountCreateModal/model.ts)
- [frontend/src/views/accounts/components/AccountEditModal.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountEditModal.vue)
- [frontend/src/views/accounts/components/AccountBatchEditModal.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountBatchEditModal.vue)
- [frontend/src/views/accounts/components/AccountImportTasks/TaskDetail.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountImportTasks/TaskDetail.vue)
- [frontend/src/views/accounts/components/AccountConnectionTestModal.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountConnectionTestModal.vue)
- [frontend/src/views/accounts/components/AccountQuotaPanel/index.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountQuotaPanel/index.vue)
- [frontend/src/views/accounts/components/AccountQuotaSummaryCell/index.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountQuotaSummaryCell/index.vue)
- [frontend/src/views/accounts/components/AccountUsagePanel.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountUsagePanel.vue)
- [frontend/src/views/accounts/components/AccountProfileModal/index.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountProfileModal/index.vue)
- [frontend/src/views/accounts/components/AccountProfileModal/TokenActivity.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountProfileModal/TokenActivity.vue)
- [frontend/src/views/accounts/components/AccountQuotaForecastModal/index.vue](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/components/AccountQuotaForecastModal/index.vue)
- [frontend/src/views/accounts/composables/useAccountOnboarding.ts](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/composables/useAccountOnboarding.ts)
- [frontend/src/views/accounts/composables/useAccountResetCredits.ts](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/views/accounts/composables/useAccountResetCredits.ts)
- [frontend/src/api/modules/accounts.ts](https://github.com/zyycn/codex-proxy-rs/blob/7c266b469b8b24878488e68b58b6adae520465f5/frontend/src/api/modules/accounts.ts)

## Visual review limits

All delivered image boards were opened and inspected. They describe composition,
not pixel-exact implementation contracts. Remaining AI-rendered inconsistencies
include some secondary copy, import step highlighting, mobile task counts and
heatmap month labels. Implementation must use the source-backed semantics above.
The account designs are light-theme concepts; no account UI runtime, dark-theme
implementation or backend integration was validated. The subscription change was
independently validated on the real running application; see `design-qa.md`.

## User screenshot refinement

Four user-provided screenshots clarified the intended interaction surfaces:

- Keep account details expanded inside the table: quota on the left, five Token
  structure rows (input/output/cache/reasoning/read) in the middle, model usage
  table on the right. Preserve upstream plan and token-expiry columns.
- The reset dialog includes remaining quota, native reset time, available reset
  count, one consume action per dated credit, refresh, and upstream credit points.
- Forecast uses a solid observed fraction plus a dashed extension and paired
  observed/projected Token and equivalent-cost values, with week/month selection.
- Profile stays in a scrollable dialog with identity, five metrics, upstream
  subscription details, annual activity heatmap with daily/weekly/cumulative modes,
  activity insights and plugin/skill usage.

Boards 14-17 refine these four flows in dark theme and pair desktop/mobile views.
They supersede the corresponding earlier light-theme compositions as the latest
reference-driven proposals. No account UI code was changed.
