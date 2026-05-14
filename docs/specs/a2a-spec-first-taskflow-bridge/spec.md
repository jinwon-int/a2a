# Feature Spec: A2A Spec-First TaskFlow Bridge

## Problem

A2A Spec-First now has a constitution, templates, clarify/analyze/checklist steps, issue/PR template enforcement, and one real trial. Large A2A work still lacks one durable orchestration record that can survive restarts, link child evidence work, track approval waits, and return to the broker/finalizer for closeout.

The next step is to design a TaskFlow bridge that maps:

```text
spec.md → plan.md → tasks.md → TaskFlow job → child evidence tasks → finalizer closeout
```

This must be design-first. It must not turn on automatic runtime execution until the state model and safety gates are reviewed.

## User / operator stories

- As an operator, I want Large A2A work to keep one durable state record instead of being spread across chat, issue comments, child sessions, and ad-hoc notes.
- As a broker/finalizer, I want TaskFlow to track state, waits, child tasks, and evidence while leaving final judgment to me.
- As a worker, I want my evidence packet linked to the parent flow without being treated as the final decision.
- As a maintainer, I want approval-sensitive actions to remain blocked until explicit operator approval is recorded.

## Scope

### In scope

- Define the TaskFlow state schema for A2A spec-first work.
- Define lifecycle states and allowed transitions.
- Define child evidence task linkage.
- Define approval wait handling.
- Define closeout evidence requirements.
- Include one concrete mapping example from `a2a-broker#634` / Terminal Brief routing.
- Keep the first PR design/docs-only.

### Out of scope

- Runtime automation.
- Deploy/restart/live canary/provider send.
- DB/outbox mutation or migration.
- Manual Terminal Brief ACK/replay.
- Release/tag.
- Secret movement/output.
- Automatic execution for all Medium/Large issues.

## Success criteria

- [ ] Design doc exists and explains the bridge.
- [ ] Spec/plan/tasks exist for this bridge design work.
- [ ] State schema is documented.
- [ ] Lifecycle states and transitions are documented.
- [ ] Child task linkage is documented.
- [ ] Approval waits and blocked states are documented.
- [ ] Single finalizer judgment is preserved.
- [ ] Example mapping from `a2a-broker#634` is included.
- [ ] Design explicitly says what remains manual in Phase 1.
- [ ] No runtime automation is enabled by the design PR.

## Safety and approval boundaries

### Secrets and private data

TaskFlow state must not store secrets, raw logs, private endpoints, Telegram IDs, raw session dumps, or production DB/outbox contents. It should store repo/issue/PR links, file paths, status summaries, and redacted evidence references only.

### Human approval required for

- [x] production deploy
- [x] Gateway/broker/worker/service restart
- [x] live canary/provider send
- [x] DB mutation/prune/migration/replay
- [x] manual Terminal Brief ACK/replay
- [x] release/tag
- [x] secret rotation/movement
- [x] force push/history rewrite

This design does not approve any of the above.

## Evidence contract

The design PR must include:

- changed files;
- validation commands/results;
- safety boundary statement;
- issue links for #315 and #322;
- explicit note that no runtime behavior changed.

## Rollback / failure handling

The design can be reverted as a docs-only PR. No runtime state is created, so rollback is limited to reverting documentation and fixtures.

## Wiki/runbook follow-up

If the TaskFlow bridge becomes runtime behavior later, promote the operational procedure to the Family Wiki. This design PR does not require a Wiki update unless the operator requests it.
