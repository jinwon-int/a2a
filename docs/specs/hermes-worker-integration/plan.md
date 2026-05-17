# Implementation Plan: Hermes Broker-Agnostic Worker Contract

## Linked spec

- Spec: docs/specs/hermes-worker-integration/spec.md
- Tracker: jinwon-int/a2a-plane#384

## Size classification

- [ ] Small
- [x] Medium
- [ ] Large

Reason: Phase 1 changes source contracts, broker HTTP surface, docs, and tests. A production Hermes worker implementation or live canary remains a separate Medium/Large follow-up.

## Affected repos/components

- a2a-plane: spec packet and docs.
- a2a-broker: HTTP compatibility aliases and server validation test.
- a2a-docker-runner: no change.
- openclaw-plugin-a2a: no change.
- Hermes Agent scripts/tools: no change.
- Wiki/runbooks: update only if the operator workflow changes after merge.

## Execution lane

- [x] Seoseo direct Phase 1 source PR.
- [ ] Isolated worker implementation.
- [ ] Live Hermes registration/canary.

Why this lane is safe: it modifies local source/docs/tests only and does not touch production broker state.

## Data/control flow

1. Hermes-style worker calls POST /workers/register.
2. Broker stores the worker as a normal WorkerRecord with public-safe metadata.
3. Worker heartbeats through POST /workers/:nodeId/heartbeat.
4. Worker polls GET /tasks?worker=<nodeId>&status=pending.
5. Broker maps worker to assignedWorkerId and pending to queued.
6. Worker claims/starts the task with the existing lifecycle routes.
7. Worker posts terminal evidence to POST /tasks/:id/evidence.
8. Broker maps done/pr to success and blocked/failed to failure.

## Tests and validation

- npm --workspace packages/broker test -- --test-name-pattern "Hermes-style worker"
- npm --workspace packages/broker test
- git diff --check
- GitHub Actions check on PR.

## Rollout plan

- Merge source PR after local and CI validation.
- Do not deploy, restart, register live Hermes workers, or send provider notifications.
- Create a separate tracker/approval packet before any live Hermes worker work.

## Rollback plan

- Revert PR.
- No production state cleanup is required.

