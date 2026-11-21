# ADR 0030: Site identity and personal image settings

Status: accepted.

Implement the existing basic site-identity fields and personal avatar capability
without enabling unavailable commerce, mail,
OAuth, registration-policy or legal-consent controls. Customer display-name
editing and both audiences' password changes retain their existing owners.
ADR 0029's retired permission and policy editors stay retired.

`admin::SiteSettingsService` owns the site's name, subtitle, support text,
public API endpoint and managed logo. These values have a dedicated PostgreSQL
singleton and revision, independent of provider runtime snapshots. Endpoint
validation uses a URL parser; the server never fetches submitted URLs.
Management reads and writes require a current platform
`security.settings.manage` grant. Writes lock the live owner, session and grant
before the settings row, compare the submitted revision, and append an audit
event in the same transaction. Conflicting writes return 409 without mutation.
The public read contains only explicitly public site-identity fields.

`admin::ProfileAvatarService` owns avatars for the authenticated customer or
management principal. Neither API accepts an owner ID. Each owner has one
independent avatar revision, including an absent image. A separate revision
avoids changing management credential generations and invalidating a session
after an ordinary profile-image edit. Reads and writes validate the current
session under owner/session locks. Changes record the actual actor and session;
no image bytes or personal field content enter the audit payload.

Both services use the same bounded image processor and `ImageAsset` value.
Accept site-logo PNG/JPEG bodies up to 300 KiB and avatar PNG/JPEG/WebP bodies
up to 2 MiB, validate actual format, decode under dimension/allocation limits
and re-encode a static PNG of at most 256 pixels per side and 300 KiB. Only
PNG/JPEG/WebP codecs are enabled. Four blocking permits bound processing;
capacity exhaustion rejects rather than queues. SVG and arbitrary image URLs
are not accepted. Images are stored transactionally in PostgreSQL, so backups
and recovery include them without a second filesystem source of truth.

WebP is static only. Before metadata or pixel decoding, the RIFF library reads
the bounded container structure; every chunk must fit the supplied body, and
the embedded VP8/VP8L dimensions must match the outer canvas and decode limits.
Animated containers and duplicate critical chunks are rejected. This preflight
is necessary because the current image decoder's allocation limits alone do
not bound forged EXIF lengths or mismatched inner WebP frame dimensions.

Canonical routes use the existing `/api/v1` and `/api/admin/v1` namespaces.
Site settings use `/site-settings` and `/site-settings/logo`; personal avatars
use `/profile/avatar` and `/profile/avatar/image`. Metadata contains managed
image URLs, never binary data or caller-supplied URLs. Mutations require strict
Origin, CSRF and quoted numeric `If-Match` headers. Private image responses use
`no-store`; public logos also use `no-store` so deletion cannot leave a stale
public cache. All images are served as `image/png` with `nosniff`.

Registration defaults and registration gifts are excluded: limits already have
a transactional policy owner and gifts require a financial ledger contract.
Mail delivery, provider login and versioned legal acceptance require complete
workflows before their settings can be enabled. Persisting switches alone does
not implement those workflows. The authorized website-settings frontend
integration edits the four site-identity fields and managed logo using their
shared revision. Text and logo use separate requests; the editor advances its
baseline after each confirmed write and preserves unsaved changes on a partial
failure. Conflicts or uncertain outcomes require explicit reload before another
save. Personal avatar frontend integration remains a separate change.
