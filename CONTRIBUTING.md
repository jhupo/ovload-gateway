# Contributing

Read [Development Standards](docs/DEVELOPMENT.md) and [Architecture](docs/ARCHITECTURE.md).
Open an issue before proposing substantial API or architecture changes.
Use focused pull requests with the problem, resulting behavior, relevant tests,
and migration implications. Preserve unrelated changes.

## Checks
Run the commands in docs/DEVELOPMENT.md, including version validation,
Rust lint/tests, frontend lint/build, and browser tests.
Add redacted contract fixtures for provider behavior changes.
Never include live account credentials or copyrighted private conversation payloads.

## Versions
VERSION is the release source of truth. See docs/RELEASING.md.
Do not bump versions for every contribution; prepare a version explicitly for release.

## Licensing
Contributions must be distributable under LGPL-3.0-only.
You must have the right to contribute the work. Preserve third-party attribution.
No contributor license agreement is required by this scaffold.
