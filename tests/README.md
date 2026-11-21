# Tests

Rust suites live beside their packages:

- src/apps/tests: composition, CLI, configuration, and workspace architecture.
- src/crates/*/tests: domain, adapter, storage, and lifecycle contracts.
- src/crates/providers/*/tests: synthetic provider protocol fixtures.
- src/crates/plugin/*/tests: SDK, runtime, packaging, and subprocess contracts.
- tests/tooling: repository/version/release tooling.
- tests/e2e and tests/deploy: existing browser/deployment suites requiring
  adaptation where they reference the replaced backend's commands or routes.

Run:

```sh
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo test --locked -p ovload-gateway --test main architecture::
python -m unittest discover -s tests/tooling -p test_version.py -v
```

Real Store tests use CPR_TEST_DATABASE_URL and CPR_TEST_REDIS_URL. Plugin tests
can use CPR_PLUGIN_TEST_DATABASE_URL and CPR_PLUGIN_TEST_REDIS_URL.
Use isolated disposable services. Missing service configuration may return early
locally and fails explicitly in CI; offline success is not an integration pass.
Tests must not require production provider credentials.

The previous root Rust suites and OVLOAD_TEST variables describe the removed
implementation. Customer USD reservation, settlement, tenant isolation, and
commerce need relevant new tests when introduced.
