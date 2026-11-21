# Ovload Gateway

A Rust-based, multi-provider AI gateway with explicit protocol adapters,
account scheduling, and controlled outbound transports.

## Status
The backend now uses the imported codex-proxy-rs execution framework, integrated
into one root workspace. It includes Codex/Grok Build and standard Responses API
products, Responses HTTP/WS, directional Chat Completions conversion,
executor-owned account attempts, independent customer/operator identity,
tenant model keys, wallet reads, financial transactions, live account/group/price
management, observations and plugins. Automatic retail precharge and settlement
remain disconnected from execution; subscriptions and commerce retain preview
surfaces. See [architecture](docs/ARCHITECTURE.md) and the precise
[API inventory](docs/API.md).

## Development
Requires Rust 1.99.1, Node.js 22.12+ and pnpm 10.
```sh
cargo run --locked -p ovload-gateway -- --help
pnpm --dir web install
pnpm --dir web dev
```
Serving requires deploy/config.yaml and configured PostgreSQL/Redis; see
[Development](docs/DEVELOPMENT.md). Build and test on the remote server according
to [the project workflow](AGENTS.md). [Docker deployment](docs/DEPLOYMENT.md)
provides one gateway process, PostgreSQL, Redis, and HTTPS ingress, with an
explicit first-administrator bootstrap. Restarting the gateway may interrupt
connections.

## Documentation
- [Documentation index and implementation status](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development standards](docs/DEVELOPMENT.md)
- [Backend development and abstractions](docs/BACKEND_DEVELOPMENT.md)
- [Frontend design: React/shadcn-admin](docs/FRONTEND_DESIGN.md)
- [Gateway plugin development](docs/PLUGINS.md)
- [HTTP API contracts](docs/API.md)
- [Backend runtime](docs/BACKEND_RUNTIME.md)
- [Backend module and directory design](docs/BACKEND_STRUCTURE.md)
- [Architecture decision](docs/adr/0001-rust-modular-monolith.md)

## License
LGPL-3.0-only. See [LICENSE](LICENSE) for LGPLv3 and [COPYING](COPYING)
for the incorporated GPLv3 terms.
Dependencies retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The imported Rust backend retains Apache-2.0 in [src/LICENSE-APACHE](src/LICENSE-APACHE).

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

The Docker source-build workflow is separate from signed release publication and
the online update acceptance requirements. No release is published by establishing
this source baseline. Repository rulesets must be enabled separately.
