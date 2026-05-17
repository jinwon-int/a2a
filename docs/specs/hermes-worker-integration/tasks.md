# Tasks: Hermes Broker-Agnostic Worker Contract

## Preconditions

- [x] Tracker exists: jinwon-int/a2a-plane#384.
- [x] Phase 1 is limited to source/docs/tests.
- [x] Live registration/canary/deploy/restart are out of scope.

## Implementation tasks

- [x] Add spec packet under docs/specs/hermes-worker-integration/.
- [x] Document minimal registration, heartbeat, polling, and evidence contract.
- [x] Add worker=<nodeId> and status=pending task poll aliases.
- [x] Add POST /tasks/:id/evidence terminal evidence alias.
- [x] Add local Hermes-style worker registration/heartbeat/poll/evidence server test.
- [x] Run targeted broker validation.
- [ ] Open PR.
- [ ] Monitor CI.

## Evidence checklist

- [x] git diff --check.
- [x] npm --workspace packages/broker test -- --test-name-pattern "Hermes-style worker".
- [x] npm --workspace packages/broker test.
- [ ] GitHub Actions check.

## Follow-up checklist

- [ ] If live Hermes worker work is requested, create a separate approval packet.
- [ ] Any live worker registration must name exact broker URL, worker id, maximum task scope, rollback, and evidence redaction rules.
- [ ] Family Wiki update only after source PR merge or an operator workflow decision.
