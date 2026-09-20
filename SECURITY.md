# Security Policy

## Supported versions
The project is pre-release. Only the current default branch is maintained.
Published-version support periods will be documented before production releases.

## Reporting vulnerabilities
Use the repository's private vulnerability reporting facility when enabled:
https://github.com/jhupo/ovload-gateway/security/advisories/new
If it is unavailable, ask maintainers for a private contact without including
exploit details or secrets in a public issue.
Do not publicly disclose credentials, customer prompts, or sensitive capture files.
Include affected revision, impact, and a minimal redacted reproduction.
Do not test against third-party or production systems without authorization.

## Automated checks
CI scans Rust and frontend dependencies, Git history for secrets, and frontend
source through CodeQL. Scanners cannot establish the absence of vulnerabilities.
Release-blocking exceptions require a reviewed rationale and an expiry date.
