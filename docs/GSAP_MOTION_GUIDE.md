# GSAP motion guide

Status: repository guidance. Date: 2026-09-19.

This guide records the project subset of the official GSAP practices used when a
public interaction grows beyond CSS or PrimeVue transitions. The runtime dependency
and local Skills are installed; the homepage scene now applies this guidance.

## Installation status

- Frontend: `gsap` is pinned to `3.15.0` in `web/package.json` and
  `web/pnpm-lock.yaml`. Installation used the project's declared pnpm `10.17.0`.
  The package includes TypeScript declarations and its plugins; no separate
  `@types/gsap` package or private plugin registry is needed.
- Local agent tooling: seven unmodified official Skills are installed under
  `~/.codex/skills/` on the development machine: `gsap-core`, `gsap-timeline`,
  `gsap-scrolltrigger`, `gsap-plugins`, `gsap-utils`, `gsap-performance`, and
  `gsap-frameworks`. Each has a `SKILL.md` entry point. All seven files were
  checked against the upstream revision recorded below.
- Skills are local guidance, not frontend dependencies. The runtime package
  remains pinned in `web/package.json` and `web/pnpm-lock.yaml`.
- `web/src/scene/homepage.ts` imports GSAP core for the finite intro, separate
  ambient loop, interruption, reduced-motion matching and teardown. It does not
  register an unused plugin. Runtime attribution and license details are recorded
  in `THIRD_PARTY_NOTICES.md`.

## Sources

- [GSAP v3 documentation](https://gsap.com/docs/v3/)
- [GSAP AI Skills](https://github.com/greensock/gsap-skills), revision
  `aed9cfd3277740755f6bfc1155c7aa645403b760` (reviewed 2026-09-19)
- [AI-readable documentation index](https://gsap.com/llms.txt). Follow its `.md`
  links to read individual official documentation pages as Markdown.
- Reviewed Skills: [core](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-core/SKILL.md),
  [timeline](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-timeline/SKILL.md),
  [Vue/frameworks](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-frameworks/SKILL.md),
  [performance](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-performance/SKILL.md),
  [plugins](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-plugins/SKILL.md), and
  [ScrollTrigger](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-scrolltrigger/SKILL.md).

The upstream repository exposes focused skills for core tweens, timelines,
ScrollTrigger, plugins, utilities, performance, and frameworks. The installed set
uses the Agent Skills format and covers this project's Vue implementation.
The rules below are intentionally adapted to this repository's Vue, PrimeVue, and
native-scrolling constraints.

The official repository documents Agent Skills installation and includes Claude and
Cursor plugin manifests. This review did not verify an official GSAP MCP server;
use the confirmed Skills and Markdown documentation as the reference entry points.
The Skills repository declares MIT. The GSAP 3.15.0 runtime instead uses the GSAP
Standard "No Charge" License. Review its own terms again when changing versions.

## Choreography before implementation

For each scene, specify its purpose, starting pose, action, settling pose, and
interrupt target. Establish one foreground action at a time; stagger supporting
lines and keep their contrast below the active hand. Plan overlap with timeline
labels so a hand reaches and grips a cable before the cable follows, and a response
travels back only after the connection reads as complete. This causal order is a
project design choice, not a GSAP API requirement.

Use a small easing vocabulary: `power2.out` for arrival/settling, `sine.inOut` or
`power2.inOut` for deliberate hand travel, and `none` for packets travelling at a
steady rate. Tune these in the prototype; do not apply bouncing or elastic easing
to every object. Micro-interactions keep the design system's short timings; the
longer homepage intro uses its own storyboard budget and remains interruptible.

## Choosing GSAP

Use GSAP when the interaction needs multiple coordinated steps, a timeline that can
pause/reverse/seek, SVG or MotionPath travel, interruption-safe layout transitions,
drag behavior, or a deliberate scroll-linked narrative. Keep CSS or PrimeVue
transitions for isolated opacity/transform changes. Do not add a runtime dependency
for a single ordinary fade.

## Timeline composition

Use one owned timeline per finite sequence; compose phase timelines under it when
needed. Put shared duration/ease values in
`defaults`, name meaningful phases with labels, and place overlap with the position
parameter (`"<"`, `"-=0.15"`, or a label). Avoid a chain of unrelated `delay` values;
labels make the intro and login state machine readable and make skip/reverse behavior
possible.

Store the returned timeline when a user can skip, pause, reverse, or pull the login
control into a modal. A second activation while a transition is active should be
ignored or handled by a deliberate reversal policy.

Keep ambient `repeat: -1` loops outside the finite intro; an infinite child prevents
normal completion of its parent. Vue owns `intro`, `ready`, and `login-open` state;
do not rely solely on `onComplete` to enable actions or release pending transitions.
Skip, cancellation, and reduced-motion changes must reach the same usable state.
Give each property one animation owner: CSS and GSAP must not compete over the same
transform. Use separate wrappers when library and scene motion need to coexist.

## Vue lifecycle and responsive behavior

Create animations after `onMounted`, with the actual DOM element (`root.value`) as
the second argument to `gsap.context(callback, scope)`. Register the unmount hook
during setup and call `ctx?.revert()` there. When a `v-if` or route change mounts the
login surface, await Vue's `nextTick()` before measuring its DOM bounds.

An event callback that creates an animation later must run through a context-owned
function such as `ctx.add(...)`, or explicitly track and dispose that animation.
Context cleanup does not automatically remove DOM listeners, observers, timers,
or custom `gsap.ticker` callbacks; remove those explicitly. Clean up only the scene's
resources, without globally killing other components' animations or ScrollTriggers.

For responsive and accessibility branches, use `gsap.matchMedia()` with named
conditions such as `isDesktop`, `isMobile`, and `reduceMotion`. Let matchMedia own
the contexts it creates, pass the component root as scope, and call `mm.revert()` on
unmount. Rebuild geometry after breakpoint changes without restarting completed
intro scenes. Reduced motion should use
zero-duration/set states or a short opacity-only transition, and must never remove
the login action, focus order, or semantic content.

## Rendering and input performance

Prefer GSAP transform aliases (`x`, `y`, `scale`, `rotation`, `xPercent`) over raw
transform strings. `autoAlpha: 0` also applies `visibility: hidden`, removing an
element from keyboard interaction; use it only when that is the intended state.
Keep the real Login action available during the intro, reveal utilities immediately
on keyboard focus, and never leave invisible click targets. Use
`strokeDasharray`/`strokeDashoffset` for bounded line-art reveals; strokes, masks,
and path morphs can repaint and need profiling.
Avoid `top`, `left`, `width`, and `height` when transforms can express the same
movement. `quickTo()` reuses a tween for smoothing; `quickSetter()` writes a value
immediately without a tween. Batch geometry reads before writes; do not measure
layout in every animation update. Use `will-change` only on active elements and
remove it when no longer needed.

Limit decorative streams, hands, and packets to a bounded set of DOM/SVG elements.
When GSAP owns a scene, use its ticker instead of adding a competing perpetual
requestAnimationFrame loop. Pause decorative work when the document is hidden or
the scene is offscreen; release scene resources when the route changes. On return,
resume only if the state and motion preference still allow it; follow the homepage
specification's settled-state behavior when an intro is interrupted by visibility.

## ScrollTrigger and plugins

Register a plugin once before using it. Put ScrollTrigger on a top-level timeline or
tween, create triggers in page order, call `ScrollTrigger.refresh()` after images,
fonts, or dynamic content change layout, and kill/revert triggers during teardown.
Use native scrolling; this project does not adopt wheel/touch hijacking or a custom
smooth-scroll proxy. Development markers must not ship.

MotionPath, Flip, Draggable, and other plugins require a concrete product use case,
registration, cleanup, and review in the relevant development preview. Do not ship GSDevTools or
development-only tooling. Record adopted dependencies and licenses through the
normal dependency review.

## Homepage application

This is a proposed implementation mapping for
[the homepage storyboard](PUBLIC_HOMEPAGE_MOTION_SPEC.md), not delivered animation.
The opening is time-driven and Login is event-driven; neither requires ScrollTrigger.

| Storyboard action | Candidate implementation | Ownership and constraints |
| --- | --- | --- |
| Global flow unfolds into the room | Finite timeline; layered SVG, mask, transform and opacity | Keep the lower-center programmer stable; profile mask paint cost. |
| Hands gather and connect streams | Nested phase timelines and MotionPathPlugin | Share grip/endpoint coordinates; move the cable after contact; keep at most the storyboard's bounded number of gestures. |
| Hands open/close and lines reveal | Separate SVG poses with transforms/strokes; MorphSVG only if actual path interpolation is needed | MotionPath moves an object along a path; it does not deform fingers or cables. Use prepared artwork and an explicit morph plan. |
| Requests travel out and responses return | Small reusable packet set on MotionPath paths | Separate outward/return routes; maintain continuous travel at loop boundaries. |
| Ready scene repeats | Independent low-density ambient timeline | Pause for login, offscreen, hidden document, or reduced motion; never repeat the full intro indefinitely. |
| Hand pulls Login into the center | DOM measurements plus transform or Flip; a real PrimeVue form | Flip measures start/end layout; it does not supply the hand gesture. Preserve the real control and focus ownership; decorative copies are inert and aria-hidden. |

For Flip with Vue, capture the initial layout, update state, await `nextTick()`, then
animate from the captured state. Use `scale: true` where appropriate to avoid
per-frame width/height changes. Scale a separate decorative surface and reveal the
actual fields at their final size so text does not stretch. Recalculate paths and
target bounds on meaningful resize/orientation
changes. Direct `/login` navigation must render the final state immediately.

API references: [Timeline](https://gsap.com/docs/v3/GSAP/Timeline/),
[context](https://gsap.com/docs/v3/GSAP/gsap.context%28%29/),
[matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/),
[quickTo](https://gsap.com/docs/v3/GSAP/gsap.quickTo%28%29/),
[MotionPath](https://gsap.com/docs/v3/Plugins/MotionPathPlugin/),
[Flip](https://gsap.com/docs/v3/Plugins/Flip/), and
[ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/).

## Review checklist

- The animation has a named owner, a bounded timeline, and a cleanup path.
- Labels and position parameters express sequencing and overlap.
- Reduced motion starts at a usable state; hiding and restoring the page cannot
  strand a pending transition or restart a finished intro.
- Keyboard focus, login navigation, Escape behavior, and semantic content are not
  delayed or replaced by illustration.
- Desktop/mobile, light/dark, keyboard, and reduced-motion states were reviewed in
  the relevant development preview.
- Repeated Login activation, Escape, direct `/login`, route changes, resize, and
  motion-preference changes leave no duplicate loops, stale callbacks, or lost focus.
- Profile the settled loop and active transitions on representative hardware;
  record frame/paint costs and verify resources stop when the scene is inactive.
- No real traffic, prompts, credentials, provider claims, or unlicensed marks are
  embedded in the illustration.
