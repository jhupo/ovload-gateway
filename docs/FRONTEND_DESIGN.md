# Frontend design: shadcn-admin

This is the implementation guide for the existing React administration and
customer workspace under `web/`. The visual baseline is the existing shadcn-admin
application: compact operational screens, familiar controls, and consistent
information hierarchy. Product previews do not establish executable API or
billing behavior; consult [API contracts](API.md) before connecting them.

## Ownership and existing building blocks

| Concern | Owner | Design responsibility |
| --- | --- | --- |
| Routes | `web/src/routes/` | Route composition, access requirements, and route state; keep feature implementation outside route files. |
| Features | `web/src/features/` | Use cases, page composition, feature forms, and feature-specific state. |
| Workspace | [layout components](../web/src/components/layout/) | Shared sidebar, header, navigation, and `Main`. |
| Primitives | [components.json](../web/components.json) and [UI components](../web/src/components/ui/) | Existing shadcn `new-york` primitives and their accessibility behavior. |
| Tables | [data-table components](../web/src/components/data-table/) | Toolbar, faceted filters, column controls, sorting, and pagination. |
| Theme | [theme.css](../web/src/styles/theme.css) | Semantic colors, status colors, chart colors, typography, and theme mapping. |
| Translation | [i18n resources](../web/src/i18n/) | Synchronized English/Chinese copy and accessible names. |
| Charts | [TelemetryChart](../web/src/components/telemetry-chart.tsx) | ECharts lifecycle, semantic palette, resizing, and reduced-motion behavior. |

Real HTTP clients live in `web/src/api/`. Transport DTOs and validation belong in
`web/src/api/contracts`; session and step-up access are ports installed by the
application root. Feature modules consume these clients and own their query
keys/forms. API modules do not import Zustand stores, React components, or
feature modules. Derive request and response types from OpenAPI when a generator
is available; do not hand-edit generated files or invent successful responses.

Use installed libraries and shared components before adding dependencies or
building another abstraction. Do not introduce a second runtime UI library or
handwritten replacements for available shadcn primitives. A shared abstraction
must have real callers; keep a feature-specific component with its feature.

## Page composition

Administrative menus and personal settings use the original shared
[Main](../web/src/components/layout/main.tsx) without `fluid`. The header and
workspace fill the available area; `Main` owns content centering with
`@7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl`.

Outer spacing belongs exclusively to `Main`: 16px horizontal padding below `md`,
24px from `md`, 20px top padding, 24px bottom padding, and a 20px vertical stack
gap. Do not reproduce or override these values in individual pages. A direct
heading child has `data-slot="page-heading"`; `Main` supplies its bottom border
and the 20px space between the heading and that border. The stack supplies the
following 20px gap. Do not add another divider, heading margin, or spacer.

Keep headings, actions, filters, content, and pagination within the same `Main`.
Constrain individual fields or sections only when their content warrants it.
Preserve workspace-header borders and section dividers. Features own internal
scroll regions and clearance for fixed actions; do not alter the outer layout
to compensate for them.

Compose pages for scanning and repeated action. Keep titles concise, put related
actions beside their subject, and group fields by business meaning. Use ordinary
page sections and dividers. Cards frame individual repeated items or tools, not
every page section; do not nest cards. Preserve the existing primitive radii.
Operational pages do not need a hero, a decorative illustration, or prose that
explains the interface. Necessary labels, statuses, empty states, errors, and
confirmation consequences remain visible.

## Tables and filters

Reuse [DataTableFrame](../web/src/components/data-table/frame.tsx) and its
shared components for directory and record tables. Preserve the established
toolbar order, column view controls, sortable headers, and pagination. Search,
categorical filters, and toolbar actions are 32px high. Categorical filters use
the shared faceted style; form selections and time ranges use ordinary selects.
View controls stay in normal toolbar flow. Do not align them with negative
margins or absolute positioning.

Use stable record IDs for selection and updates. Refresh data without resetting
selection or scroll unnecessarily; remove selections only when records leave
the valid result set or a completed action requires it. Preserve meaningful
filter and page state during navigation. Distinguish initial loading, refreshing,
no records, no matching results, failed retrieval, and permission denial.

Bound result sets and retained pages. Use server pagination for large datasets
and virtualization where rendered row counts require it. Do not fetch or render
an unbounded history. Keep table widths stable while data loads, and retain
usable horizontal scrolling on narrow viewports. `DataTableFrame` is the only
shared shell for toolbar, viewport, loading/error/empty states and pagination;
feature tables provide only their columns or the body needed for fixed-column
behavior.

## Forms, actions, and feedback

Choose controls by their meaning: checkboxes or switches for binary values,
selects or menus for option sets, tabs for views, segmented controls for modes,
and constrained inputs or steppers for numbers. Use existing Lucide icons for
tool actions, with an accessible name and a tooltip where the symbol is unclear.
Keep explicit text or icon-and-text buttons for commands such as creating or
confirming an operation. Match icon dimensions and button sizes to neighboring
controls.

Size fields for expected values without changing the page's outer width. Keep a
coherent reading and tab order when field groups stack. Use visible labels and
associate them with inputs. Reuse [FieldLayout](../web/src/components/field-layout.tsx)
for its accessible error description. Retain invalid styling,
`aria-describedby`, and focus on the first invalid field.

Transient success, error, warning, information, and validation feedback uses the
single root [Sonner toaster](../web/src/components/ui/sonner.tsx) at bottom-right.
Do not add feature toasters, position overrides, or repeated visible field and
section errors. Use stable validation toast IDs. Preserve the existing mobile
safe-area offset so feedback clears fixed actions. Persistent state, request
error records, logs, empty states, and destructive confirmations remain page or
dialog content.

Use shadcn dialogs for focus management and restore focus to the invoking
control. Provide accessible titles; ordinary dialog descriptions are `sr-only`.
Render concrete destructive consequences as confirmation content when needed.
Previews close on outside click or Escape. Dirty editors and destructive
confirmations require an explicit decision; do not dismiss a draft or start a
destructive action merely because focus moved. Keep submission pending state
visible and prevent duplicate mutations without freezing unrelated controls.
Close, invalidate data, and announce success only after a confirmed server result.

## Typography, colors, and responsive behavior

Use semantic theme tokens for surfaces, text, borders, focus, status badges, and
charts. Centralize palette mappings in `theme.css`; do not scatter raw colors
through features. Reuse the approved Inter/Noto Sans SC typography and existing
font configuration rather than adding a feature font. Keep chart text consistent
with the surrounding UI. Do not add a separate palette or change typography for
a routine control edit.

Use the existing heading hierarchy and compact panel typography. Do not scale
font sizes with viewport width or add negative letter spacing. Let labels wrap
without obscuring neighboring controls. Constrain fixed-format controls and
loading placeholders so content, hover states, and validation do not resize the
layout. Avoid page-wide overflow; keep any necessary table scrolling local.

Keep English and Chinese labels, status names, error text, pluralization, and
accessible names synchronized in `web/src/i18n/`. Test text using its real
translation, not a short placeholder. Show semantic status with text or a
recognizable symbol as well as color. Preserve keyboard access, focus visibility,
and the shared components' interaction behavior in both themes.

## Data, pricing, and financial presentation

Connect screens only to documented, implemented contracts. Keep fixtures in
tests; production routes must not import sample datasets or simulated stores.
Missing integration must remain an honest unavailable state; a local timeout,
synthetic record, or dialog close does not prove a successful backend mutation.

Customer financial contracts use USD with ten decimal places. Preserve exact
decimal strings through API boundaries; authoritative amounts and calculations
must not use JavaScript floating-point arithmetic. Procurement cost and retail
charge are separate fields with separate labels. Display model price units,
such as USD per million input tokens, explicitly; distinguish list price,
effective price, usage amount, reserved funds, and settled charges. Follow
[Billing and Pricing](BILLING_AND_PRICING_DESIGN.md) for their semantics.

Preserve existing visual components when an integration is unavailable: show
unknown metrics, unavailable table content and disabled business writes inside
the original layout. Do not replace whole screens solely to remove sample data.
Migrate formatters, API types, and callers together when connecting a financial
flow; changing a currency label does not convert an existing amount.
Where a payment uses another currency, show its payment amount and quoted
exchange rate separately from the credited USD amount.

Distinguish a known zero from unavailable usage or cost. Display pending
settlement and reserved amounts as their own states. A balance displayed in the
browser cannot authorize spending; admission and the accepted reservation rule
are server responsibilities. Keep financial actions pending until their
idempotent server operation confirms the resulting state.

## Charts and motion

Reuse `TelemetryChart` and its runtime instead of creating feature-owned ECharts
instances. Supply stable series IDs and semantic palette values. Label axes,
time ranges, units, and missing samples accurately; never turn unavailable
telemetry into a zero-valued series. Bound history and refresh work, and avoid
resetting the reader's chosen range on each update.

Keep motion restrained and subordinate to immediate interaction. Use CSS or
existing library transitions for simple states. React owns state, shadcn owns
focus, and native scrolling stays intact. The public entry point uses the
static shadcn-admin authentication layout; administrative pages do not add
decorative scenes.

## Change workflow

Before a substantial layout change, inspect the route, feature, nearest shared
pattern, affected callers, data states, and translations. State the primary task,
information hierarchy, action placement, and responsive behavior briefly, then
implement within the existing system. Routine control, copy, and spacing edits
reuse neighboring patterns directly. New pages and routes require explicit user
authorization.

Functional validation follows the changed behavior and the repository's
validation rules. Report completed validation and concrete limitations without
claiming a preview is an integrated product flow.
