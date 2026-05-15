# A2A Plane Compatibility Matrix

This matrix records A2A Plane monorepo candidate baselines. Public-facing compatibility claims must not exceed the evidence here. OpenClaw entries describe the first/reference integration only; they are not a claim that A2A Plane is an OpenClaw-only project.

| Component | Source | Candidate path | Current baseline | Required evidence before public release | Notes |
|---|---|---|---|---|---|
| Broker | `jinwon-int/a2a-broker` | `packages/broker` | `a6096882a781fb13c68ec526fee897a00724f9a0` | package build/test, public-readiness scan, contract docs review | A2A Plane broker service imported by sanitized/squash copy; no private git history preserved. |
| OpenClaw plugin | `jinwon-int/openclaw-plugin-a2a` | `packages/openclaw-plugin-a2a` | `3c12b937f727a874174b172cf34de65d771177f2` | package build/test, OpenClaw plugin compatibility smoke | First/reference integration imported by sanitized/squash copy for R3 #14. Peer range remains private-candidate only until an exact OpenClaw release/commit is named. |
| Docker runner | `jinwon-int/a2a-docker-runner` | `packages/docker-runner` | `d223612cb027bf493b6b74e60a7bc04db1b9b6ae` | package check/test, public demo safety smoke | Sanitized/squash import for R3 #15. Document Docker/Podman execution, GitHub auth mounts, and network modes as trusted-operator modes. |
| Shared contracts | monorepo | `contracts/a2a` | `r2-initial-contracts` | contract review against broker/plugin/runner behavior | A2A Plane terminal Done/Block/PR semantics and ACK boundaries are public contract candidates. |
| OpenClaw core | upstream fixture | `packages/openclaw-plugin-a2a/test/fixtures/openclaw` | `0.0.0-test-peer` | plugin SDK seam fixture evidence plus explicit release/commit update before any stable public claim | Public docs must distinguish fixture-backed private integration experiments from stable OpenClaw core support. |

## Release rule

## Versioning strategy

Each package in the monorepo follows an independent semver release train:

| Package | npm name | Release tag prefix | Current version |
|---|---|---|---|
| Broker | `a2a-broker` | `broker-v` | `0.1.0` (private) |
| Docker runner | `@openclaw/a2a-docker-runner` | `docker-runner-v` | `0.1.0` (public) |
| OpenClaw plugin | `openclaw-plugin-a2a` | `plugin-v` | `0.1.0` (private) |
| Shared contracts | (monorepo root) | `r23`, `r24`, … | Milestone tag |

Breaking changes within `0.x` do not require a major version bump, but the matrix
row must be updated to the new baseline when a known break occurs. Before any
package declares `1.0.0`, the compatible OpenClaw peer release must be resolved
and linked here.

## Release rule

A public release candidate must update this table with exact source commits/tags for every imported package and link the CI run that validated the candidate commit. Release notes and external docs must introduce the project as A2A Plane and keep OpenClaw framed as the reference integration unless broader integrations have their own evidence rows.
