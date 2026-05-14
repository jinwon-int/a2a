# Clarify Questions: <name>

Use this before implementation planning when a Medium/Large A2A spec has ambiguity. The goal is to ask the minimum questions needed to avoid unsafe or misdirected work.

## Linked spec

- Spec:
- Issue/PR:

## Decision owner

- Operator / final approval owner:
- Broker of record / finalizer:

## Required clarifications

### Scope

- [ ] What is explicitly in scope?
- [ ] What is explicitly out of scope?
- [ ] Which repos/components are affected?
- [ ] Is this Team1-only, Team2-only, or cross-team/cross-broker?

### Safety and approval boundaries

- [ ] Could this require deploy/restart/live canary/provider send?
- [ ] Could this mutate DB/outbox state, replay history, or touch Terminal Brief ACKs?
- [ ] Could this move, reveal, or rotate secrets?
- [ ] Could this change repository visibility, release/tag state, or force-push history?
- [ ] Which actions require a later explicit operator approval?

### Evidence and closeout

- [ ] What evidence is sufficient to call the work done?
- [ ] Which tests/checks must pass?
- [ ] Who makes the final closeout decision?
- [ ] What Wiki/runbook update is expected, if any?

### Failure and rollback

- [ ] What are the expected failure modes?
- [ ] What cleanup is safe without additional approval?
- [ ] What cleanup requires additional approval?
- [ ] What state must be restored if the change is reverted?

## Answers

Record concise answers here. If any answer changes the scope, update `spec.md` before planning.

| Question | Answer | Owner/date |
|---|---|---|
| ... | ... | ... |

## Clarification outcome

- [ ] Spec is clear enough to plan.
- [ ] Spec must be revised before planning.
- [ ] Work is blocked pending operator decision.

Notes:
