# Cancellation & Idempotency Contract (v0)

This contract records the stable cancellation and idempotency semantics shared across the A2A broker, plugin, runner, and read models. It is intentionally a skeleton; do not add private endpoint names, provider identifiers, secrets, or host-specific paths.

## Cancellation

### Cancellation sources

A task may be cancelled by:

- **Operator request**: explicit cancellation from the operator via the broker.
- **Timeout**: a configurable deadline exceeded.
- **Block escalation**: the worker issued a Block and the broker closes the task.
- **Handoff cancellation**: the source broker cancels a pending handoff (see `broker-handoff-protocol.md`).

### Cancellation transitions

| From state | Trigger | To state | Notes |
|---|---|---|---|
| `queued` | operator cancel | `cancelled` | No worker assignment yet. |
| `claimed` | operator cancel | `cancelled` | Worker released; task closed. |
| `claimed` | timeout | `cancelled` | Broker-level deadline exceeded. |
| `running` | operator cancel | `cancelling` | Worker notified; must stop safely. |
| `cancelling` | worker ack | `cancelled` | Worker confirmed stop; terminal. |
| `running` | worker block | `blocked` | Worker cannot proceed safely. |

`cancelled` is a terminal state. Workers must not resume a cancelled task.

### Worker obligations on cancellation

- On receiving a cancellation signal, the worker must:
  1. Stop mutable operations (file writes, branch changes) as soon as safe.
  2. Not open or push a new PR.
  3. Not mutate terminal-outbox ACK records.
  4. Post a brief cancellation acknowledgment as evidence.
- Partial work (uncommitted changes, open PRs without required checks) must not be promoted to terminal Done or PR evidence.

### Timeout configuration

| Scope | Default | Override |
|---|---|---|
| Task deadline | 30 minutes | Per-broker config, per-task override |
| Handoff deadline | 60 minutes | Per-handoff envelope |
| Worker heartbeat | 5 minutes | Per-worker registration |

A task that exceeds its deadline transitions to `cancelled` by the broker without requiring worker acknowledgment.

## Idempotency

### Idempotency keys

Every task creation request must include an `idempotencyKey`. The key identifies one logical unit of work. Replays of the same key return the existing task; different payloads with the same key are a conflict and must be rejected.

Idempotency key format:
```
{source-scope}:{logical-op-id}
```

Examples (redacted):
- `issue-115:team1:contract-v0`
- `run-a2a-plane-roadmap-cross-team-20260509T131000Z:contracts-a2a-skeleton`

### Idempotency guarantees

1. **Exactly-once creation**: A given key creates at most one task.
2. **Replay safety**: Re-sending the same envelope returns the existing task id and state.
3. **Conflict detection**: Sending a different envelope (different source, destination, summary) with an existing key is a `409 Conflict`.
4. **Key scope**: Keys are scoped per-broker. Cross-broker handoffs use separate keys (see handoff protocol).

### Idempotency storage

Brokers must persist idempotency keys until the associated task reaches a terminal state plus a configurable retention window (default: 7 days). After retention, keys may be pruned; replays after pruning create a new task (a warning should be logged).

### Idempotency across handoffs

See `broker-handoff-protocol.md` for handoff-level idempotency. The handoff idempotency key is separate from the destination task idempotency key; the destination broker generates a fresh task idempotency key upon accepting a valid handoff.

## Safety boundaries

- Cancellation evidence must be redacted: no secret values, private endpoints, or raw session dumps.
- Idempotency key storage must not include raw task payloads or provider credentials.
- Timeout enforcement must not mutate production state outside the task scope.
