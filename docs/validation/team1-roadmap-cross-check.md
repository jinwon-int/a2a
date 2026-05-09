# Team1 post-78261 merge-order cross-check

Parent: [#130](https://github.com/jinwon-int/a2a-plane/issues/130)
Child: [#134](https://github.com/jinwon-int/a2a-plane/issues/134)
Baseline: [PR #129](https://github.com/jinwon-int/a2a-plane/pull/129)
Run: `a2a-plane-post78261-next-20260509T142546Z`
Broker of record: `seoseo`
Team: `team1-seoseo`
Worker: `yukson`

This note is a validation artifact only. It does not overwrite contract, quickstart, CI, scanner, or conformance implementation lanes.

## Scope reviewed

- Contract paths: `contracts/a2a/**`, `contracts/compatibility/**`
- Quickstart paths: `README.md`, `docs/quickstart.md`, root/package workspace scripts
- CI paths: `.github/workflows/ci.yml`, `scripts/release-gate.mjs`, root `package.json`
- Validation ownership: `docs/validation/**`
- Safety wording around closed/superseded `openclaw/openclaw#78261`, provider accepted-send evidence, Terminal Brief receipt, and terminal-outbox ACK boundaries

## Cross-team findings

| Area | Status | Evidence | Follow-up gate |
| --- | --- | --- | --- |
| Stale `openclaw/openclaw#78261` wording | Pass for Team1 validation | Current direction treats `openclaw/openclaw#78261` as closed/superseded and not as an A2A Plane merge or runtime gate. Baseline PR #129 already removed the upstream-merge dependency from the roadmap language. | Keep future closeout wording anchored on A2A-owned terminal evidence, replay-safe/no-duplicate proof, scanner/readiness evidence, and explicit operator approval instead of upstream #78261 state. |
| Unsafe ACK promotion | Pass for Team1 validation | `contracts/a2a/terminal-semantics.md` keeps provider-send success separate from ACK evidence, and `contracts/a2a/task-lifecycle.md` forbids terminal-outbox ACK mutation to manufacture terminal evidence. Provider acceptance, `sent`, Telegram message IDs, and GitHub PR/Done/Block evidence remain accepted-send/non-ACK evidence only. | Reject any wording that treats provider accepted-send evidence as requester-visible receipt, operator-visible receipt, human-seen proof, terminal ACK, or terminal-outbox ACK. |
| Duplicate file overlap | Pass for this lane | This lane only updates `docs/validation/team1-roadmap-cross-check.md`; it does not edit contract, quickstart, CI, scanner, broker implementation, or Team2-owned conformance fixture paths. | If a later lane needs those owned paths, coordinate before editing so parallel Team1/Team2 PRs do not race on the same files. |
| Merge ordering | Updated recommendation | The parent issue orders accepted-send/non-ACK contract/fixtures before terminal evidence conformance, replay-safe/no-duplicate canary proof, scanner/readiness refresh, quickstart/CI updates, Team2 compatibility proof, and Libero closeout. | Merge implementation lanes in that dependency order; do not close public-readiness gates from validation notes alone. |
| Runtime/bootstrap evidence hygiene | Pass for this branch diff | This validation note does not include OpenClaw runtime/bootstrap context files, host-specific private paths, raw session dumps, or raw secrets. | Fail closed if `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, or `.openclaw/**` appear in a future branch diff or artifact evidence. |

## Merge-order recommendation

1. Merge accepted-send/non-ACK contract and fixture updates first.
2. Merge terminal evidence conformance plus no-duplicate/replay-safe canary harness work against those terms.
3. Merge scanner/readiness/governance gate refresh after terminal evidence semantics are stable.
4. Merge local quickstart and CI documentation/command updates only after deterministic local smoke commands exist.
5. Merge independent Team2 compatibility/reference-worker proof after the contract and conformance surface is stable.
6. Perform Libero cross-check and parent #130 closeout last, with explicit command evidence and operator approval where required.

## Safety confirmation

This cross-check did not perform production deploys, Gateway/broker/worker restarts, production database mutations, live provider or Telegram sends, terminal-outbox ACKs, edge-secret rotations, repository visibility changes, history rewrites, force pushes, or raw secret disclosure. It does not claim provider message-id or send-success evidence is requester-visible receipt, operator-visible receipt, human-seen proof, terminal ACK, or a bypass of A2A terminal evidence gates.
