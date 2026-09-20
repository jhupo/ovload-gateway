# Ovload public homepage motion specification

Status: implemented and visually reviewed in the local development preview.
Date: 2026-09-20. ADR 0005 owns the rendering decision.

## Product story

Ovload relays native model traffic. Requests leave clients such as Codex and
Claude Code, converge at Ovload, route to model providers, and return along the
same field. The homepage presents this as a procedural three-dimensional particle
scene rather than an architecture chart or a set of image assets.

The lower-center room is deliberately small. A colorful cartoon programmer is
seen from behind, facing a window, with a MacBook between the person and the
window. A dedicated three-lane task stream connects the active laptop to the
center, then joins the model traffic. The upper field remains available for long
traffic curves and two hands. Each hand contains a palm, five fingers and a short
tapered wrist, without an arm. Sparse particles, longitudinal fibers and connecting
facets provide its volume. The center hand is deliberately quieter than the moving
hand and wraps a small three-orbit relay core instead of acting as a second focal
object.

A low-contrast flat world map made from sampled continent particles remains behind
the traffic field after the globe unfolds. It provides global context without
competing with the room, moving hand or routes. Its scale, density and point size
adapt to desktop and narrow screens.

Provider names are absent from the canvas. OpenAI, Grok and Gemini marks are
generated from point coordinates only while a capture is active. The mark stays
on the gathering hand's palm anchor, travels with the hand and disperses at the
center. No provider or client labels remain around the canvas.

## Sequence

| State | Time | Behavior |
| --- | ---: | --- |
| `world` | 0–1.2s | A rotating particle globe and great-circle traffic arcs establish global routing. |
| `unfold` | 1.2–3.5s | Longitude and latitude map into a wide, slightly curved particle screen. |
| `gather` | 2.5–5.5s | The screen particles reorganize into the room, person and laptop. The smaller center hand, task stream and low-density base trunk fade in near the end. |
| `connect` | 5.5–16.2s | A smaller gathering hand forms at a sampled edge point and follows one continuous curved tween to the exact center. Its palm mark disperses after arrival. |
| `ready` | after 16.2s | A separate ambient timeline repeats captures without replaying the globe. |

Theme, language and Login remain reachable for the entire intro. They finish their
quiet opacity reveal when the finite timeline completes. The scene pauses when
hidden or outside the viewport.

Four primary trunks begin at opposing side edges and use randomized, strongly
curved controls to spiral into the same relay coordinate. Four single-lane branches
join those trunks before the center, creating a readable network hierarchy instead
of a symmetrical star. Each primary route has three parallel lanes whose separation
closes at the source and relay.

Each later capture samples another edge or upper-field point and draws five to ten
converging lanes over a 6.4-second travel while the hand moves. Thirty-two
pre-sampled sources are spread
across the side edges and upper field, so the twenty retained groups do not reuse a
path. After arrival, only three representative lanes remain as part of the network,
and older captures become progressively quieter. At most twenty captured route
groups remain. Adding a twenty-first makes the oldest route briefly return to a
quiet visible level, then spread outward, distort and fade for three seconds before
its WebGL resources are disposed. The lower-center character zone is excluded from
source sampling.

## Login transition

Activating Login records the real button bounds. The upper hand moves to that
location, closes, and travels toward the center while the canvas fades. A PrimeVue
dialog then presents the existing form. The form contains no explanatory marketing
copy and can switch between sign-in and registration presentation. Both submit
actions remain disabled until the authentication API exists. Escape or the close
button returns to `/` and preserves native focus management.

Direct navigation to `/login` renders the final dialog state. Reduced motion skips
decorative travel and exposes the usable final state immediately.

## Implementation ownership

- `web/src/scene/homepage.ts` owns Three.js resources, particle interpolation,
  provider marks, paths, GSAP timelines, pause conditions and disposal.
- `web/src/scene/models.ts` creates deterministic procedural room, person, laptop
  and hand point clouds. No image, texture or downloaded model is used.
- `web/src/pages/HomePage.vue` owns the semantic page, utilities, route state and
  PrimeVue dialog.
- `web/src/components/LoginPanel.vue` owns sign-in and registration presentation.
- Vue owns application and route state. GSAP owns visual progress. Three.js owns
  perspective and drawing. PrimeVue owns controls, focus trap and dismissal.

The renderer is loaded through a dynamic import. One GSAP ticker drives all frame
updates. Static trunks and task paths share two line batches, the active capture
uses one reusable draw-range buffer, and retained captures allocate only their
three representative lanes. The room and hand clouds render every sixth sampled
point. The character renders every third point with a smaller point size so the
rear-view hair, shoulders and arms remain crisp without restoring the original
simultaneous point load that made software WebGL visibly stutter. WebGL resources,
observers, listeners and timelines are disposed when the page unmounts.

## Accessibility and truthfulness

The canvas is decorative and hidden from assistive technology. Controls, footer
copy and form fields stay semantic in the DOM. Both themes, mobile layout, keyboard
operation and `prefers-reduced-motion` are supported. A WebGL failure leaves Login
usable and shows a localized status message.

Traffic and provider marks are illustrative. They do not imply live providers,
real requests or implemented authentication. No prompt, credential, customer data
or remote asset appears in the scene.
