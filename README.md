# Ovload Gateway

A Rust-based, multi-provider AI gateway with explicit protocol adapters,
account scheduling, and controlled outbound transports.

## Status
Initial scaffold: Axum health endpoint, provider capability contracts, and a
Vue/TypeScript welcome screen, component review catalog, independent PostgreSQL/Redis
containers, and SQLx schema migration commands. One app image serves frontend and backend.
Model forwarding, authentication, scheduling, billing, and provider integrations
are not implemented yet.

## Development
Requires Rust stable, Node.js 22.12+ and pnpm 10.
```sh
cargo run -p ovload-server -- preview
pnpm --dir web install
pnpm --dir web dev
```
Backend: http://127.0.0.1:8080. Vite prints the frontend URL on startup.
GET /healthz reports process health. The development server binds to localhost.
Environment variables must be set in the shell; .env is not loaded automatically.

## Documentation
- [Architecture](docs/ARCHITECTURE.md)
- [Development standards](docs/DEVELOPMENT.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Architecture decision](docs/adr/0001-rust-modular-monolith.md)
- [Agent instructions](.codex/AGENTS.md)

## License
LGPL-3.0-only. See [LICENSE](LICENSE) for LGPLv3 and [COPYING](COPYING)
for the incorporated GPLv3 terms.
Dependencies retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Tests, reports, and releases
- [Test suites](tests/README.md)
- [Historical Codex analysis](reports/README.md)
- [CI and security checks](docs/CI_SECURITY.md)
- [Versioning and tagged releases](docs/RELEASING.md)
- [Docker deployment](docs/DEPLOYMENT.md)
- [Database versioning and recovery](docs/DATABASE.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

Branches and pull requests run checks only. Version tags trigger gated native
archives, one bundled application GHCR image, and GitHub Releases. No release has been
published by adding these files. Repository rulesets must be enabled separately.
