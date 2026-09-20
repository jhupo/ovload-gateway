# Docker Deployment

Status: infrastructure scaffold. Model forwarding and management authentication
are not implemented. Evaluate on localhost; do not expose it as a production gateway.

## Topology
One `gateway` image contains Rust and compiled frontend assets. A separate Caddy
container publishes the HTTP entrypoint and proxies to gateway. PostgreSQL and Redis
are separate containers with separate persistent named volumes. Neither database
publishes a host port. An internal data network isolates them; gateway and Caddy join the edge network. Redis uses AOF and noeviction; this protects future leases
from silent eviction. PostgreSQL initialization uses the official entrypoint, which
starts as root to prepare volume ownership and drops to its database user.
The application, Caddy, and Redis run non-root with read-only root filesystems, dropped
capabilities, and no-new-privileges. All services have bounded logs and health checks.

## Start
From deploy/, copy `.env.example` to `.env`, set a strong random hexadecimal
POSTGRES_PASSWORD, and select a published OVLOAD_VERSION without the v prefix.
The password must be URL-safe because it is part of DATABASE_URL. Never commit .env.
Changing this variable does not rotate the password in an already initialized database.

```sh
docker compose config --quiet
docker compose pull
docker compose up -d --wait
curl --fail http://127.0.0.1:8080/readyz
```

Open http://127.0.0.1:8080. Migrations run before serving requests. Infrastructure
versions are pinned separately from OVLOAD_VERSION. For local builds set the latter
to dev and run `docker compose -f compose.yml -f compose.build.yml up -d --build --wait`.
No local command publishes images. Only version tags publish GHCR and Releases.

## Update only the application
Read release notes and follow [database backup and recovery](DATABASE.md) first.
Record the current image digest/schema version, stop gateway, and take a verified
backup. Update only OVLOAD_VERSION in .env, then:

```sh
docker compose pull gateway
docker compose up -d --no-deps --wait gateway
curl --fail http://127.0.0.1:8080/readyz
```

This replaces the frontend and backend together without recreating PostgreSQL or
Redis. Database migrations can still change the schema, so container independence
does not remove the backup requirement. Infrastructure upgrades are separate.
The scaffold provides this operator-driven procedure, not an in-app online updater.

## Rollback and operations
Follow DATABASE.md: stop writers, revert reviewed migrations with the new image or
restore a tested backup, then select the previous app version and recreate gateway.
Do not automatically downgrade on startup failure. Never run `down -v` for updates.
`docker compose down` preserves named volumes; `logs --tail=100` shows diagnostics.
/healthz reports process liveness; /readyz checks PostgreSQL and Redis. A failed
healthcheck does not itself restart a container. SIGTERM drains HTTP connections.
Public deployments need TLS termination and implemented authentication first.

## Native archives
Archives contain the binary and web/ assets. Set OVLOAD_WEB_DIR to the extracted
web/ path plus DATABASE_URL and REDIS_URL, then run `ovload-gateway serve`.
The explicit loopback-only `preview` command serves health for frontend development.
Linux native packages require Ubuntu 24.04-compatible glibc; containers use Debian.
The macOS archive targets Apple Silicon. Retain LICENSE, COPYING, and attribution.

All Docker configuration lives under deploy/. Build context is the repository root.

## Caddy ingress
`deploy/Caddyfile` is the only reverse-proxy configuration. Caddy forwards to
gateway:8080; only its localhost-bound port is published. Its image version is
independent of OVLOAD_VERSION, so replacing gateway does not recreate Caddy.
The admin endpoint is disabled. Streaming responses flush immediately and no
proxy-level retries are added. Protocol-specific gateway support still requires
its own implementation and tests.

The provided Caddyfile deliberately serves HTTP for local evaluation. It does not
provision certificates. For production, configure the real domain, HTTP/HTTPS host
ports, persistent writable certificate storage, and TLS before exposing the site.
The current /data and /config mounts are temporary because this profile has no TLS
state. Do not use temporary certificate storage for a production HTTPS deployment.
