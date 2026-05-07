# A2A Task Lifecycle Contract Skeleton

This contract records the stable task lifecycle vocabulary shared by the broker, OpenClaw plugin, Docker runner, and future read models. It is intentionally a skeleton until the sanitized imports land; do not add private endpoint names, provider identifiers, secrets, or host-specific paths here.

## Core objects

- **Run**: a parent orchestration record that groups one or more worker tasks for a single operator-approved objective.
- **Task**: a unit of work assigned to one worker. A task may produce a patch, documentation update, import evidence, or a terminal Block.
- **Worker**: a registered execution surface with a stable public-safe name, capability labels, and safety policy version.
- **Evidence**: redacted, non-secret proof that the task reached a terminal result, such as a PR URL, check command output, or Block reason.

## Lifecycle states

| State | Meaning | Allowed next states |
|---|---|---|
| `queued` | Task has been accepted but not assigned. | `claimed`, `blocked` |
| `claimed` | A worker has reserved the task. | `running`, `blocked` |
| `running` | Worker is inspecting or changing repository content. | `done`, `pr`, `blocked` |
| `done` | Work completed without a PR requirement, with redacted evidence. | terminal |
| `pr` | Work completed with a PR URL and required check evidence. | terminal |
| `blocked` | Worker cannot safely or correctly complete the task. | terminal |

Terminal states are `done`, `pr`, and `blocked`. Workers must not mutate terminal-outbox ACK records to manufacture terminal evidence.

## Required terminal evidence

- `done`: summary, changed files if any, checks run, and safety confirmation.
- `pr`: PR URL, changed files summary, root check result, and safety confirmation.
- `blocked`: blocker category, concise reason, and any safe redacted evidence that supports the decision.
