# Team1 roadmap cross-check

Parent: [#114](https://github.com/jinwon-int/a2a-plane/issues/114)  
Child: [#118](https://github.com/jinwon-int/a2a-plane/issues/118)  
Run: `a2a-plane-roadmap-cross-team-20260509T131000Z`  
Broker of record: `seoseo`  
Team: `team1-seoseo`  
Worker: `yukson`

This note is a validation artifact only. It does not overwrite the Contract v0, quickstart, or CI implementation lanes.

## Scope reviewed

- Contract paths: `contracts/a2a/**`, `contracts/compatibility/**`
- Quickstart paths: `README.md`, `docs/quickstart.md`, root/package workspace scripts
- CI paths: `.github/workflows/ci.yml`, `scripts/release-gate.mjs`, root `package.json`
- Safety wording around `openclaw/openclaw#78261`, Terminal Brief receipt, provider acceptance, and terminal-outbox ACK boundaries

## Cross-team findings

| Area | Status | Evidence | Follow-up gate |
| --- | --- | --- | --- |
| Contract / terminal semantics | Pass for Team1 cross-check | `contracts/a2a/task-lifecycle.md` defines terminal `done`, `pr`, and `blocked`; `contracts/a2a/terminal-semantics.md` keeps provider-send success separate from ACK evidence. | Keep Team2 conformance fixtures aligned with these terms; do not extend contract semantics from the quickstart lane without coordination. |
| Quickstart / package scripts | Needs implementation-lane follow-up | `docs/quickstart.md` documents `start:local` and `worker:echo` as desired local commands, but root `package.json` and `packages/broker/package.json` do not currently define `start:local`, `worker:echo`, or `test:smoke`. The guide safely says to stop and record a blocker when those commands are absent. | Before claiming a runnable five-minute smoke path, add or scaffold local-only commands in the quickstart lane, then report the exact smoke command result. |
| CI / validation wiring | Needs CI-lane follow-up | `.github/workflows/ci.yml` runs `npm run check` and `npm run test:release-gate`; `scripts/release-gate.mjs` covers layout, packages, runner import smoke, Terminal Brief routing guard, public-readiness scan, and compatibility baselines. It does not yet exercise a clean-checkout broker → echo-worker quickstart smoke command because that command is not present. | Once the local smoke command exists, wire it into a deterministic CI-friendly gate or document why it remains a manual local-only blocker. |
| `openclaw/openclaw#78261` wording | Pass / no bypass found in reviewed paths | Reviewed wording keeps `#78261` as unresolved external Terminal Brief receipt gate. Provider acceptance, `sent`, Telegram message IDs, and GitHub PR/Done/Block evidence are not treated as terminal ACK evidence. | Continue to reject any wording that treats provider-send acceptance as `current_session_visible`, operator-visible receipt, or terminal-outbox ACK. |
| Runtime/bootstrap evidence hygiene | Pass for this branch diff | This validation note does not include OpenClaw runtime/bootstrap context files or raw session dumps. | Fail closed if `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, or `.openclaw/**` appear in a future branch diff or artifact evidence. |

## Merge-order recommendation

1. Merge Contract v0 skeleton updates first.
2. Merge or coordinate conformance fixture work against the contract terms.
3. Add the local quickstart smoke commands (`start:local`, `worker:echo`, and/or `test:smoke`) without production dependencies.
4. Wire the resulting deterministic smoke/conformance command into CI.
5. Close the Team1 libero validation lane after the above gates have concrete command evidence.

## Safety confirmation

This cross-check did not perform production deploys, Gateway/broker/worker restarts, production database mutations, live provider or Telegram sends, terminal-outbox ACKs, edge-secret rotations, repository visibility changes, history rewrites, force pushes, or raw secret disclosure. It does not claim `openclaw/openclaw#78261` is solved, merged, rolled out, or bypassed.
