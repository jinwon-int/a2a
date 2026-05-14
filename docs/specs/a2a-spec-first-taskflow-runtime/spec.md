# Feature Spec: A2A Spec-First TaskFlow Runtime Dry-Run

## Problem

The TaskFlow bridge design is merged, but A2A still needs a first runtime-shaped step that proves the state model can be validated and rehearsed without turning on live automation.

## User / operator stories

- As an operator, I want to see the TaskFlow state that would be created before any runtime work starts.
- As a broker/finalizer, I want child evidence lanes and waits represented in one durable shape.
- As a maintainer, I want approval-sensitive actions to fail closed instead of being executed or inferred.

## Scope

### In scope

- Add a dry-run/runtime rehearsal command for a spec-first packet.
- Emit managed TaskFlow draft fields: `controllerId`, `currentStep`, `stateJson`, optional `waitJson`, child lane plans, and closeout expectation.
- Validate required state fields and lane metadata.
- Fail closed for unsafe inputs and approval-sensitive actions.
- Add tests, schema, and fixture.

### Out of scope

- Production deploy/restart/canary/provider send.
- DB/outbox mutation.
- Manual Terminal Brief ACK/replay.
- Release/tag.
- Secret movement/output.
- Automatic scan/launch for all Medium/Large issues.
- Live OpenClaw TaskFlow automation on nodes.

## Success criteria

- [ ] Runtime rehearsal command exists.
- [ ] Schema/fixture document the input/output contract.
- [ ] Valid `a2a-broker#634` packet emits a dry-run managed flow draft.
- [ ] Operator approval requests become `awaiting_approval`/`waitJson`.
- [ ] Unsafe runtime automation, execute mode, sensitive lanes, and unredacted state fail closed.
- [ ] Release-gate tests cover the command.

## Safety and approval boundaries

### Secrets and private data

The command must not store or emit secrets, raw logs, raw session dumps, private endpoints, runtime bootstrap paths, or production DB/outbox contents. It scans state strings for common unsafe patterns.

### Human approval required for

- [x] production deploy
- [x] Gateway/broker/worker/service restart
- [x] live canary/provider send
- [x] DB mutation/prune/migration/replay
- [x] manual Terminal Brief ACK/replay
- [x] release/tag
- [x] secret rotation/movement
- [x] force push/history rewrite

This PR does not approve or perform any of those actions.

## Evidence contract

- Changed files and PR URL.
- Local validation results.
- GitHub Actions check result.
- Explicit no-runtime-automation safety statement.

## Rollback / failure handling

Revert the docs/scripts/tests PR. No runtime state, deployment, DB cleanup, or ACK cleanup is created.

## Wiki/runbook follow-up

If this later becomes live node automation, promote the operator procedure to the Family Wiki. This dry-run PR does not require Wiki update.
