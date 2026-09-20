# Public homepage asset briefs

These briefs support `docs/PUBLIC_HOMEPAGE_MOTION_SPEC.md`. They describe source
assets for review; they are not product copy and must not be rendered as labels in
the public page. Use original commissioned or generated artwork. Do not use these
briefs to copy a third-party illustration.

## Shared art direction

- Subject: calm, modern, editorial line illustration for a developer-facing AI
  relay service.
- Palette: near-white, ink black, cool graphite and very pale gray only.
- Line system: 1–3px primary strokes, 0.5–1px secondary strokes, round caps and
  joins, a small number of darker active strokes.
- Avoid: cyberpunk grids, neon, purple/blue/green accents, terminal screenshots,
  stock 3D renders, realistic skin detail, busy facial features, fake telemetry,
  readable credentials, provider logo walls and watermarks.
- Delivery: layered transparent SVG where line motion is needed; transparent WebP
  or PNG for soft illustrated layers. Include a flattened review render beside
  the source. Record the source prompt, model or illustrator, date, license and
  SHA-256 in the source archive when adopted.

## `world-contour`

Create an abstract, non-geographic global contour made from a few irregular curved
land-like shapes and small connection points. It is a brief opening metaphor for
global traffic, not a map that claims live coverage. Use one ink-gray color and
large empty gaps. Deliver a 2560×1440 transparent SVG with a separate path group
for points and paths so the opening can draw and fade independently. No country
labels, borders, flags, city names or animated particle storm.

## `global-flow-field`

Create 18–30 long, non-uniform Bézier routes with varied bends and lengths. Routes
must be usable as independent SVG paths. Include an upper request family, a lower
response family and a small number of cross-depth paths. Use no text, icons or
provider marks. Include path IDs in the SVG metadata and keep the viewBox at
`0 0 2560 1440`. The motion implementation supplies dash trains and timing; the
asset must remain a quiet static field by itself.

## `room-window`

Create a wide, quiet room corner seen from slightly above eye level: a window with
soft daylight, a desk edge and a few architectural planes. The room should occupy
the lower half and side margins while preserving negative space for flow paths.
Use a flat editorial illustration with restrained line weight and barely visible
gray surfaces. Deliver a 2560×1440 transparent WebP or layered vector export. Do
not include a person, laptop, text, brand marks or decorative objects that compete
with the data streams.

## `programmer-laptop`

Create a centered lower-body illustration of a programmer seated at a desk or in a
chair, facing a thin modern laptop. Keep the pose quiet and anonymous: no detailed
face, no identifiable person, no photographic texture. The laptop screen faces the
viewer enough to receive the Codex screen layer. Use the shared ink/gray line system
with one solid dark silhouette and transparent surrounding pixels. Deliver the
person, laptop body, hands and chair as separate layers at a 1600px-wide master.
Do not draw a product logo on the laptop lid.

## `codex-screen`

Create a small generic editor surface for the laptop display: three muted line
groups, one request pulse leaving the display, and one response pulse returning.
Use redacted blocks and abstract glyphs only. Do not include real prompts, API
keys, usernames, URLs, model claims or copied Codex UI. Deliver as a transparent
SVG that can be clipped to the laptop screen and recolored by theme.

## `line-hand-center`

Create a single line-art hand and forearm entering from below-center. Provide two
poses in separate SVG groups: open fingers approaching a data stream, then a soft
closed grip around a single cable. Use 1–3px ink strokes, no fill except a very
low-opacity pale-gray shadow line. Keep the silhouette human and readable at
desktop and mobile sizes. The wrist exits the frame so the hand can move along a
curved path. No realistic skin, nails, jewelry, or 3D shading.

## `line-hand-upper-right`

Create a second line-art hand and forearm entering from the upper-right on a
different depth plane. Provide open and joined poses. The fingers should meet the
center cable without covering the login controls after the intro. Mirror the same
line weight, contour language and stroke timing as `line-hand-center`, but vary the
angle and silhouette so the two hands do not look duplicated.

## `cable-routes`

Deliver route definitions, not a finished diagram. Include cable groups for client
request, provider request, provider response and client response. Each path needs
an ID, a semantic direction, a duration range and a depth group. Keep the routes
bounded and countable so the renderer can pause them, reduce them on mobile and
turn them off for reduced motion. A route is illustrative and must never be
presented as live request telemetry.

## Review checklist

- The person remains recognizable as a person using a laptop at a glance.
- The laptop screen is large enough to see an abstract Codex pulse but contains no
  sensitive or copied text.
- Each hand has an open and a connected pose and can be animated without redrawing
  the whole scene.
- All flow paths have stable IDs and can express both request and response motion.
- The flattened review render works in light and dark previews without colored
  accents or glow.
- Source URL, author/model, license, revision/date, prompt and hash are recorded
  before any external or generated asset enters `web/public/`.
