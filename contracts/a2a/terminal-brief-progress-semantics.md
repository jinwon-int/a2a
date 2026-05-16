# Terminal Brief Progress Semantics Contract (v0)

> **v0 Freeze (2026-05-16):** Progress report types (Progress, ProgressCheckpoint), evidence
> requirements, progress-vs-terminal boundary rules, and safety gates are frozen as the Contract
> v0 progress semantics baseline. No new progress report types or boundary relaxations may be added
> without a v0→v1 compatibility plan.

This contract defines the semantics of **progress** in the Terminal Brief context — intermediate,
non-terminal status updates between a Start marker and a terminal result (Done, PR, or Block).
It builds on the existing [terminal result semantics](./terminal-semantics.md),
[task lifecycle](./task-lifecycle.md), and [checkpoint & interrupt](./checkpoint-interrupt.md)
contracts.

Progress reports are **not** terminal evidence. They are lightweight status updates that
communicate active work, intermediate checkpoints, file counts, test pass/fail progress, or
blocker discovery before a terminal state is reached.

## 1. Progress vs Terminal Boundary

| Dimension | Progress | Terminal |
|-----------|----------|----------|
| **State relation** | Task is in `running`, `claimed`, or `paused` state | Task has reached `done`, `pr`, `blocked`, or `cancelled` |
| **Evidence weight** | Non-terminal ledger update | Terminal closeout evidence |
| **Outbox ACK mutation** | Never | Only with ACK-safe receipt proof (see terminal-semantics.md) |
| **Provider send eligibility** | Must not trigger provider notification unless explicitly approved in a separate progress-notification contract | Operator-facing parent Terminal Brief may be sent |
| **Replay / idempotency** | Idempotent: same progress key returns existing, does not advance cursor | Replay returns existing projection; does not re-send or re-ACK |
| **Outbox cursor** | Must not advance the terminal-outbox cursor | Advances the terminal-outbox cursor |

### 1.1 Progress is not terminal evidence

A progress report must never be promoted to or confused with terminal evidence. Specifically:

- A progress entry in the terminal-outbox or projection ledger must carry the field
  `terminalAck: false`, `readReceipt: false`, `isApproval: false`, `isTerminalAck: false`.
- The progress report must declare `isProgress: true` and `isTerminal: false` explicitly.
- Downstream consumers (notification adapter, projection renderer, operator dashboard) must
  not treat progress entries as terminal closeout for the purpose of aggregate Terminal Brief
  title rendering, outbox ACK advancement, or operator-visible receipt proof.
- A progress-only sibling lane must not block or delay the parent round's ability to reach
  a terminal aggregate state.

## 2. Progress Report Types

### 2.1 Progress

A generic progress update indicating active work. Suitable for periodic status updates,
early findings, or intermediate deliverables.

```json
{
  "kind": "progress",
  "taskId": "task-yukson-r28-progress-001",
  "sequence": 1,
  "summary": "Completed contract skeleton, in-progress on fixture definition.",
  "changedFiles": ["contracts/a2a/terminal-brief-progress-semantics.md"],
  "checksRun": ["git diff --stat"],
  "isProgress": true,
  "isTerminal": false,
  "safetyConfirmed": true,
  "redacted": true
}
```

Required fields:

| Field | Requirement |
|-------|-------------|
| `kind` | Must be `"progress"`. |
| `taskId` | Stable task identifier. |
| `sequence` | Monotonically increasing integer. Each progress report for the same task must increment the sequence. Replays must return the existing sequence entry. |
| `summary` | Bounded human-readable summary (max 280 chars). |
| `changedFiles` | Optional array of repo-relative file paths changed since the last report or since Start, if applicable. |
| `checksRun` | Optional array of commands or checks executed since the last report. |
| `isProgress` | Must be `true`. |
| `isTerminal` | Must be `false`. |
| `safetyConfirmed` | Must be `true`. |
| `redacted` | Must be `true`. |

### 2.2 ProgressCheckpoint

A progress update tied to a checkpoint (see [checkpoint-interrupt.md](./checkpoint-interrupt.md)).
Indicates the task has been paused or is awaiting operator input at a durable checkpoint.

```json
{
  "kind": "progress-checkpoint",
  "taskId": "task-yukson-r28-checkpoint-001",
  "checkpointId": "chk-yukson-r28-20260516T120000Z",
  "checkpointState": "paused",
  "summary": "Reached checkpoint after contract skeleton. Awaiting operator input on scope boundary.",
  "changedFiles": ["contracts/a2a/terminal-brief-progress-semantics.md"],
  "isProgress": true,
  "isTerminal": false,
  "safetyConfirmed": true,
  "redacted": true
}
```

Required fields:

| Field | Requirement |
|-------|-------------|
| `kind` | Must be `"progress-checkpoint"`. |
| `taskId` | Stable task identifier. |
| `checkpointId` | Durable checkpoint identifier matching the broker's checkpoint record. |
| `checkpointState` | One of `"paused"`, `"awaiting_operator"`. |
| `summary` | Bounded human-readable summary (max 280 chars). |
| `isProgress` | Must be `true`. |
| `isTerminal` | Must be `false`. |
| `safetyConfirmed` | Must be `true`. |
| `redacted` | Must be `true`. |

### 2.3 ProgressAccept (auto-generated)

A broker-level or runner-level acknowledgment that a progress report was recorded.
This is an internal lifecycle event, not a user-visible update. It follows the same
`accepted-send` receipt level rules from terminal-semantics.md — it is never a
read receipt, visibility proof, terminal ACK, or operator approval.

```json
{
  "kind": "progress-accept",
  "taskId": "task-yukson-r28-progress-001",
  "sequence": 1,
  "providerMessageId": "msg-redacted",
  "isProgress": true,
  "isTerminal": false,
  "isAcceptance": true,
  "isReadReceipt": false,
  "isTerminalAck": false
}
```

## 3. Progress Evidence Requirements

### 3.1 Redaction

Progress evidence must follow the same redaction rules as terminal evidence:

- No secret values, private endpoint values, raw session dumps, or host-specific private paths.
- No OpenClaw runtime/bootstrap context file contents or file names in the summary or evidence body.
- Changed file paths must be repo-relative and public-safe.
- Check command names must be safe to display (no secrets in arguments).

### 3.2 Idempotency

Each progress report for a given task must carry a stable idempotency key derived from:

- `taskId`
- `sequence` number

Replays of the same `taskId` + `sequence` must return the existing progress report,
not create a duplicate. Replays must not advance any cursor or emit provider notifications.

### 3.3 Bounded size

Progress summaries are bounded to 280 characters. Changed file arrays are bounded to
20 entries. Check command arrays are bounded to 10 entries. These limits prevent progress
evidence from growing unbounded within a single task.

### 3.4 Sequence gaps

A task's progress sequence must be monotonically increasing without gaps. If sequence
`n+1` is recorded but sequence `n` is missing, the broker or validation layer must flag
a gap warning. Gaps do not block terminal closeout but are recorded as a hygiene note.

## 4. Progress Safety Gates

| Gate | Required behavior | Enforcement |
|------|-------------------|-------------|
| No terminal outbox ACK | Progress must not mutate terminal-outbox ACK columns. | `isTerminal: false`, `terminalOutboxAckMutated: false` in every progress record. |
| No provider notification | Progress must not trigger provider (Telegram, Slack) notifications unless a separate approved contract explicitly authorizes progress notification. | Default route: progress records are stored but not dispatched. |
| No aggregate title advancement | Progress must not change the parent-round aggregate Terminal Brief title. | The aggregate title rendering must consider only terminal entries, not progress entries. |
| No terminal confusion | Progress `kind` values must not overlap with terminal `kind` values (`done`, `pr`, `blocked`). | Validation rejects `kind` values that are both progress and terminal. |
| No cursor advancement | Progress must not advance the terminal-outbox cursor. | The terminal-outbox cursor advances only on terminal events (done, pr, blocked, cancelled). |
| Sequence integrity | Progress sequences must be monotonically increasing, gap-detected, and replay-idempotent. | Broker or fixture validation checks sequence continuity. |

## 5. Progress in the Parent Aggregation Context

In a parent-origin routing context (see [parent-terminal-brief-aggregation.md](./parent-terminal-brief-aggregation.md)),
progress reports produced by child or handoff tasks:

1. Must be relayed back to the parent broker's aggregation ledger as non-terminal entries.
2. Must not change the parent-round `projectionState` from `pending` to `projected`.
3. Must not trigger a parent-round aggregate Terminal Brief notification.
4. Must carry `parentRoundId`, `originBrokerId`, and `handoffBrokerId` metadata when
   relayed across brokers.
5. Must be ignored when rendering the aggregate Terminal Brief title.

The parent broker may choose to expose progress in its aggregation view for operator
visibility, but this is strictly optional and must not imply terminal readiness.

## 6. Evidence Examples

Fixture paths:

- Machine-readable: `fixtures/contract/terminal-brief-progress.json`
- Examples: `contracts/a2a/fixtures/terminal-brief-progress-examples.json`

## 7. Safety Confirmations

Every progress report or validation artifact must confirm:

- `noPublicVisibilityChange`: No repository visibility changes occurred.
- `noProductionDeployOrRestart`: No production deploy, Gateway restart, or broker restart occurred.
- `noProductionDatabaseMutation`: No production database was mutated.
- `noLiveProviderSend`: No live provider or Telegram send occurred beyond any explicitly approved progress-notification path.
- `noTerminalOutboxAckMutation`: No terminal-outbox ACK column was mutated.
- `noSecretRotationOrDisclosure`: No secrets were rotated, disclosed, or exposed.
- `noRawSessionDump`: No raw session dumps or unredacted transcripts were recorded.
