# A2A Spec-First Change Templates

Use these templates for medium and large A2A changes. They are intentionally lightweight and Markdown-only so the workflow can start before any runtime automation exists.

## When to use

- **Small**: a formal spec is optional when the change is small, reversible, and does not cross approval boundaries.
- **Medium**: write `spec.md` and `plan.md` before implementation.
- **Large**: write `spec.md`, `plan.md`, and `tasks.md`, then run the work through a detached execution lane such as TaskFlow or A2A evidence workers.

See `docs/a2a-constitution.md` for classification rules and approval boundaries.

## Templates

- `a2a-feature-spec.md` — what to build, why, success criteria, safety boundaries, evidence contract.
- `a2a-plan.md` — affected repos/components, execution lane, tests, rollout, rollback.
- `a2a-tasks.md` — implementation checklist with evidence requirements.
- `a2a-clarify.md` — minimum clarification questions before planning.
- `a2a-analyze.md` — consistency, coverage, and safety analysis pass.
- `a2a-checklist.md` — pre-implementation and pre-closeout quality checklist.

## Adoption rule

New medium/large A2A work should link the completed spec and plan from the issue or PR before implementation starts. Use `a2a-clarify.md` when the spec is underspecified, `a2a-analyze.md` before task execution, and `a2a-checklist.md` before implementation and closeout. The first adoption phases are documentation-only and do not change runtime behavior.
