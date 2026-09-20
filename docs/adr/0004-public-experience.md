# ADR 0004: Public experience and motion

Status: accepted for implementation; visual review pending. Date: 2026-09-19.

Use Vue Router for the public home and login presentation. Preserve normal browser
history, anchors, scrolling, focus, and reduced-motion behavior. CSS transitions
own page/overlay motion; IntersectionObserver owns section reveal; one passive,
requestAnimationFrame-throttled scroll observer owns the connection illustration.
ConnectionScene is a domain illustration, not a replacement UI primitive.
LoginPanel composes PrimeVue fields and represents one shared form presentation.
The login submit remains disabled until real authentication exists. Provider
names are explicitly a roadmap; no live routing is implied by the illustration.
User/admin concepts stay in a development-only preview entry, with sample labels.
Do not ship preview business data or placeholder write endpoints in production.
Image generation is an independent design asset workflow and is not required
for deterministic connection diagrams or actual interactive controls.
