# Spec Analysis: <name>

Use this after `spec.md` and before or after `plan.md` to check consistency, coverage, and safety. This is the A2A equivalent of a lightweight `/analyze` pass.

## Inputs

- Spec:
- Plan:
- Tasks:
- Related issues/PRs:

## Consistency checks

- [ ] Problem statement matches the proposed scope.
- [ ] User/operator stories are covered by success criteria.
- [ ] In-scope and out-of-scope sections do not conflict.
- [ ] Plan covers every affected repo/component named in the spec.
- [ ] Tasks cover every implementation and validation item in the plan.
- [ ] Rollback/failure handling exists for every risky change.

## Safety checks

- [ ] Secrets/private data handling is explicit.
- [ ] Approval-sensitive actions are named and not silently included.
- [ ] Broker foreground liveness risk is addressed.
- [ ] Worker isolation boundary is addressed.
- [ ] Evidence requirements are sufficient for finalizer judgment.
- [ ] Wiki/runbook follow-up is either planned or explicitly not needed.

## A2A routing / ownership checks

Use when the change affects broker/worker/team routing.

- [ ] Exactly one broker of record/finalizer is named.
- [ ] Team1/Team2/cross-team ownership is unambiguous.
- [ ] Handoff/cross-broker behavior is explicit when relevant.
- [ ] Duplicate operator-facing notifications are prevented when relevant.
- [ ] Failure fallback behavior is explicit when relevant.

## Coverage gaps

| Gap | Severity | Required fix before implementation? | Owner |
|---|---|---|---|
| ... | low/medium/high | yes/no | ... |

## Analysis outcome

- [ ] Ready for task execution.
- [ ] Needs spec update.
- [ ] Needs plan update.
- [ ] Needs task update.
- [ ] Blocked pending operator decision.

Summary:
