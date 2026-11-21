# Documentation maintenance

Documentation must help a reader change or operate the current project without
confusing a target capability with an executable one. Keep project documents in
English. User-facing conversation and product translations follow their own
language requirements.

## Choose one owner

Use the [documentation index](README.md) to find the contract being changed.
Update the owning document and affected references together. Avoid copying the
same pricing rule, layout dimensions, permission policy, or release procedure
into several guides. Link to its authority and keep only the context needed by
the reader. In particular:

- [Backend structure](BACKEND_STRUCTURE.md) owns the package graph;
  [backend development](BACKEND_DEVELOPMENT.md) explains implementation practice.
- [API](API.md) owns the current HTTP surface. Product API documents describe
  accepted targets until the implementation and callers establish those flows.
- [Frontend design](FRONTEND_DESIGN.md) owns React/shadcn-admin design guidance.
  Component code remains the authority for actual behavior.
- [Billing](BILLING_AND_PRICING_DESIGN.md), [database](DATABASE.md), and
  [release rules](RELEASING.md) own their respective financial and recovery rules.

Read the relevant source, callers, configuration, and tests before claiming
behavior. Use real package names, routes, commands, and paths from this workspace.
Describe missing integration explicitly; a retained scaffold or backend page
declaration does not prove a working deployment or frontend.

## State current behavior and targets precisely

Put implementation status near a document's beginning when its scope includes
unimplemented work. Separate current behavior from a target sequence or interface.
Remove superseded current-state claims rather than adding a notice that leaves
contradictory instructions active below it. Link the superseding ADR when an
accepted decision changes architecture or operational assumptions.

Keep ordinary guides focused on the resulting design and supported operations.
Use [ADRs](adr/) for decisions and rationale, [CHANGELOG.md](../CHANGELOG.md) for
release changes, and [reports](../reports/) for historical research. Do not write
session transcripts, abandoned implementation plans, or routine validation logs
into current guides. Never store secrets, cookies, real prompts, or private
conversation payloads in examples or evidence.

Use typed schemas, DTOs, and fixtures as references rather than reproducing large
copies that drift. Include examples only when they clarify a contract. Commands
must state their working directory, prerequisites, and material side effects;
do not present publication, installation, or destructive recovery as routine
read-only verification.

## Verify documentation changes

Inspect the complete changed text and diff. Check relative file links and
anchors, source/package/route references, code fences, and whitespace. Check
that status claims agree across entry points and that any new document is
discoverable from its index. Do not edit generated
application files to satisfy a documentation check.

Documentation-only edits do not require application tests, builds,
startup, or screenshots. If behavior or executable examples change as well,
validate that behavior within the user's current instructions. Report only
checks actually completed and any unresolved reference or verification limits.
