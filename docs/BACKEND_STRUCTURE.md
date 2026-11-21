# Backend structure

The backend is a modular monolith imported from codex-proxy-rs and integrated into
one virtual Cargo workspace. The gateway executable is `ovload-gateway`.
Library crates are compile-time ownership boundaries, not separate processes.
[ADR 0015](adr/0015-imported-backend-baseline.md) records the baseline and gaps.

## Source tree

```text
Cargo.toml                         # the only workspace manifest
Cargo.lock                         # dependency resolution for all members
rust-toolchain.toml                # Rust 1.99.1
src/
  apps/
    Cargo.toml                     # gateway package and composition root
    src/bootstrap/                 # configuration and Bundle assembly
    tests/                         # composition and architecture contracts
  crates/
    core/                          # portable contracts and request execution
    admin/                         # control-plane models, use cases, ports
    api/                           # HTTP, WS, SSE, auth, static frontend
    host/                          # process, network, workers, updates
    protocol/                      # pure OpenAI wire/SSE codecs
    store/                         # PostgreSQL, Redis, backup adapters
    providers/
      openai/                      # separate Codex and standard Responses products
      xai/                         # imported Grok Build provider contract
    plugin/
      runtime/                     # plugin execution and capability binding
      sdk/                         # plugin ABI/client contracts
      cli/                         # existing plugin packaging executable
  migrations/                      # immutable SQLx history and digest manifest
  LICENSE-APACHE                   # imported backend license
tests/                             # shared frontend, deployment, tooling tests
deploy/                            # deployment assets; adaptation is separate
```

## Dependency direction

- Core and protocol have no production dependency on another workspace crate.
- Admin depends on core.
- API depends on admin, core, and protocol; it cannot import concrete stores,
  providers, Host networking, or SQL/Redis clients.
- Store and Host independently implement admin/core ports.
- Concrete providers depend on admin/core/protocol and receive persistence and
  execution policy through injected ports. Their outbound adapters use approved
  network libraries and account-bound egress; they import neither Host nor SQL.
- Plugin SDK is independent of the host implementation. Plugin runtime depends
  on admin/core/host/protocol/SDK; plugin CLI depends on SDK.
- The gateway application composes concrete Bundles. Libraries cannot depend
  back on the gateway application or directly import another concrete provider.

The architecture test freezes the actual internal dependency edges, public
adapter surfaces, production module discipline, and test-module mirrors. It
parses Rust imports with syn, including grouped and relative paths. It also
checks core value ownership on Windows and Unix paths.

```sh
cargo test --locked -p ovload-gateway --test main architecture::
```

## Encapsulation and product evolution

Customer identity uses the same boundaries: Admin owns identity, lifecycle,
management-security, model-key and customer-usage models/ports/services; API
translates their browser contracts; Store implements scoped PostgreSQL
transactions and atomic Redis admission. The app injects those capabilities.
Independent customer partitions do not introduce organization membership or
another runtime process. See [Identity API](IDENTITY_API.md).

Channel-group policies pass through Admin's typed model and Store facts into
Core's frozen account scope. The same model mapping filters catalogs and request
plans. Store's `provider_accounts/credential_cipher` encrypts every persisted
credential mutation and decrypts only at authorized internal reads. Bootstrap
requires the external key and completes the one-way storage cutover before
serving. Effective retail rates use the published book and the persisted group
multiplier; funds transactions freeze that multiplier independently of later
changes. These additions do not enable automatic request charging.

Retain the imported `Provider`, `ProviderRegistry`, execution sessions,
coordinator, cold provider streams, and Store ports. Rust structs/enums own
state and invariants; traits express actual execution, storage, or protocol
variation. Constructors inject implementations at the composition root.
Do not add forwarding interfaces or empty feature/provider directories.

`admin::SiteSettingsService` and `ProfileAvatarService` own site identity and
owner-specific images through separate narrow Store ports. Their PostgreSQL
adapters keep live session/grant checks, optimistic versions and audits in one
transaction. They share a bounded library-based image processor; HTTP modules
only translate authenticated inputs and metadata. Pure branding does not mutate
provider execution snapshots or credential generations. See
[ADR 0030](adr/0030-site-and-personal-settings.md).

The imported core `runtime` module owns runtime snapshot publication, not a
second Tokio runtime. Host owns OS lifecycle and process execution. Customer
identity and tenant-access contracts plus their PostgreSQL foundation now live
in `core`, `admin`, and `migrations`. The new identity routes use admin's
`IdentityService` and the `IdentityStore` port, with PostgreSQL as authority
for sessions, grants and customer lifecycle. `ModelKeyService` uses the
`ModelKeyStore` port for tenant-owned credential lifecycle; core's required
`ModelKeyAuthority` port verifies current ownership at execution boundaries.
Snapshots hold policy, never credential secrets or revocation authority.
Retail USD billing follows [ADR 0018](adr/0018-customer-usd-billing.md): its
pure rates, bounded usage and precharge policy are in `core::billing`; the
`admin::BillingService` uses the required `BillingStore` port for tenant balances
and audited operator credits. SQLx transactions and financial records are in
store/migrations, and strict customer/operator request translation is in API.
`RetailPriceBook` and `RetailPriceCard` validate complete immutable price
documents in Core; their digests exclude lifecycle metadata. Admin's separate
`RetailPricingService` and `RetailPricingStore` port own management orchestration.
Store's `postgres/retail_pricing/{commands,read}` adapter owns authorization,
catalog locks, sealed document hydration, atomic publication and audited replay.
API's `identity/retail_pricing` owns strict DTOs and HTTP version/idempotency
headers. Sample preview uses Core's exact rational calculator; it does not
construct verified execution bounds or mutate money. See
[ADR 0019](adr/0019-retail-price-publication.md).
The funds-only transaction boundary is defined by
[ADR 0020](adr/0020-retail-funds-transactions.md). Core's `billing::lifecycle`
owns validated commands and the required `RetailBillingPort`; Store's
`postgres/retail_billing` implements direct reservation, dispatch evidence and
completion transactions. `StoreBundle::retail_billing` exposes that internal
capability without wiring it into model execution. A dedicated supervised
worker marks expired holds for reconciliation and never releases money.
Admin's separate `BillingOperationsService`/`BillingOperationStore` and the
`postgres/billing_operations` read adapter enforce live tenant/session/grant
scope for API history. Observation queues and provider-cost budgets are not
financial mutation paths.
`core::engine::provider` defines `AccountScheduler` and the one-shot
`ScheduledProviderAttempt`. Provider schedulers retain concrete credential and
capacity leases; `AttemptCoordinator` validates account/tenant authority and
owns dispatch/retry decisions. `protocol::openai::chat` owns the pure directional
text/function-tool codec. `api::openai` applies that conversion at the existing
Responses boundary. `providers/http` is the shared HTTP upstream runtime and
explicitly registers the `openai_api`, Claude, Gemini and `xai_api` adapters;
it has no Codex provider registration. `providers/openai` remains responsible
for Codex profile/OAuth and WebSocket behavior. See
[ADR 0027](adr/0027-standard-api-and-chat-conversion.md).

Provider-cost pricing and budgets remain separate. Execution integration for
wallet reservations, subscription reservations and broader protocol coverage
remain follow-up changes. The standard API adapter records native usage without
inventing procurement prices from Codex defaults. These additions do not
activate customer charging.
