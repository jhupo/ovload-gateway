# ADR 0010: Administrator development preview

Status: accepted. Date: 2026-09-24.

## Decision

At the user's request, the Vite development application accepts any nonblank
email and password to enter the shadcn-admin workspace at `/dashboard`.
This is a UI preview, not gateway authentication. The preview session owns only
a tab-scoped sessionStorage marker; credentials are neither stored nor sent.
The marker survives refresh and is removed on sign-out. The authenticated route
group checks this session before loading workspace pages.

Both session creation and the route guard require `import.meta.env.DEV`.
Production builds reject this entry even if a preview marker is present.
No server endpoint, API credential, permission grant, or OAuth session is created.
The framework's unused cookie/token mock store is replaced by the explicitly
named preview-session store. Real management authentication will replace this
preview flow when its backend is implemented.

## Consequences

The landing page is the gateway Dashboard preview described in
[DEVELOPMENT.md](../DEVELOPMENT.md#frontend-preview),
with clearly labeled deterministic demo telemetry and account actions in the header.
The generic template sales overview and the sidebar account footer are removed. Sign-in
always lands on `/dashboard`; it does not follow untrusted redirect parameters.
Production management routes remain unavailable until real authentication exists.
Tests cover nonblank arbitrary inputs, reload, logout, route protection, absence
of credential persistence and rejection outside development mode.

## User workspace preview

The development session also permits the explicitly requested user workspace at
`/user/dashboard`. Its URL selects presentation only, never an authorization role.
The shared workspace shell, navigation primitives, command menu and profile
editor serve both views. The header account menu switches preview views; sign-in
continues to land on the administrator dashboard. Both views retain the existing
development-only guard, and production builds cannot enter either preview.

User navigation has General, Pages and Other groups, without Model pricing.
Other contains the original collapsible Settings menu. It shares its Profile,
My subscriptions, My orders, Redeem and Referrals entries with the user Settings
page's internal tabs, including feature visibility. Settings starts expanded in
both workspaces and remains manually collapsible.
Unbuilt user destinations are disabled in navigation and omitted from commands;
they never link to administrator management pages. Channel status, Lottery and
Profile reuse their existing feature compositions under user-scoped routes.
Visibility switches apply in both views, including direct-route guards.
Administrator and user profile fixtures have separate memory stores, reset on
sign-out. User dashboard fixtures contain only synthetic personal requests;
they do not derive user statistics from administrator-wide totals.

My orders, Redeem and Referral Rewards are user Settings routes at `/user/orders`,
`/user/redeem` and `/user/referrals`. They share a paginated record-table
composition built on the existing toolbar, filters, sortable headers and column
controls. Their synthetic personal fixtures never read administrator order,
redemption or referral ledgers. Subscription purchase orders reference personal
subscription snapshots; all money uses integer minor units and dates use UTC.
Subscription history also uses this record-table composition so local table
state changes preserve column component identity and keyboard focus. Command
search includes translated child titles as well as parent titles and route paths.
Order-detail and checkout dialogs retain their selected data through the Radix
exit animation, clearing it only when the closed content unmounts and restores
focus. These interaction changes do not add requests or persistence.
The profile-menu My orders shortcut opens personal orders in the user workspace
and order management in the administrator workspace.
Order details are read-only. Redemption input is memory-only, is cleared when
leaving the page and cannot submit while the redemption API is absent. Referral
invitation links use a reserved, nonfunctional domain; clipboard operations
report actual success or failure. Referral totals derive from the personal
sample ledger, with transferred amounts excluded from available funds. Transfer
to account balance is disabled. Sample referral terms are historical preview
snapshots, not projections of administrator user overrides or runtime policy.
Disabling referral visibility removes both navigation entries and guards direct
visits. No orders, payments, code redemption, invitations, rewards, funds or
subscriptions are created or changed by these pages.

The user API-key directory at `/user/api-keys` is a memory-only design preview.
It owns synthetic user-entitled groups and key records, independent of the
administrator account/group directories. Search, filters, sorting, column
visibility, pagination and confirmed edits operate on those records only.
Creation generates an explicitly nonfunctional `ovload-demo-` identifier; no
real credential is accepted, issued, stored or transmitted. Reload restores
fixtures. The example endpoint uses a reserved domain. Use-key snippets and CCS
provider links derive from the selected sample group's explicit client mapping:
OpenAI to Codex, Claude to Claude Code, and Gemini to Gemini CLI. Codex uses the
versioned Responses base URL; Claude and Gemini use the unversioned base URL.
CCS export follows Sub2API's `ccswitch://v1/import` format, omitting its usage
script because this preview has no user usage-query endpoint. A separate user
action may open the local protocol handler; no installation or import-success
claim is inferred from browser focus or elapsed time. All generated content
contains only nonfunctional sample credentials. No provider integration,
authorization, quota enforcement or billing is simulated.

My subscriptions at `/user/subscriptions` uses the shared Settings shell and
route-driven settings tabs. It presents only synthetic personal entitlements,
separate from administrator subscription records. Current and history views
partition records at the user dashboard's fixed UTC snapshot; expired and
revoked records belong to history. Purchased prices and quota terms are record
snapshots, independent of the administrator plan catalog. The primary Pro
entitlement agrees with the dashboard sample. History search, status filters,
sorting, column visibility, pagination and read-only detail dialogs are local.
No subscription query, purchase, renewal, cancellation or billing API is added.

The `/user` layout owns a single persistent header with theme, language and
profile controls. User pages do not recreate or reposition those controls.
A pathless settings layout owns the shared Profile/My subscriptions navigation;
only its outlet changes between those routes, preserving tab indicator motion
and the profile editor's navigation guard. Nested tab lists style orientation
from their own Radix list attributes, not an outer tab root.

Usage history at `/user/usage` derives personal records from the user dashboard
fixtures, never from administrator telemetry. Additional latency/cache metadata
is deterministic sample data. Time ranges, search, categorical filters, summaries,
sorting, column visibility and bounded pagination operate locally. Only successful
records enter user usage filters, summaries and pagination; failure inspection
remains administrator-only. The user table has no status or request-detail action.
Billing source and request ID are not table columns or column-picker options.
Billing source remains in the charge breakdown; IDs only key local rows. Search
matches visible model/key values. Request type combines separate operation
(generation, search or compaction) and a WS or streaming label. Compaction is
unary and omits the response-mode label. Reasoning effort has its own column;
absent effort displays a dash. These
typed personal fixtures do not claim backend operation or reasoning telemetry.
Token and billing cells expose hover/focus/tap breakdowns; IP metadata contains
the request IP, connection latency and sample User-Agent. Latency includes first
token, total time, output speed and cache-read/input hit rate (zero input displays
unavailable). Input includes cached tokens. The billing preview splits uncached
input, output and cache-read OVL charges, then applies an integer basis-point
multiplier to their base total. Deterministic 1x/2x samples preserve the dashboard's
recorded charge; cache reads and writes use the ordinary input rate in these
fixtures. The tooltip shows six-decimal amounts, input/output prices per million
tokens, a sample Standard service tier, multiplier, base total, final user charge
and billing source. These personal OVL prices are synthetic, not supplier costs
or a projection of the administrator's USD price catalog.
Billing details use intrinsic label/value columns with a compact gap; unit prices
omit unnecessary trailing zeroes. Table charges use the same small text size as
the adjacent token metrics.
No payloads, credentials, upstream accounts, supplier
costs or other users are exposed. No usage query or billing API is added.
Personal metric labels and values are left-aligned in compact columns. Existing
semantic foreground tokens distinguish input (success), output (premium) and
OVL charge (success). Latency uses success/warning/danger bands: first token
below 3/8 seconds, total below 10/30 seconds; output speed uses at least 30/10
tokens per second. Cache hits are success at 50% or above, info above zero and
muted at zero. Missing values stay muted. These are presentation thresholds,
not service guarantees, and exact numeric values remain visible.

Recharge / Subscription at `/user/recharge` uses the shared settings-style tabs
(vertical on desktop, horizontal on mobile) and the persistent user shell.
The Profile settings and recharge pages share `SettingsTabs` for navigation
width, gaps and editor inset, and `ContentSection` for heading/divider spacing
and content scrolling. Heading and navigation dimensions remain shared. The
balance checkout uses a four-pixel inset within its scroll region, without
negative margins that cause horizontal scrolling. Its desktop columns use a
5:4 ratio with a fixed 3rem gap. Amount and order-detail headings align above
the presets and order card, which share a top edge. Presets, custom input and
payment methods align in the left column. Both columns stretch to the same
height, anchoring payment methods and the order card to a shared bottom edge;
mobile retains natural stacked heights.
Its balance form presents twelve CNY presets in four rows, custom input, payment
method and confirmation. Compact amount choices and payment-method radios sit
beside a live order summary; on narrow containers the summary follows the inputs.
The summary owns the read-only account/balance, amount, fees, credited OVL and
confirmation action. The title row contains no balance. Invalid amounts clear
the estimate instead of retaining a previous quote. Confirmation opens the local
review. Alipay and WeChat Pay are selectable only when enabled in the saved
preview draft; no enabled method disables confirmation. The selected method is
preserved across tabs and shown in review; subscription review also permits
method selection. The draft's `enabled` field controls Alipay, and
`wechatEnabled` defaults to false. These switches do not activate a provider.
It projects public fields from the saved payment draft
and shows only published catalog plans. Catalog `Plan.notes` are public purchase
remarks, displayed with the plan's description and features; assignment-level
`Subscription.notes` remain administrator-only. Cards show the current CNY price,
and show the original price and exact savings only when the original price is
higher. Sample catalog prices and remarks are synthetic. User-specific offers
remain excluded.
Local estimates use CNY payment minor units and OVL balance minor units: balance
credit equals the CNY amount times the balance multiplier; the highest qualifying
global threshold adds a percentage of that credit. Fees apply to the payment
amount. Subscription sale prices and fees are CNY; the former subscription
currency-conversion setting is removed. Each operation rounds
half-up to minor units using integer arithmetic and rejects unsafe totals.
These are explicit design-preview calculations, not a billing contract. Daily
limits, pending-order limits and individual eligibility cannot be enforced without
server state. Order review creates no order ID, payment, QR code, entitlement or
ledger mutation. Real payment remains disabled, including when Alipay is enabled
in the local draft.

Platform balances, credits, quotas, billed usage, rebates and giveaway rewards
use OVL, a platform credit unit rather than an ISO currency. Shared formatting
prints its explicit unit with locale-aware decimal digits. Actual provider costs
and the upstream base-price catalog retain USD; payment receipts, purchase
prices, fees and minimum lifetime payment thresholds use CNY. No historical
foreign-exchange conversion is inferred when displaying synthetic fixtures.
Settings reserve the heading action row on every tab, including mobile, so
profile save/discard controls cannot change the position of navigation/content.
The shared content section provides a positioned content boundary inside its
scroll region so absolutely positioned accessibility labels cannot expand the
document beyond the viewport. Long settings content keeps native internal scrolling.

Table headers, field values and action groups align left in both workspaces.
Personal usage request types keep the operation badge and response mode on one
line. Operation badges reserve the longest localized label width so response modes
start at the same position across rows. Table columns size to their content rather
than retaining a fixed minimum table width after columns are hidden.
One endpoint column groups labeled inbound and outbound paths, including
synthetic explicit-conversion examples. It exposes paths only, never upstream
hosts, accounts or credentials, and adds no backend forwarding contract.
The visible token stack shows input, output and cache-read tokens. Cache reads
are a subset of input tokens and are not added again to the total.
Sortable header labels share the cell content edge without extra button inset.
Stacked table metrics (API keys, group usage, request usage, referral payments
and plan quotas) use semantic label/value rows with compact intrinsic grid
columns and left-aligned tabular amounts. Localized label lengths must not shift
the value column; labels and values stay together without filling spare cell
width or adding hardcoded spaces. Empty states remain centered.
Numeric tracks retain their intrinsic content width. Request-table metric
columns reserve space for complete units and precision; narrow request cards
stack metric groups when their readable widths cannot fit side by side.
