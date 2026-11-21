# Contributing

Start with the [documentation index](docs/README.md).
Trace the affected flow and read its domain contract before changing it. The
imported Rust backend and React/shadcn-admin frontend have separate owners;
preserve their boundaries and distinguish executable behavior from target
product contracts. Keep documentation in English.

Complete the requested behavior and its callers without compatibility aliases,
duplicate paths, or required follow-up TODOs. Preserve unrelated work. Record
architectural boundary decisions in the relevant ADR and update affected API,
schema, frontend, or operational contracts with the implementation.

Use focused contributions describing the concrete problem, resulting behavior,
relevant validation, and migration implications. A review request is read-only
unless fixes are requested. Local development does not imply opening an issue,
committing, pushing, creating a PR, posting comments, or publishing a release.
Honor existing user authorization without requesting it again.

## Checks
Use the applicable commands in [Development](docs/DEVELOPMENT.md) and report
exactly what completed. Cover changed behavior and relevant failure boundaries;
financial, concurrency, protocol, and migration changes need their corresponding
integration evidence. Do not weaken assertions to obtain a passing result.
Respect an explicit user instruction to skip or stop tests and state the gap.

Documentation-only contributions need link/reference and diff checks.
Do not require application startup or screenshots for documentation edits.
Never include credentials, cookies, tokens, real prompts, or private conversation
payloads. Inspect the full staged scope before an authorized commit.

## Versions
`VERSION` is the release source of truth. See [Releasing](docs/RELEASING.md).
Do not bump versions for every contribution; prepare a version explicitly for release.
Imported updater and project packaging contracts still require adaptation;
existing scaffold assets do not prove a working Ovload release.

## Licensing
Retain the applicable license of the component being changed. The root project
uses LGPL-3.0-only, the imported backend retains
[Apache-2.0](src/LICENSE-APACHE), and the shadcn-admin baseline retains
[its MIT license](web/LICENSE). Dependencies retain their own
terms. Preserve [third-party attribution](THIRD_PARTY_NOTICES.md) and license
files; do not relabel third-party code. Contribute only work you have the right
to distribute. No contributor license agreement is required.
