# Repository-local skills

This directory contains the agent guidance used for work in Ovload Gateway.

The `design-taste-frontend`, `find-skills`, `frontend-design`, and
`web-design-guidelines` skills are imported from the `openvetta/open-vetta`
repository. Their upstream source and license are recorded in
`THIRD_PARTY_NOTICES.md`; the Apache-2.0 terms are retained in
`OPEN_VETTA_LICENSE.txt`.

GSAP guidance is installed in the developer's local Codex skills directory. Read
`AGENTS.md` and `docs/GSAP_MOTION_GUIDE.md` before changing production motion;
the runtime dependency remains the version pinned in `web/package.json` and
`web/pnpm-lock.yaml`.
