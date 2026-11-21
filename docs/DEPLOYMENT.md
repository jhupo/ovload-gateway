# Docker Deployment

The Compose application consists of one Rust gateway serving the API and frontend,
PostgreSQL, and Redis. The gateway publishes its HTTP port directly on the host;
Caddy, when used for a custom domain and TLS, runs as a host service rather than a
Compose container. The gateway uses `serve`, applies SQLx migrations during store
startup, and exposes `/healthz`.
There is no separate worker or migration command.

Run builds, dependency installation, and application tests on the remote test
server as required by [the project workflow](../AGENTS.md). The commands below
run on a Linux Docker host with Docker Compose and BuildKit. Keep the source in
`/opt/ovload-gateway/source`; keep private configuration and the Compose environment
outside the source directory.

## Initial Configuration

From the source directory, initialize a new installation as root:

```sh
python3 scripts/initialize_docker.py \
  --directory /opt/ovload-gateway/private \
  --public-origin https://gateway.ovload.com \
  --owner-login admin
```

The initializer generates private `config.yaml`, a persistent 32-byte provider
credential key, PostgreSQL and Redis passwords, Redis configuration, and an
initial owner password. It refuses to replace existing private files. Preserve
the provider credential key together with database backups: encrypted provider
credentials cannot be recovered without it.

The private directory is accessible to gateway UID 10001. Gateway configuration,
key, and owner password files are owned by UID 10001 with mode `0400`; PostgreSQL
and Redis secret files are owned by UID 999 with mode `0400`. Do not put passwords
in image build arguments, database URLs, source control, or deployment logs.

Copy `deploy/.env.example` to `/opt/ovload-gateway/deploy.env` and configure:

```dotenv
OVLOAD_IMAGE=ovload-gateway:local
OVLOAD_BIND=0.0.0.0
OVLOAD_PORT=51771
OVLOAD_PUBLIC_HOST=47.96.235.250
OVLOAD_PUBLIC_ORIGIN=https://gateway.example.com
OVLOAD_CONFIG_DIRECTORY=/opt/ovload-gateway/private
OVLOAD_CARGO_PROFILE=dev
OVLOAD_BUILD_JOBS=1
OVLOAD_RUN_BACKEND_TESTS=true
OVLOAD_REVISION=<source-commit>
OVLOAD_BUILD_TIME=<UTC-build-time>
```

Keep the infrastructure image versions from the example unless deliberately
upgrading them. Set `OVLOAD_BUILD_PROXY` only when the build needs a network proxy;
the standard proxy arguments apply to build steps and are not runtime settings.
The gateway is intentionally bound to `0.0.0.0` so Cloudflare Tunnel and other
approved ingress can reach it directly. The host firewall and any upstream NAT
must allow the selected public port.

The application reads `/app/deploy/config.yaml`, using the schema in
[`deploy/config.example.yaml`](../deploy/config.example.yaml). The generated
database and Redis URLs use Compose service names and separate password fields.
`OVLOAD_PUBLIC_ORIGIN` overrides `api.identity_public_origin` at runtime. Set it
to the exact external HTTPS origin, including a non-default port. This keeps the
canonical browser origin out of the image and lets a domain or IP change be
handled by editing `deploy.env` and recreating only the gateway container.

## Build And Bootstrap

Validate and build from `/opt/ovload-gateway/source`:

```sh
docker compose --env-file /opt/ovload-gateway/deploy.env \
  -f deploy/compose.yml -f deploy/compose.build.yml config --quiet
docker compose --env-file /opt/ovload-gateway/deploy.env \
  -f deploy/compose.yml -f deploy/compose.build.yml build gateway
```

The image builds the frontend and Rust binary on the server. Cargo object files
use a BuildKit tmpfs and do not consume a persistent image layer. Ensure sufficient
RAM; the 32 GB test server uses the stripped `dev` profile with one build job.
`OVLOAD_RUN_BACKEND_TESTS=true` also runs the explicitly selected gateway
`bootstrap::` regression tests before building the binary.

Start the data services and gateway:

```sh
docker compose --env-file /opt/ovload-gateway/deploy.env \
  -f deploy/compose.yml up -d --wait postgres redis
docker compose --env-file /opt/ovload-gateway/deploy.env \
  -f deploy/compose.yml run --rm --no-deps gateway \
  identity bootstrap-owner admin --password-file /app/deploy/owner-password
docker compose --env-file /opt/ovload-gateway/deploy.env \
  -f deploy/compose.yml up -d --wait gateway
```

The first management administrator is a database identity created by
`identity bootstrap-owner`, not automatically created or reset by an environment
variable. Bootstrap succeeds only when no management principals exist. Changing
the legacy `admin.default_username` or `admin.default_password` configuration does
not reset an existing management account. Use the generated private
`owner-password` through a secure administrative channel for the first login.

## HTTPS And Verification

When Caddy is not used, the gateway's published port is plain HTTP and should be
placed behind Cloudflare Tunnel or another TLS-terminating ingress. For direct
local verification:

```sh
docker compose --env-file /opt/ovload-gateway/deploy.env \
  -f deploy/compose.yml ps
curl --fail http://127.0.0.1:51771/healthz
```

For host Caddy, install Caddy with the operating system package, copy
`deploy/Caddyfile` to `/etc/caddy/Caddyfile`, and run `systemctl enable --now caddy`.
The supplied file serves HTTP on port 80 and proxies to `127.0.0.1:51771`; TLS is
terminated by Cloudflare or another external ingress. Do not add Caddy back to
Compose. Cloudflare Tunnel may instead target `http://127.0.0.1:51771` directly.

Verify that the frontend loads, the owner can sign in, and authenticated
management requests succeed. Check service health and affected workflows after
each update; successful compilation alone does not verify deployment or provider
connectivity.

## State And Updates

PostgreSQL, Redis, and gateway runtime data use separate persistent volumes. Keep
the private host configuration and credential key when replacing the gateway image.

Build a new image, retain the previous image tag or digest, and replace the
gateway with `docker compose ... up -d --no-deps --wait gateway`. Restarting the
single gateway can interrupt
active requests. Review schema changes and take database and credential-key
backups before an update; replacing the application image does not roll back
database migrations. See [Database](DATABASE.md).

Do not use `docker compose down -v` for an update, flush Redis, or prune unrelated
services and volumes. The gateway never receives the Docker socket. Image-based
updates use the host's Compose workflow; the container disables application
self-restart.

This source-build deployment does not establish signed release publication or
acceptance of the separate online update and rollback flow. See
[Releasing](RELEASING.md) for those requirements.
