# ADR 0003: Caddy ingress and material-inspired review surfaces

Status: accepted. Date: 2026-09-19.

Caddy is an independent ingress container in front of the bundled application.
Only Caddy publishes a port; PostgreSQL and Redis retain their isolated data network.
Frontend assets remain in the versioned gateway image, so application updates still
replace only gateway. Caddy has no application retry policy and flushes streams
immediately. The local evaluation configuration uses HTTP on localhost, disables
the admin endpoint, and runs non-root with read-only configuration. Production TLS
requires a domain, certificate persistence, and explicit port configuration; it is
not claimed by this local HTTP setup. No Nginx configuration is retained.

The component lab adopts translucent surfaces, layered shadows, backdrop blur,
PrimeVue ripple feedback, and emphasized easing inspired by Material 3. This is a
custom visual theme over existing accessible library behavior, not a second widget
implementation or a claim of exact Material 3 compliance. No source or artwork from
the reference site is copied. New visual patterns remain in the lab pending review.
