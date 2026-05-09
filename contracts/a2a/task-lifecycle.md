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
| `queued` | Task has been accepted but not assigned. | `claimed`, `blocked`, `cancelled` |
| `claimed` | A worker has reserved the task. | `running`, `blocked`, `cancelled` |
| `running` | Worker is inspecting or changing repository content. | `done`, `pr`, `blocked`, `cancelling` |
| `cancelling` | Cancellation requested; worker notified to stop safely. | `cancelled` |
| `done` | Work completed without a PR requirement, with redacted evidence. | terminal |
| `pr` | Work completed with a PR URL and required check evidence. | terminal |
| `blocked` | Worker cannot safely or correctly complete the task. | terminal |
| `cancelled` | Task cancelled by operator, timeout, or block escalation. | terminal |

Terminal states are `done`, `pr`, `blocked`, and `cancelled`. Workers must not mutate terminal-outbox ACK records to manufacture terminal evidence.

## Idempotency

Every task creation must include an `idempotencyKey` scoped to the broker. Replays of the same key return the existing task. Different payloads with an existing key are rejected as a conflict. See [cancellation-idempotency.md](./cancellation-idempotency.md) for the full contract.

## Cancellation

Tasks may be cancelled by operator request, timeout, or block escalation. Workers receiving a cancellation signal must stop mutable operations, must not push new PRs, and must not mutate terminal-outbox ACK records. See [cancellation-idempotency.md](./cancellation-idempotency.md) for the full contract.

## Required terminal evidence

- `done`: summary, changed files if any, checks run, and safety confirmation.
- `pr`: PR URL, changed files summary, root check result, and safety confirmation.
- `blocked`: blocker category, concise reason, and any safe redacted evidence that supports the decision.
- `cancelled`: cancellation source (operator/timeout/escalation), brief acknowledgment, and safety confirmation that no partial work was promoted.
