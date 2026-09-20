# Ovload Gateway Design System

## Direction
A precise modern control panel using graphite neutrals and a blue-violet accent.
Administration emphasizes efficient operations; the user workspace emphasizes
onboarding, plans, and usage.
Never display fabricated revenue, traffic, accounts, or integration availability.

## Tokens
Light: background #F7F8FA, surface #FFFFFF, text #181D27, secondary #667085.
Dark: background #101216, surface #181B21, text #ECEEF3, secondary #9AA3B2.
Accent: #635BFF in light mode, adjusted for contrast in dark mode.
Measure text contrast against WCAG AA.
Radii: buttons 8px, inputs 11px, glass cards 18–24px, dialogs 26px. Spacing follows a 4px scale.
Self-host Inter Variable for Latin and Noto Sans SC Variable for Chinese, with system sans-serif as the final font stack. Load unicode-range subsets from bundled font packages; do not call external font services.
Use tabular numerals for metrics and monospace for identifiers.
Plans, charts, menus, and dialogs share semantic tokens.

## Layout and states
Desktop sidebar: 240px, collapsing to 72px with labeled icon links. Mobile uses a drawer and dedicated filter panels.
Accounts show 5h/7d usage, reset time, and the reason for a cooldown.
Request details use an event timeline.
Refreshes preserve scroll position and selection; new logs use an explicit
new-items indicator or opt-in follow mode.
Design empty, error, loading, and forbidden states.
Do not render working-looking controls for unimplemented features.

## Motion and accessibility
Button feedback: 180ms. Tab underline: 280ms. Drawer entry: 380ms; exit: 220ms.
Prefer opacity and transform animations.
Respect prefers-reduced-motion. Do not animate each high-frequency log entry.
Continuous decorative motion belongs only on welcome screens, not dense operational pages.
Provide visible keyboard focus, dialog focus management, Escape handling,
and focus restoration.

## UI library and review workflow
Use PrimeVue 4.5.5 and @primeuix/themes 1.2.5 (MIT), with the shared Aura-derived
preset in web/src/ui/config.ts. These versions are pinned exactly. Do not upgrade
to PrimeVue 5 or themes 3: their commercial license terms differ from this project.
Use library components directly; introduce a domain composition only for a concrete
product requirement. Do not wrap every control or implement competing primitives.

Run `pnpm --dir web dev` and open `/preview.html?view=user` or
`/preview.html?view=admin` for the development preview. It uses the actual PrimeVue
components and shared configuration. Review new controls and applicable states in
the preview and then in the integrated product flow before promotion. Obtain user
design approval and reuse the same imports, preset, tokens, and patterns.
Review keyboard/focus behavior, mobile/desktop, light/dark, and reduced motion.
Library transitions supply modal/drawer lifecycle and focus management.
Avoid decorative motion in dense operational screens and never animate log rows.

All preview business data is labeled synthetic. Actions affect only local state;
file selection shows a filename without reading or uploading its contents.
Browser tests live under tests/e2e; the preview implementation is under
web/src/design-test.
The interface supports Simplified Chinese and English through vue-i18n. Maintained documentation is English.

## Material-inspired glass review
`web/src/ui/material.css` defines shared glass, shadow, blur, and motion tokens.
Use translucent cards over a restrained colored backdrop, stronger opaque surfaces
for readable overlays, 12px modal background blur, 18–28px surface blur, and soft
elevation shadows. Keep labels readable in both themes. Use the PrimeVue ripple
implementation for pointer feedback, not a custom event-driven replacement.
Buttons also provide a keyboard focus state. Reduced motion disables decorative
transitions and ripple rendering. Dialog entry uses 280–380ms emphasized easing;
exit is shorter. Theme icons, tab content, and the live sample demonstrate state
transitions. No continuously moving background is required.

## Typography, icons, and controls
Shared tokens live in web/src/ui/fonts.css. Body and standard buttons: 14px;
compact labels/tables: 13px; secondary descriptions: 12px; sections: 18px;
dialog titles: 20px; page titles: approximately 30px. Use weights 400/500/600.
Promotional lab headings may be larger; do not carry that scale into dense tables.
Use Lucide Vue icons: 16px for controls, 18px for navigation, 14px for removal,
with 1.75px strokes. Close controls use a plain X with a subtle square hover
surface, not a circled X. Regular buttons are 36px, compact 32px, large 40px.
Mobile header and close targets are at least 40px. Table actions have no elevation.
Keep button feedback to background/color/ripple; do not lift or glow every action.

## Language and data visualization
Keep all UI copy and accessible labels in web/src/i18n language resources.
Translate option labels without changing their stable values. Persist the chosen
language and update html lang and PrimeVue locale together. Format numbers with
Intl and the active locale. Do not concatenate translated sentence fragments.
Use ECharts through vue-echarts for line/area and donut charts. Register only the
required chart modules and use SVG rendering. Charts resize with their containers,
update colors with the theme, expose data tooltips, and respect reduced motion.
The component catalog uses explicitly labeled sample data, never live statistics.

## Contextual dismissal
- Preview, details, and navigation: outside click, Escape, and the close button dismiss.
- Editors without changes: the same dismissal is allowed.
- Dirty editors: outside click and Escape do not discard work; provide explicit Save
  and Discard actions. Do not silently reset the draft.
- Destructive confirmations: require explicit Confirm or Cancel; disable outside
  click, Escape, and the close icon.
Use PrimeVue focus trapping and focus restoration rather than custom event handlers.

## Reference evidence
See reports/UI_REFERENCE_REVIEW.md. CDK source was inspected for typography,
icons, buttons, and animated Tabs. Flutter public HTML/CSS was inspected for
font scale, button dimensions, and transition timing. The live CDK dashboard
and Flutter animations were not visually verified in a browser; do not claim
pixel-equivalent reproduction. No reference project source was copied.

## Public experience and reviewed motion
Public routes are / and /login. /login is explicitly served by the Rust static
router; unknown model APIs and asset paths remain 404. The login form is a visual
presentation until authentication is implemented; its submit is unavailable.
Provider names are marked as a roadmap, not a live capability claim.

web/src/ui/motion.css owns route changes (320ms), perspective dialog reveal
(480ms), section reveal (750ms), login entry (950ms), and the primary action's
left-to-right background expansion (440ms). These effects use transform/opacity;
native scrolling and keyboard focus remain intact. Reduced motion disables
all decorative movement, including the SVG particle's CSS animation.
ConnectionScene owns a semantic connection illustration. Scroll progress changes
its line reveal through one passive, requestAnimationFrame-throttled listener.
The existing library continues to own buttons, fields, overlays and focus traps.

/preview.html?view=user and /preview.html?view=admin are development-only page
concepts with local state and a compact sample-data marker. They do not submit
credentials, create API keys, or contact provider endpoints. New interaction
patterns remain subject to user visual review before business integration.
Keep copy concise: labels, necessary status/validation, and meaningful product
content. Put explanations of components, motion and architecture in documents.
Reference page http://192.168.2.150:18081/login was inspected read-only. Its
fine route topology and foreground sign-in card informed the direction; no code,
credentials, or private assets were copied. Image-generation briefs are in
reports/DESIGN_IMAGE_BRIEFS.md, and their generation status is tracked there.

## Public homepage intro direction

The public homepage uses a neutral editorial surface, long layered flow lines, a
small lower-center programmer and laptop scene, and sparse particle-and-fiber hands
that gather illustrative data streams. Every visual is procedural Three.js geometry;
there are no image, texture, CSS-art or remote-model assets. The full sequence,
ownership and login transition are specified in
`docs/PUBLIC_HOMEPAGE_MOTION_SPEC.md`.

## GSAP motion boundary

GSAP 3.15.0 is installed and pinned for the public homepage's coordinated
particle timeline and interruption. It also supports drag interaction and
ScrollTrigger when a concrete future scene needs them.
CSS transitions, PrimeVue transitions, and the existing bounded SVG/requestAnimationFrame
illustration remain the default for simple fades and hover feedback. The homepage
imports GSAP core without registering unused plugins. See `THIRD_PARTY_NOTICES.md`
for its license.

When GSAP is used, build a named `gsap.timeline()` with shared defaults and labels or
position parameters. Keep finite intros separate from ambient loops. Vue owns scene
state; GSAP controls visual progress. Create animations after `onMounted`, scope the
context to the actual root element, and revert on unmount. `gsap.matchMedia()` owns
its responsive/reduced-motion contexts and needs `mm.revert()` during teardown.
Explicitly remove event listeners, observers and custom ticker callbacks as well.
High-frequency values use `quickTo()` for smoothing or `quickSetter()` for immediate
updates. Give CSS, PrimeVue, and GSAP separate property ownership.

Prefer transform aliases and opacity. Use `autoAlpha` only when hiding an element
from interaction is intended; keep Login available during the intro. Bound SVG
stroke work because it can repaint. Avoid layout properties that trigger reflow
when a transform can express the motion.
ScrollTrigger is allowed only for a deliberate scroll narrative: use native scrolling,
register the plugin once, attach it to a top-level tween/timeline, create triggers in
page order, refresh after dynamic layout changes, and kill/revert on teardown. Never
ship development markers or an unbounded particle/requestAnimationFrame loop.

Pause decorative work when the document is hidden or the scene is offscreen. Reduced
motion still exposes the same semantic content, focus order, and actions immediately.
Review new GSAP states in the relevant development preview across desktop/mobile,
both themes, keyboard, and reduced-motion before route integration. Seven official GSAP Skills are installed
as local agent tooling; their files are not vendored in this repository. This guidance
is derived from the public GSAP v3 documentation and `greensock/gsap-skills`.
See [GSAP motion guide](GSAP_MOTION_GUIDE.md) for installation details, sources,
choreography, lifecycle details, and the homepage scene-to-plugin mapping.
