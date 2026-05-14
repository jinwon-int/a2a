# Tasks: A2A Spec-First TaskFlow Runtime Dry-Run

## Preconditions

- [x] TaskFlow bridge design merged.
- [x] Implementation issue opened.
- [x] Runtime automation remains out of scope.

## Implementation tasks

- [ ] Add runtime rehearsal schema.
- [ ] Add dry-run runtime command.
- [ ] Add example fixture.
- [ ] Add unit tests.
- [ ] Document dry-run command in TaskFlow bridge doc.
- [ ] Add npm scripts / release-gate coverage.
- [ ] Validate locally.
- [ ] Open PR and monitor CI.

## Evidence checklist

- [ ] `git diff --check`.
- [ ] `npm run a2a:taskflow-runtime:test`.
- [ ] Valid fixture command.
- [ ] `npm run check:layout`.
- [ ] `npm run test:release-gate`.
- [ ] GitHub Actions check.

## Final closeout checklist

- [ ] Exactly one finalizer reports result.
- [ ] No deploy/restart/live canary/provider send/DB mutation/ACK replay/release/tag/secret movement occurred.
- [ ] Follow-up for live runtime automation is separate if needed.
