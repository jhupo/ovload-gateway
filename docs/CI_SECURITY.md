# CI and Security Checks

## Required checks
- Repository: version consistency, release tooling tests, archived report hashes, workflow syntax.
- Rust: formatting, Clippy with warnings denied, and HTTP contracts on Linux, Windows, macOS.
- Web: ESLint, TypeScript/build, Chromium desktop/mobile tests against real local services.
- Docker: build the single application image, start PostgreSQL/Redis/Compose, check readiness/UI, verify gateway-only replacement, scan the image, then remove containers.
- Security: cargo-audit, pnpm audit (high/critical), Gitleaks history scan, CodeQL for JavaScript/TypeScript.

CodeQL is not presented as a Rust semantic scanner. Rust is covered by Clippy,
tests, dependency auditing, and review.
CI builds and caches dependencies but publishes no distribution archives,
registry images, or Releases. Only tag release jobs upload packaging artifacts.
Scheduled scans detect new advisories even when source has not changed.

## Release gate
release.yml calls CI and Security as reusable workflows at the tag revision.
Version validation happens first. Packages and images require passing gates.
A failed gate stops publication. Scanner failures are not silently ignored.
Scanning historical reports may find false positives; investigate them rather
than excluding the reports directory wholesale.

## GitHub setup
Enable Actions, code scanning, the dependency graph, Dependabot alerts, and private
vulnerability reporting. Use rulesets to require checks/reviews and protect tags.
Package write permission is limited to the release image jobs.
Workflow files cannot enforce repository settings before an administrator enables them.

## Limitations
These checks do not prove application security or protocol correctness.
No production traffic is used in CI. No container restart, deployment, or automatic
update of a live installation is performed by release jobs.

The storage job executes real PostgreSQL upgrade/revert and migration-history tests.
