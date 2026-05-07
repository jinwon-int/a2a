# A2A Monorepo Candidate

Private consolidation workspace for the A2A broker, OpenClaw plugin, Docker runner, shared contracts, docs, and examples.

> Status: private/public-readiness candidate. Do not make this repository public until the public-readiness gates in `docs/public-readiness.md` are closed and operator approval explicitly names the visibility change.

## Intended layout

```text
packages/broker/                 # imported from jinwon-int/a2a-broker
packages/openclaw-plugin-a2a/    # imported from jinwon-int/openclaw-plugin-a2a
packages/docker-runner/          # imported from jinwon-int/a2a-docker-runner
contracts/a2a/                   # shared protocol/schema/contracts
contracts/compatibility/         # version compatibility matrix
examples/                        # public-safe demos only
docs/                            # public docs, migration notes, release gates
.github/workflows/               # integrated CI gates
```

## Import policy

Default import mode is **sanitized/squash import**, not full private history preservation.

Existing source repositories remain private rollback/source-of-truth references until the monorepo candidate is validated:

- `jinwon-int/a2a-broker`
- `jinwon-int/openclaw-plugin-a2a`
- `jinwon-int/a2a-docker-runner`

## Safety boundary

No production deploy, Gateway restart, live provider send, production DB mutation, secret rotation, or public visibility change is authorized by this scaffold.
