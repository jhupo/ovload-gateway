# Project Workflow

## Build, Test, And Deployment

- The user requires compilation, dependency installation, application tests, and
  Docker builds to run on the remote test server, not this local workstation.
- Default SSH destination: `root@47.96.235.250`, port `18422`.
- After code changes, synchronize the relevant source, build and test inside
  Docker on that server, deploy the verified application, and check its health
  and affected workflows. Do not run local Cargo builds/checks/tests, frontend
  builds, or dependency installations. Lightweight source inspection, formatting,
  JSON validation, and Git checks may run locally.
- Keep SSH passwords, application credentials, and private keys out of tracked
  files, command arguments, logs, build contexts, and Docker images. Obtain SSH
  credentials interactively or through the environment. Verify the host key;
  this workstation's pinned host keys are in `.runtime/remote-known-hosts`.
- Use an isolated Ovload directory and Docker project. Inspect available disk,
  existing containers, ports, and volumes before deployment. Preserve unrelated
  services and persistent data; do not prune their images or delete volumes.
- Existing deployment scripts may target the previous `192.168.2.150` server.
  Do not execute those scripts unchanged against the new target.
- The old blue/green Compose scaffold is superseded. Match the current single
  application process, configuration, and `/healthz` endpoint; do not assume
  worker/migrate commands or `/readyz` exist. See `docs/DEPLOYMENT.md`.
- Select regression tests explicitly. Do not import or discover every module in
  `tests/deploy`, because some files execute SSH or database operations on import.
- Report the deployed revision, test outcome, and access URL. If deployment was
  not performed, say so explicitly rather than claiming remote verification.
