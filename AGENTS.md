# Ovload Gateway Agent Instructions

## Scope and authorization
- These instructions apply to the entire repository. Explicit user instructions take precedence.
- Read docs/ARCHITECTURE.md, docs/DEVELOPMENT.md, and relevant ADRs before making changes.
- Write repository documentation and agent instructions in English.
- Do not commit, push, tag, deploy, or publish without explicit user authorization.
- Do not access production systems unless the user specifies the scope. Read-only authorization permits reads only.
- Preserve existing user changes. Never store tokens, cookies, passwords, authorization files, or real prompts in the repository.
- Do not spawn subagents unless the user explicitly requests parallel agent work.

## Architecture
- Use Rust, Tokio, Axum/Tower, and a modular monolith. Use Vue 3 and TypeScript for the frontend.
- Keep core independent of databases, Axum, and concrete providers. Dependencies flow from server to business modules/adapters to core.
- Separate inbound protocol adapters, provider adapters, and outbound transport adapters.
- Preserve native protocol payloads; do not force all providers through Chat Completions.
- Providers must not select accounts or perform independent retries. The executor owns deadlines, cancellation, retry budgets, and attempted accounts.
- Model OpenAI API/Codex, Gemini API/CLI/Antigravity, and Grok API/Web as distinct adapters.
- Advertise only implemented and verified capabilities.
- Do not introduce compatibility code: no legacy aliases, old/new implementation switches, dual runtime paths, or fallback branches that preserve superseded behavior. Do not add silent degradation, guessed continuation state, or temporary patches.
- Explicit, documented protocol conversion is a product capability, not a legacy fallback.
- Add abstractions and crates only when real callers and use cases justify them.

## Architecture conformance and complete implementation
- Treat docs/ARCHITECTURE.md and accepted ADRs as the implementation contract. Identify the owning module and dependency direction before adding behavior; keep responsibilities explicit and cohesive.
- Do not bypass module boundaries, create circular dependencies, or duplicate business rules across middleware, adapters, and UI. Fix the responsible layer and update all affected callers.
- If a requirement needs an architectural change, document the decision and rationale in the architecture document and a relevant ADR before implementing the revised design. Keep design and implementation synchronized in the same change.
- Replace superseded implementations completely within the authorized scope. Remove obsolete code, configuration, UI controls, tests, and documentation rather than retaining compatibility shims or stacking patches over the root cause.
- Complete each authorized change end to end, including affected backend and frontend paths, configuration, error handling, tests, and documentation. Do not stop at a partial implementation or leave required work as TODOs, stubs, placeholders, or follow-up promises.
- A planned delivery phase may remain unimplemented, but every feature claimed as delivered must work through its real execution path. Do not expand scope into unrelated future phases.
- Before delivery, review the entire affected flow against the design and acceptance criteria, run relevant checks, and resolve discovered regressions. If an external blocker prevents completion, finish independent work and report exactly what remains blocked; never present incomplete work as finished.

## Correctness and security
- Streaming pipelines must use bounded buffers, propagate backpressure, and cancel upstream work when clients disconnect.
- A disconnected request may already have executed upstream. Do not replay it without a supported replay policy.
- Bind response, tool, and turn state to the tenant, credential principal, session, and profile/egress generations.
- Bind outbound routes to accounts. Do not spoof forwarded client IP headers or hardware attestations.
- Network profiles require versioned dependencies and source or capture evidence. Never promise bypassing upstream risk controls.
- Treat user input and upstream errors as untrusted. Enforce SSRF protections, tenant isolation, and log redaction.
- Use fixed-point values or integer units for money. Billing writes must be idempotent.
- Propagate errors with Result. Avoid unjustified unwrap/expect in request paths.
- Supervise background tasks and provide shutdown and resource limits.

## Frontend
- Prefer maintained PrimeVue components and the shared Aura theme. Do not hand-build controls, add a second UI library, or introduce wrapper components unless a concrete unmet requirement justifies it; document the reason first.
- Add every new UI control and its relevant states to the applicable development preview before product use. Reuse the reviewed library configuration, tokens, and patterns in product screens; do not create divergent copies. User design approval is required before promoting new visual patterns into product flows.
- Deliver elegant modern motion: coherent easing, subtle feedback, smooth overlay transitions, and restrained emphasis. Prefer library transitions and transform/opacity; avoid distracting animation or layout shifts.
- Follow docs/DESIGN_SYSTEM.md. Deliver a modern, cohesive interface with clear visual hierarchy, consistent typography, spacing, icons, and responsive layouts. Reuse shared components and semantic tokens instead of introducing page-specific visual conventions.
- Use purposeful motion for interaction feedback and state transitions, following the design system timings. Animations must remain smooth, respect reduced-motion preferences, and never delay actions or obscure status.
- Before integrating a new control into a product flow, exercise it in a component test or development preview and complete a visual and interaction review. Verify applicable default, hover, focus, disabled, loading, empty, success, and error states, keyboard behavior, mobile layout, and both themes. Then verify the control in the real integrated flow; a preview alone is insufficient.
- Use semantic theme tokens. Support light/dark themes, mobile layouts, keyboard navigation, and reduced motion.
- Clearly distinguish real data from examples. Do not render fake working controls for unfinished features.
- Keep animation short and restrained. Do not animate every high-frequency log row.
- Virtualize large tables. Preserve user selection and scroll position during refreshes.
- Keep implementation details out of ordinary user flows; expose them on diagnostic screens when useful.
- Use strict TypeScript. Generate API types from OpenAPI once the API exists; do not hand-edit generated files.

- Use the shared Inter/Noto Sans SC font stack, size tokens, and Lucide icon scale. Keep close buttons plain and table actions free from elevation.
- Put interface copy and accessible labels in both language resources; preserve stable option values and update library locales with the chosen language.
- Apply contextual modal dismissal: previews allow outside click/Escape; dirty editors and destructive confirmations require explicit decisions. Verify focus restoration and keyboard behavior.
- Use ECharts/vue-echarts for data visualization; review responsive sizing, both themes, tooltips, sample-data labeling, and reduced motion in the catalog.

- Keep public pages minimal and editorial: generous whitespace, quiet surfaces, a restrained accent, and readable connection diagrams. Avoid neon grids, particle storms, fake terminals, and generic science-fiction styling.
- Use coherent page transitions, subtle perspective reveal for overlays, a left-to-right surface fill for primary actions, and gradual section/login reveals. Preserve native scrolling; do not hijack wheel/touch input or delay interaction for animation.
- Respect reduced motion for CSS, SVG, and JavaScript animation; offscreen decoration must not consume an unbounded animation loop. Keep semantic content available independently of effects.
- Reserve the installed GSAP dependency for coordinated timelines, path motion, interruption, reversal, drag behavior, or ScrollTrigger. Keep simple component transitions in CSS/library transitions; installation alone is not a reason to replace ordinary fades or hover feedback.
- For GSAP sequences, use one named `gsap.timeline()` with shared defaults and labels/position parameters. Store the timeline when it must be paused, reversed, seeked, or skipped; do not scatter independent `delay` values across a state machine.
- In Vue, create animations after `onMounted`, scope `gsap.context()` to the actual root element (`root.value`), and call `context.revert()` on unmount. `gsap.matchMedia()` owns its responsive/reduced-motion contexts; scope it to the root and call `mm.revert()` during teardown. Register later event-created animations with the owning context and explicitly remove DOM listeners, observers, timers, and custom ticker callbacks.
- Use `gsap.matchMedia()` for desktop/mobile differences and `(prefers-reduced-motion: reduce)`. Reduced motion must skip or collapse decorative motion while keeping content, focus, and actions available immediately.
- Use transform aliases (`x`, `y`, `scale`, `rotation`, `xPercent`) and opacity for motion. Use `autoAlpha` only when `visibility: hidden` is appropriate; never hide an action that must remain keyboard accessible. Bound SVG stroke reveals because they can require repainting. Avoid animating `top`, `left`, `width`, or `height` when transforms can express the same movement.
- Use `gsap.quickTo()` to reuse a tween for smoothed high-frequency values, or `gsap.quickSetter()` for immediate updates without a tween. Bound decorative elements and reuse their animations; do not allocate timelines or animation loops on every event or frame.
- Register plugins once before use. Put ScrollTrigger on a top-level tween/timeline, create triggers in document order, refresh after dynamic layout changes, and kill/revert them on route or component teardown. Do not hijack native wheel/touch scrolling, and remove development markers before production.
- Pause or reduce decorative timelines when the document is hidden or the scene is offscreen. A visibility observer and a single bounded scheduler are preferred over independent loops. Animation must never delay navigation, login, keyboard focus, or status feedback.
- New GSAP work must be reviewed in the relevant development preview in both themes, desktop/mobile, keyboard, and reduced-motion states before it is integrated into a product route. Record any new dependency and its license in the normal dependency review.
- Before building complex motion, read docs/GSAP_MOTION_GUIDE.md and the relevant official `gsap-*` Skills installed under the user's Codex skills directory; the guide also links upstream sources for other environments. Define action order, easing, overlap, interruption, and the final usable state before animating. Vue owns interaction state and PrimeVue owns focus; GSAP controls visual progress only. Give each animated property one owner and keep finite intros separate from ambient loops.
- Do not add component names, implementation explanations, interaction tutorials, or decorative explanatory labels to product controls, tags, or page copy. Keep only concise task labels, necessary validation/status, accessibility names, and a compact sample/availability marker where needed. Put design rationale in English documentation.
- Keep the component catalog equally concise: control names and states are enough; do not add paragraphs explaining library internals or how animations work.

## Change impact and regression prevention
- Before adding or modifying a feature, inspect the related implementation, callers, shared components, API contracts, configuration, state ownership, and existing tests. Identify affected neighboring features and invariants before editing.
- Review changes across the full affected execution path, including shared utilities and error paths. Do not assume that a locally correct function or a passing build proves that dependent features still work.
- For behavior changes, add or update meaningful regression tests for the changed behavior and affected existing flows. Exercise relevant failure cases and boundary conditions; include concurrency, cancellation, retries, and tenant isolation when the change touches them.
- Run the relevant existing test suites as well as new tests. Resolve regressions caused by the change before delivery; do not disable tests, weaken assertions, or hide errors to obtain a passing result.
- Before an authorized commit, inspect the complete staged diff and related code, confirm that the staged changes match the reviewed scope, and run required checks against the final code. Revalidate affected checks after subsequent edits. Summarize completed validation and any external blockers without claiming unverified behavior.

## Validation and delivery
- Rust: cargo fmt --all -- --check; cargo clippy --workspace --all-targets -- -D warnings; cargo test --workspace.
- Frontend: pnpm --dir web build. Add meaningful component or browser tests for new interactions.
- Protocol changes require redacted contract fixtures. Retries, cancellation, concurrency, and billing require failure-case tests.
- Review desktop/mobile and light/dark rendering for UI changes. A successful build is not visual validation.
- Inspect diffs, secret exposure, dependency licenses, and lockfiles before delivery.
- Preserve attribution when importing external code; do not copy another project's code without checking its license.
- Report actual changes, completed checks, and remaining limitations. Never claim tests or captures that were not run.

## Repository, release, and deployment layout
- Keep Dockerfile, its ignore file, Compose files, Caddy configuration, and deployment environment examples under deploy/.
- Keep test suites under tests/ and historical research under reports/.
- Archived source attachments retain their original language and hashes; maintained documentation is English.
- Historical sub2api reports are evidence, not authoritative requirements for the new Rust implementation.
- VERSION, Rust workspace/local lock entries, and web/package.json must agree.
- Only version-tag pushes may publish distribution archives, GHCR images, or GitHub Releases.
- Releases must pass version validation, reusable CI, and reusable security checks at the tagged revision.
- Do not add workflow_dispatch publication, pull_request_target execution of untrusted code, or continue-on-error to release gates.
- Do not modify published version tags. Add a new version for released fixes.
- Preserve non-root containers, limited permissions, health checks, and localhost deployment defaults.

## Stateful deployment and migrations
- Keep PostgreSQL and Redis in independent containers with persistent volumes. Application releases replace only the gateway container, which includes frontend assets. Never bundle database processes into it.
- Version PostgreSQL schemas with SQLx migrations. Never edit applied SQL, bypass checksum verification, or automatically downgrade after startup failure.
- Every schema change requires reviewed upgrade/recovery behavior, a backup plan, and real-database integration tests. Mark irreversible changes explicitly; never promise a lossless rollback that SQL cannot deliver.
- Keep infrastructure image versions independent of the app version. Do not delete volumes or flush Redis during application updates. Review key schema changes and active leases before changing Redis formats.

- Keep Caddy as the independent ingress service; do not reintroduce Nginx or couple proxy/database image updates to application releases.
