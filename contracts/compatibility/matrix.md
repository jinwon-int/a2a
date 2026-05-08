# Compatibility Matrix

This matrix records the monorepo candidate baselines for external readers. Public-facing compatibility claims must not exceed the evidence here: A2A is alpha/reference implementation work until these baselines are refreshed with release-quality CI evidence.

| Component | Candidate path | External expectation | Current baseline | Required evidence before public release | Notes |
|---|---|---|---|---|---|
| Broker | `packages/broker` | Local HTTP/JSON-RPC broker for task lifecycle, worker registry, and terminal evidence experiments | `a6096882a781fb13c68ec526fee897a00724f9a0` | package build/test, public-readiness scan, contract docs review | Imported by sanitized/squash source copy; no private git history preserved. Do not claim hosted broker compatibility from this baseline alone. |
| OpenClaw plugin | `packages/openclaw-plugin-a2a` | OpenClaw adapter using placeholder local broker config only | `3c12b937f727a874174b172cf34de65d771177f2` | package build/test, OpenClaw plugin compatibility smoke | Sanitized/squash source import for R3 #14. Peer range remains private-candidate only until an exact OpenClaw release/commit is named. |
| Docker runner | `packages/docker-runner` | Trusted-operator patch runner for disposable repository work; not a general multi-tenant sandbox claim | `d223612cb027bf493b6b74e60a7bc04db1b9b6ae` | package check/test, public demo safety smoke | Sanitized/squash source import for R3 #15. Document Docker/Podman execution, GitHub auth mounts, and network modes as trusted-operator modes. |
| Shared contracts | `contracts/a2a` | Public candidate contracts for task lifecycle, worker registration, broker handoff, and terminal semantics | `r2-initial-contracts` | contract review against broker/plugin/runner behavior | Terminal Done/Block/PR semantics and ACK boundaries are public contract candidates. |
| OpenClaw core | `packages/openclaw-plugin-a2a/test/fixtures/openclaw` | Fixture-backed SDK seam only; no stable OpenClaw release support claim yet | `0.0.0-test-peer` | plugin SDK seam fixture evidence plus explicit release/commit update before any stable public claim | Public docs must distinguish fixture-backed integration experiments from stable OpenClaw core support. |

## Release rule

A public release candidate must update this table with exact source commits/tags for every imported package and link the CI run that validated the candidate commit.
