# Tests

- rust/: Rust HTTP contract tests, registered in the server Cargo manifest.
- e2e/: Playwright frontend tests using real local backend and frontend processes.
- tooling/: Python release/version tooling tests.
- fixtures/: redacted synthetic protocol fixtures only.

Run Rust tests with cargo test --locked --workspace.
Run tooling tests with python -m unittest discover -s tests/tooling -v.
Run browser tests with pnpm --dir web exec playwright install chromium,
then pnpm --dir web test:e2e.
No tests require live model credentials or production accounts.
Keep performance and provider integration suites separate as those capabilities arrive.
