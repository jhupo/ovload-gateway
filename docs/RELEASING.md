# Versioning and Releases

Current baseline: [ADR 0015](adr/0015-imported-backend-baseline.md) retains the
imported updater's release/checksum/staging/replacement/restart/rollback flow.
Project release identity, archive layout, plugin assets, and Docker/CI packaging
still require adaptation. The output and deployment sections below describe
the previous scaffold and are not a verified release path for the imported code.

## Contract
VERSION, workspace.package.version, web/package.json, and every local workspace
package entry in Cargo.lock must agree. All packages inherit the workspace
version. Tags use vX.Y.Z or vX.Y.Z-rc.1.
Use python scripts/version.py prepare 0.2.0 to update versioned manifests and
refresh local lock entries, then add a CHANGELOG section and inspect the diff.
The script does not commit, tag, push, or release.

## Events and permissions
Branches and pull requests run CI and security checks only.
Weekly and manual security scans do not publish packages.
Only a push of a version tag triggers release.yml. There is no manual publish input.
The release validates the tag and runs CI and security against the same revision.
Only release publication gets contents:write; only container publication gets
packages:write. Pull requests do not receive registry credentials.
CodeQL requires code scanning availability; enable GitHub security features.
Security failures block releases. Do not add continue-on-error to release gates.

## Outputs
- Linux x86_64 and aarch64, Windows x86_64, macOS aarch64 archives.
- Each archive contains the binary, frontend static files, version, notices, and deployment instructions.
- SHA256SUMS for all four archives.
- Multi-architecture GHCR image with provenance and SBOM attestations.
- GitHub Release with generated notes, created as a draft until asset upload succeeds.
Prereleases never update the latest container tag.
Build artifacts are uploaded only during tag release jobs; CI logs and caches are not release packages.
There is no crates.io or npm publication.

## Release procedure
1. Prepare the version and changelog.
2. Review all changes and merge through the repository's required checks.
3. With explicit authorization, create and push the matching version tag.
4. Observe version, CI, security, package, container, and publish jobs.
5. Verify archive checksums and container digests before deployment.

The accepted update contract in
[ADR 0015](adr/0015-imported-backend-baseline.md) supersedes ADR 0012's blue/green
and zero-downtime requirements. Retain artifact/checksum verification, staging,
replacement, restart, and rollback; active connections may be interrupted.
Before publication, make updater identity, binary/archive layout, plugin assets,
Docker configuration and release output agree, then verify the resulting path.
Deployment acceptance must cover startup failure, application rollback, migration
failure/recovery, and unchanged independent PostgreSQL/Redis/Caddy services and
persistent data. A binary rollback never downgrades the database. Protocol
streaming and customer billing additionally require their relevant contract and
failure evidence; packaging alone does not establish those guarantees.

Do not move or overwrite published tags. Publish a new version to fix a release.
Reruns may complete an existing draft; already-published Releases are rejected.
GitHub and GHCR are separate services: image publication is not atomic with
Release publication. If the final Release step fails, inspect the already-built
image and rerun the draft publication; do not silently replace a released version.

## Repository settings (manual setup)
Enable branch protection/rulesets, required CI/security checks, review requirements,
private vulnerability reporting, dependency graph, and Dependabot alerts.
Protect version tags from deletion and unauthorized creation.
These files do not configure server-side repository settings automatically.
The current scaffold is not a production-ready model gateway.
