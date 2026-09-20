# Ovload public homepage motion specification

Status: implemented and visually reviewed in the local development preview.
Date: 2026-09-21. ADR 0005 owns the rendering decision.

## Product story

Ovload relays native model traffic. Requests leave clients such as Codex and
Claude Code, converge at Ovload, route to model providers, and return along the
same field. The homepage presents this as a procedural three-dimensional particle
scene rather than an architecture chart or a set of image assets.

The lower-right room is deliberately small, beside the tree rooted on the left. A colorful cartoon programmer is
seen from behind, facing a window, with a MacBook between the person and the
window. The room is a separate vignette without a laptop-to-tree connection.
The upper field remains available for long
traffic curves and one gathering hand. The hand contains a palm, five fingers and
a short tapered wrist, without an arm. Sparse particles, longitudinal fibers and
connecting facets provide its volume. Traffic forms a tree: roots feed its lower
stem, fourteen boughs grow at unequal heights and depths,
and fifty-six canopy limbs subdivide those boughs. The relay is a point on the common stem;
no separate halo, flower or central particle ball is rendered.

The programmer uses a rear typing pose. The character, desk, hands and keyboard
share one room transform; scaling only the character would break wrist alignment.
Raised shoulders lead to relaxed outer elbows, low forearms and bent fingertips
on the keyboard. A small lateral offset exposes the laptop beyond the right
shoulder. Rear hair, ears, a folded hood and hem fibers define the back. Inset,
colorless depth surfaces prevent the screen, chair and hands showing through
the torso; all visible surfaces remain particles. Sparse detail samples do not
mask denser surfaces beneath them. The floor is an irregular elliptical particle island with a
soft radial falloff, rather than a rectangular point field.

A low-contrast flat world map made from sampled continent particles remains behind
the traffic field after the globe unfolds. Warm location clusters distinguish
country and regional connection points from the cooler land particles. The map
provides recognizable global context without competing with the room, moving hand
or routes. Its scale, density and point size adapt to desktop and narrow screens.

Provider names are absent from the canvas. OpenAI, Grok and Gemini marks are
generated from point coordinates only while a capture is active. The mark stays
on the gathering hand's palm anchor, travels with the hand and disperses at the
center. No provider or client labels remain around the canvas.

## Sequence

| State | Time | Behavior |
| --- | ---: | --- |
| `world` | 0–1.2s | A rotating particle globe and great-circle traffic arcs establish global routing. |
| `unfold` | 1.2–3.5s | Longitude and latitude map into a wide, slightly curved particle screen. |
| `gather` | 2.5–5.5s | The screen particles reorganize into the room, person and laptop. The rooted tree, continuous traffic paths and the first thirty access branches fade in near the end. |
| `connect` | 5.5–16.2s | A smaller gathering hand forms at a sampled edge point and grafts a connection onto a nearby canopy limb. Its palm mark dissolves along that limb toward the relay. |
| `ready` | after 16.2s | A separate ambient timeline repeats captures without replaying the globe. |

Theme, language and Login remain reachable for the entire intro. They finish their
quiet opacity reveal when the finite timeline completes. The scene pauses when
hidden or outside the viewport.

The primary tree has a substantial twisted lower trunk, a tapering upper stem,
fourteen boughs, fifty-six canopy limbs and secondary terminal twigs. Eleven
spreading roots fork again near an irregular particle ground surface. Their traffic
continues through the lower trunk to canopy destinations. The lower trunk has
nineteen longitudinal fibers; cross-sectional particle samples supply its thickness.
Upper stems, boughs and roots use progressively smaller bundles. A GPU particle
layer forms clustered foliage in teal, blue and occasional muted gold. Unequal
branch heights, curved root paths, varied leaf clusters and depth offsets prevent
a symmetric fan silhouette. The tree assembles from bottom to top during the
existing intro; its foliage breathes gently without restarting the intro.
Shared segments are drawn once rather than overdrawing every
leaf's entire path to the root. A bounded reservoir contains one hundred
single-lane access branches. Thirty branches are visible when the scene settles;
the rest grow from distributed upper, middle and lower-side sources into their
assigned trunks over three minutes. Lower sources stay outside the room and
character exclusion zone, filling the side fields without crossing the programmer.
All access branches join tree limbs; the character's room stays visually independent.

At most six small particle butterflies occupy the left and right clearings.
Each appears over 2.8 seconds, follows a long curved three-dimensional flight path,
fades from second eighteen to twenty-four, and remains hidden until its next
thirty-six-second cycle. Each cycle deterministically samples new path endpoints
and control points, with small secondary drift, independent wing beats and banking.
Starts are staggered by four seconds. The paths favor the side clearings above
the room. Mobile uses a closer camera and a nearly centered tree, preserving the
room to its right while giving the canopy and roots substantially more screen area.
Starting at scene second twelve, each twenty-six-second batch selects one to six
leaves from six reusable instances. Each leaf samples a canopy source and a delay
of up to 2.2 seconds for that batch. It falls for 11.5 seconds with lateral drift
and tumbling, settles at the ground, and fades between seconds twelve and sixteen
of its own lifetime. Batches do not overlap. Butterflies and falling leaves use
one shader draw and the existing scene clock, so hidden, paused and reduced-motion
states do not run an independent animation loop.

Limbs share tangents with their boughs, and boughs join the stem. Each route traces
that hierarchy to the relay before continuing toward another canopy destination.
Joined paths are resampled by
distance, so movement stays continuous across boundaries. Four-particle tails
show direction and decay; return traffic uses a muted warm accent. The active
provider mark dissolves into its outgoing continuation without re-forming during
the hand's fade-out. A small shared displacement affects the center neighborhood
within three scene units, with outer sources fixed. Lines, packets,
tributary merges, retained routes and the palm use the same spatial motion. Nothing
rotates the attachment points as a rigid group.

Each later capture samples another edge or upper-field point and draws five to ten
lanes over a 6.4-second travel while the hand moves. Its endpoint attaches to a
nearby canopy limb, and its packets continue along the parent bough to the stem.
Thirty-two
pre-sampled sources are spread
across the side edges and upper field, so the twenty retained groups do not reuse a
path. After arrival, only three representative lanes remain as part of the network,
and older captures become progressively quieter. At most twenty captured route
groups remain. Adding a twenty-first makes the oldest route briefly return to a
quiet visible level, then spread outward, distort and fade for three seconds before
its WebGL resources are disposed. The lower-right character zone is excluded from
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
- `web/src/scene/flow-field.ts` owns the tree hierarchy, shared route geometry, distance
  resampling and CPU counterpart of the shared spatial displacement.
- `web/src/scene/tree-particles.ts` samples the trunk, roots and leaf sprays into
  bounded GPU buffers with separate light/dark colors.
- `web/src/scene/garden-motion.ts` owns the six butterfly instances and six reusable
  falling leaves, all driven by the same scene time and formation uniforms.
- `web/src/pages/HomePage.vue` owns the semantic page, utilities, route state and
  PrimeVue dialog.
- `web/src/components/LoginPanel.vue` owns sign-in and registration presentation.
- Vue owns application and route state. GSAP owns visual progress. Three.js owns
  perspective and drawing. PrimeVue owns controls, focus trap and dismissal.

The renderer is loaded through a dynamic import. One GSAP ticker drives all frame
updates. Once each cloud has formed, its vertex shader skips the globe unfolding
trigonometry. Trunks and roots use line batches with a shared GPU displacement;
their buffers are not reconstructed each frame. All one hundred access
branches share one bounded geometry with a draw range, the active capture uses a
second reusable draw-range buffer, and retained captures allocate only their three
representative lanes. Floor and window particles render every third sampled point;
the gathering hand renders every sixth point. Furniture, laptop and the character
render every second point. The character uses a smaller point size and a small set
of stable silhouette fibers so the rear-view hair, shoulders and connected typing
pose remain crisp without restoring the original simultaneous point load that made
software WebGL visibly stutter. WebGL resources,
observers, listeners and timelines are disposed when the page unmounts.

## Accessibility and truthfulness

The canvas is decorative and hidden from assistive technology. Controls, footer
copy and form fields stay semantic in the DOM. Both themes, mobile layout, keyboard
operation and `prefers-reduced-motion` are supported. A WebGL failure leaves Login
usable and shows a localized status message.

The light theme has its own palette: cool gray surface `#E3E6E8`, gray-purple trunks
`#725369`, mauve branches `#A17B91`, rose-pink and lilac foliage, map particles `#66798A`, ambient points
`#72818B`, copper regional nodes `#9B6B4B`, and cool request / warm return paths.
Foliage has larger, denser-looking points than bark, with pink/lilac falling leaves.
The dark canopy retains its teal, blue and muted gold colors.
Trunks have more contrast than branches, and the recognizable map stays behind
both. Captured routes update their color and age-based opacity on theme changes.
It does not obtain its hierarchy by dimming dark-theme colors on a white field.

Traffic and provider marks are illustrative. They do not imply live providers,
real requests or implemented authentication. No prompt, credential, customer data
or remote asset appears in the scene.

## Visual references for the continuous junction

- [Codrops: procedural vortex](https://tympanus.net/codrops/2025/03/10/rendering-a-procedural-vortex-inside-a-glass-sphere-with-three-js-and-tsl/): depth and continuous curvature from the perimeter into the center.
- [Codrops: particle trails](https://tympanus.net/codrops/2025/05/05/matrix-sentinels-building-dynamic-particle-trails-with-tsl/): coherent movement and trailing particles.
- [Until Labs case study](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/): coherent silhouettes and differentiated particle density.
- [Life Rhythm, 19–42 seconds](https://www.bilibili.com/video/BV1R54y1B7rL/): volumetric particle roots, branching hierarchy, layered foliage and signals moving inside connected fibers. The implementation is authored procedural geometry, not an extracted video or asset.

These are design references. No source code or assets were copied. The gateway's
tree structure and capture/return narrative are authored for this project.

## Earlier character revision validation: 2026-09-20

The rear character and typing pose were inspected with close cameras in the real
homepage renderer, followed by desktop/mobile and light/dark page captures.
Frontend build, ESLint and the two public-experience Playwright projects passed.
At that revision browser assertions covered the six-to-twenty laptop tributaries, moving inlet
attachments, fixed outer sources, zero merge gaps, branch growth, capture retirement,
theme/language changes, authentication presentation and reduced motion.

A four-second sample at 1440 by 960 with 100 branches and 20 retained captures
averaged approximately 60 FPS on Intel UHD Graphics through ANGLE Direct3D 11.
This is a short local sample, not a cross-device performance guarantee. The
default headless SwiftShader renderer measured 13-20 FPS; it should not be used
to infer hardware-accelerated playback speed.

## Earlier continuous junction validation: 2026-09-20

Frontend production build and ESLint passed. The public-experience browser test
passed in desktop and mobile projects against the local Vite preview, including
theme/language changes, login/registration presentation, dismissal, reduced motion,
30-to-100 branch growth and retirement beyond twenty capture groups. Connection
checks verify fixed outer sources, subtle central drift, zero gaps at joins,
aligned join tangents and routes that continue to outer destinations.

Both themes were inspected at desktop and mobile dimensions, at initial density
and with 100 branches / 20 retained capture groups. A close view of the handoff
caught an overly thick provider-particle trail; its size now tapers during
dissolution. The final two visual-capture runs passed after that adjustment.
Three-second hardware-rendered samples at maximum density measured approximately
59.6 FPS at 1440 x 900 and 59.9 FPS in the Pixel 7 viewport emulation on the same
Intel UHD / ANGLE Direct3D 11 desktop GPU. The mobile result is viewport emulation,
not a physical-phone measurement, and neither is a long-duration benchmark.

## Tree, garden and light palette validation: 2026-09-21

Production build and ESLint passed. The public-experience checks passed on desktop
and Pixel 7 emulation against the local Vite server, covering theme/language,
login presentation, reduced motion, branch growth and bounded capture retirement.
Separate visual captures covered both themes, initial and maximum density, later
butterfly flights, and leaf batches at scene seconds 18, 27, 44 and 70. The batch
capture checks passed on both viewports without page or console errors. Screenshots
were inspected for pink canopy contrast, independent falling leaves and ground fade.

Short maximum-density samples on Intel UHD / ANGLE Direct3D 11 varied with local
load: approximately 38-60 FPS on desktop and 60 FPS in mobile viewport emulation.
These are local samples, not physical-phone or sustained performance guarantees.
The production build retains the existing warning about a JavaScript chunk larger
than 500 kB; the Three.js scene remains lazily loaded.
