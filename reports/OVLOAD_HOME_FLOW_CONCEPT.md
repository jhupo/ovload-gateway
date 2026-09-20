# Ovload Home: Bidirectional Flow Concept

Status: the first dark homepage concept was generated successfully on 2026-09-19
through the user-authorized Sub2API synchronous image endpoint, using
`gpt-image-2.5-flare`. Output: `output/imagegen/ovload-home-dark-v1.png`.
The exact submitted prompt is retained locally in ignored
`output/imagegen/home-prompt.txt`; no reference files were uploaded. The supplied
screenshots informed the written composition brief. Requested size: 1536x864;
the service returned a 2560x1440 PNG. The image was visually inspected.

The asynchronous endpoint remains disabled (HTTP 404); synchronous generation was
explicitly requested, not an automatic fallback. The development tool is
scripts/generate_image.py; see docs/IMAGE_GENERATION.md. The motion board and light
variant remain planned, not generated. This is an illustration, not a working UI
or a verified client-to-protocol compatibility map. Product implementation must
correct protocol placement and use approved brand/icon assets.

## Reference roles

All three user attachments are visual references, not edit targets.
- Image 1: fine curved topology, moving packets, foreground authentication surface.
- Image 2: a clear registration entry and restrained navigation; omit promotional
  copy, metrics, orange palette, and the dashboard illustration.
- Image 3: recognizable provider endpoints and visual hierarchy; omit the terminal,
  feature cards, large headlines, and capability badges.

## Shared generation prompt

Use case: ui-mockup.
Asset type: high-fidelity desktop homepage concept for Ovload Gateway, 16:9.
Primary request: a minimal but carefully detailed full-screen authentication
homepage with bidirectional data flowing from diverse clients, through protocol
lanes into Ovload, onward to model providers, and back to the originating clients.
Use the supplied screenshots as references according to the roles above.

Composition: a small ovload. wordmark at the top left, compact language and theme
controls at the top right. Use abundant negative space. Place client nodes in the
left quarter: Codex CLI, Claude Code, Web App, SDK. Place small protocol labels
along the incoming paths: Responses, Chat Completions, Messages, HTTP/SSE, WebSocket.
These are illustrative lanes, not a claim that every client supports every lane.
Place model provider nodes in the right quarter: OpenAI, Anthropic, Gemini, Grok.
Fine curved lines gather at a central Ovload hub and fan out toward the providers.
Show outward requests in muted blue-violet and returning packets in subdued silver
lavender, using neighboring tracks with opposite tapered trails. Sparse directional
chevrons make the return trip visible without an explanatory legend. Preserve the
same topology and node positions across all keyframes.

The final central authentication card is approximately 400px wide, comfortably
framed by the visible left and right nodes. Anchor a small Ovload hub/mark just
above the card, visibly joining its incoming and outgoing rails. Keep routes behind
the card low contrast and blurred, never crossing over readable fields. Use a fine
border, a restrained translucent graphite surface, soft shadow, and a 22px radius.
Use PrimeVue Aura-compatible form geometry, 11px input corners and 8px button
corners, Lucide-style 16px icons, Inter and Noto Sans SC typography, 14px form text.
The card contains only a brand mark, Login/Register tabs, labeled email and password
fields, a visibility icon, a primary submit button, and a small forgot-password
link. Registration is a clearly visible tab, not a decorative badge.

Exact Chinese interface text: "登录", "注册", "邮箱", "密码", "忘记密码".
Use "ovload." for the brand. No welcome sentence, subtitle, promotional headline,
feature explanation, instructional paragraph, animation labels, live statistics,
availability claims, fake terminal, or watermark anywhere inside the page.

Palette: graphite background #101216, surface #181B21, text #ECEEF3, secondary
#9AA3B2, restrained lavender accent #918AFF. Add only a very broad, faint wash of
light around the hub. No neon mesh, sci-fi HUD, starfield, dense grid, particle
storm, giant glowing orb, or exaggerated glass effects. Make it feasible to build
with the existing Vue 3 / PrimeVue design system and lightweight SVG/CSS motion.

## Requested outputs and per-image prompt additions

1. `ovload-home-dark.png`: final dark-theme full-page mockup. Login card fully
   visible, crisp and readable; show short packet trails in both directions.
2. `ovload-home-motion-board.png`: three equal wide frames stacked vertically,
   showing the same camera, topology, scale, palette, and UI. First: routes unfold
   into the central hub, card not yet visible. Second: requests reach providers and
   silver return trails emerge while the card appears at 55 percent opacity with
   a subtle 5-degree perspective tilt. Third: card fully upright and opaque,
   background flow continues quietly. No arrows or captions outside the actual
   interface; sequence alone communicates motion. Do not duplicate ghost forms
   within a frame.
3. `ovload-home-light.png`: identical final composition in the existing light
   palette: #F7F8FA background, white surface, #181D27 text, #667085 secondary,
   #635BFF accent. Fine pale-gray paths, readable violet packets, subtle shadow.

## Implementation handoff (not text to render in images)

- Opening routes unfold over roughly 900ms; do not block form interaction.
- Login surface reveals with opacity, a small vertical offset, and perspective
  over roughly 950ms. It must remain readable without animation.
- Sparse request/response pulses travel in opposite directions over 4-7 seconds;
  maintain visual causal order through the hub. This is illustrative, not telemetry.
- Login/Register tabs share the existing underline transition; primary action
  uses the existing left-to-right surface fill. Define actual registration fields
  with the authentication contract during implementation, not in decorative copy.
- Pause decorative movement when offscreen or the page is hidden. Reduced-motion
  mode shows the complete static topology and immediately visible form.
- Mobile keeps the form central and usable; simplify background routes and arrange
  endpoints above/below rather than shrinking the desktop diagram into unreadability.
- Review imagery first. Authentication remains unimplemented; this brief neither
  enables submission nor changes product routes or supported capabilities.

## Revision 2: palette and composition review

The user rejected the dark violet concept and its palette. A new ivory, ink,
stone-gray and muted eucalyptus concept was generated through the authorized
synchronous endpoint with gpt-image-2.5-flare and visually inspected. Large
endpoint cards and repeated branding were removed. Output:
`output/imagegen/ovload-home-ivory-v2.png`. Exact local prompt:
`output/imagegen/home-prompt-v2.txt`. This is a proposed palette for review,
not an approved change to the shared product theme.

## Revision 3: two entrance keyframes

The user requested separate background-only and sign-in frames after rejecting
both earlier styles. Both outputs use neutral white, ink and silver:
- `output/imagegen/ovload-home-v3-background.png`
- `output/imagegen/ovload-home-v3-login.png`

The first was generated through the synchronous generations API. The second used
the first as the sole edit target through multipart `/v1/images/edits`, preserving
the endpoint positions while adding a borderless form and reducing path contrast.
Both used `gpt-image-2.5-flare`; both 2560x1440 outputs were visually inspected.
These are static motion reference frames, not animation or implemented UI.
Exact local prompts: `output/imagegen/home-v3-background-prompt.txt` and
`output/imagegen/home-v3-login-prompt.txt`. Product design approval is pending.

## Revision 4: request and response flow

The latest two frames make the round trip explicit. Upper and lower neighboring
curves carry opposite directions through a small Ovload hub: client -> gateway ->
provider for requests and provider -> gateway -> client for streaming responses.
The background-only frame is `output/imagegen/ovload-home-v4-background.png` and
the matching login frame is `output/imagegen/ovload-home-v4-login.png`.
Both use neutral white, ink and cool-gray values, with no saturated accent. The
second frame is a multipart edit of the first to keep positions stable. These are
static keyframes for later SVG/CSS motion and require visual approval before UI
implementation.

## Revision 5: non-aligned line field explorations

The user rejected the aligned sparse ribbons. Three independent monochrome concepts
were generated with denser, varied line choreography and irregular endpoint placement:
`output/imagegen/ovload-home-v5-diagonal.png`,
`output/imagegen/ovload-home-v5-asymmetric.png`, and
`output/imagegen/ovload-home-v5-weave.png`. They are ideation outputs only; no
implementation should begin until one direction is selected.
