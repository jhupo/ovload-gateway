# ADR 0029: Retire online permission configuration

Status: accepted. Supersedes the online principal, role, grant, approval and
registration-policy administration surfaces in ADR 0021 and ADR 0023.

The security-authentication screen retains its original settings components.
The additional permission-management and registration-policy panels and their
backend configuration APIs are removed rather than hidden behind unused routes.
There are no replacement aliases or compatibility endpoints.

Remove management `/principals`, `/roles`, `/permission-grants`,
`/permission-grant-requests` and their item/action routes, plus
GET/PATCH `/identity-policy`. Remove their exclusive commands, DTOs, services,
store methods and reauthentication helpers. Historical SQLx migrations, role
and approval records, and audit events remain unchanged. A retained historical
table is not an executable configuration capability.

Keep live management authorization, own-profile reads, current-session
permission projection and explicit offline administrator provisioning. Existing
resource APIs still require their real platform or customer-scoped permission;
ordinary customer sessions cannot enter the management namespace. The shared
`security.settings.manage` permission remains in use by gateway configuration,
pricing and other existing resource APIs.

Keep the public registration-policy read and internal transactional policy
validation used by registration and recovery. Removing its management editor
does not enable registration, deliver notification messages or bypass the
persisted policy. These workflows retain their existing capability limits.

Customer administration accepts one persistent administrative `notes` field.
Creating, editing, activating and suspending a customer require no separate
client-supplied operation reason. Their audit events retain the authenticated
operator and receive a fixed server-generated event description. Notes remain
customer metadata and never substitute for an audit description. Financial
credit notes and other independently defined mutation contracts are unchanged.

The user directory keeps the shared pagination component mounted while loading
or failing. Navigation is disabled until a valid directory response is ready;
the server remains the authority for the exact row count and page bounds.
