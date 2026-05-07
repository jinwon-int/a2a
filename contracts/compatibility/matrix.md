# Compatibility Matrix

This matrix records the private monorepo candidate baselines. Public-facing compatibility claims must not exceed the evidence here.

| Component | Source | Candidate path | Current baseline | Required evidence before public release | Notes |
|---|---|---|---|---|---|
| Broker | `jinwon-int/a2a-broker` | `packages/broker` | `a6096882a781fb13c68ec526fee897a00724f9a0` | package build/test, public-readiness scan, contract docs review | Imported by sanitized/squash copy; no private git history preserved. |
| OpenClaw plugin | `jinwon-int/openclaw-plugin-a2a` | `packages/openclaw-plugin-a2a` | `3c12b937f727a874174b172cf34de65d771177f2` | package build/test, OpenClaw plugin compatibility smoke | Sanitized/squash import for R3 #14. Peer range remains private-candidate only until an exact OpenClaw release/commit is named. |
| Docker runner | `jinwon-int/a2a-docker-runner` | `packages/docker-runner` | pending import | package check/test, public demo safety smoke | Document `network: host` and GitHub auth mounts as trusted-operator modes. |
| Shared contracts | monorepo | `contracts/a2a` | initial R2 skeleton | contract review against broker/plugin/runner behavior | Terminal Done/Block/PR semantics and ACK boundaries are public contract candidates. |
| OpenClaw core | upstream | external | pending decision | supported OpenClaw release/commit and plugin SDK seam evidence | Public docs must distinguish core support from private integration experiments. |

## Release rule

A public release candidate must update this table with exact source commits/tags for every imported package and link the CI run that validated the candidate commit.
