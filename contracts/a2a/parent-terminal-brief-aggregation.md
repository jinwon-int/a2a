# Parent Terminal Brief Aggregation Contract (v0)

> **v0 (2026-05-13):** Parent-broker Terminal Brief aggregation is a projection contract, not a worker-dispatch, receipt, or ACK contract. It defines how a parent broker records redacted terminal PR/Done/Block evidence from child broker tasks for a shared parent round.

This contract covers the Gwakga-origin + Seoseo-handoff canary path: Gwakga owns the parent round and aggregation ledger, while Seoseo may own a handoff child task and publish redacted terminal evidence back to the parent aggregation view.

## Actors

- **Parent broker**: broker that owns the parent round and renders the aggregate Terminal Brief. In the canary, this is `gwakga`.
- **Origin broker**: broker that created the parent round metadata. For v0 aggregation it must equal the parent broker. In the canary, this is `gwakga`.
- **Handoff broker**: broker that owns a child task created through handoff. In the canary, this is `seoseo`.
- **Child task broker of record**: the broker that controls child task lifecycle, worker assignment, and terminal evidence production.
- **Projection**: the parent broker's redacted, bounded record of the child terminal result.

## Metadata lifecycle

The parent broker creates these metadata fields before child dispatch:

```json
{
  "parentRoundId": "round-gwakga-origin-seoseo-handoff-canary-001",
  "originBrokerId": "gwakga",
  "parentBrokerId": "gwakga",
  "handoffBrokerId": "seoseo"
}
```

Lifecycle rules:

1. `parentRoundId` is minted once by the origin broker before the first child handoff and remains stable for every child projection in that parent round.
2. `originBrokerId` is minted with the parent round and must not be rewritten by child brokers or replay handlers.
3. A child handoff must copy `parentRoundId` and `originBrokerId` into its handoff envelope metadata before task creation.
4. The child broker may append its `childTaskId`, `childBrokerId`, `childIssueUrl`, and terminal evidence URL after it becomes broker of record for the child task.
5. Parent aggregation consumes child terminal evidence as projection input only. It must not mutate child task lifecycle, worker assignment, provider-send state, or terminal-outbox ACK rows.
6. Once a projection reaches `projected`, replay returns the existing projection by `projectionKey`; it must not create another parent Terminal Brief entry.

## Required projection fields

Every parent aggregation projection must carry these fields:

| Field | Requirement |
| --- | --- |
| `projectionKey` | Stable idempotency key derived from `parentRoundId`, `originBrokerId`, `childTaskId`, and terminal kind. |
| `parentRoundId` | Stable parent round id minted by `originBrokerId`. |
| `originBrokerId` | Broker that created the parent round; `gwakga` for the canary. |
| `parentBrokerId` | Broker rendering the aggregate Terminal Brief; must equal `originBrokerId` in v0. |
| `handoffBrokerId` | Broker that received/owns the child handoff; `seoseo` for the canary. |
| `childBrokerId` | Broker of record for the child terminal task. |
| `childTaskId` | Child task id under the child broker of record. |
| `childIssueUrl` | Public-safe issue URL for child evidence, when available. |
| `terminalKind` | One of `pr`, `done`, or `block`. |
| `terminalEvidenceUrl` | URL of redacted PR/Done/Block evidence. |
| `terminalSummary` | Bounded human-readable summary suitable for the parent Terminal Brief. |
| `terminalBriefTitle` | Concise parent-broker-rendered title using `A2A Terminal Brief <상태>: <worker>(<completed>/<total>)`, for example `A2A Terminal Brief 완료: dungae(1/7)`. |
| `projectionState` | `pending`, `projected`, `blocked`, or `conflict`. |
| `redacted` | Must be `true`. |
| `projectedAt` | ISO-8601 timestamp when the parent projection was recorded. |
| `terminalOutboxAckMutated` | Must be `false`. |
| `liveProviderSend` | Must be `false` unless a separate approved live-canary contract explicitly says otherwise. |
| `isApproval` | Must be `false`. |
| `isTerminalAck` | Must be `false`. |
| `isReadReceipt` | Must be `false`. |

## Redaction boundary

Parent Terminal Brief aggregation may include issue/PR URLs, bounded summaries, changed-file counts, check command names, and pass/fail status. It must not include secrets, raw provider payloads, host-private paths, full transcripts, internal runtime/bootstrap context files, live tokens, private database rows, or child worker logs.

A parent projection that cannot be represented within this redaction boundary must become a `block` projection with a sanitized blocker summary rather than copying unsafe evidence.

## Concise title semantics

The aggregate Terminal Brief title is a parent-broker-only projection. The child broker supplies terminal evidence, but only the parent broker renders the operator-facing title from the parent aggregation ledger.

Title gates:

- format: `A2A Terminal Brief <상태>: <worker>(<completed>/<total>)`;
- example success title: `A2A Terminal Brief 완료: dungae(1/7)`;
- title source: parent broker ledger fields for terminal status, worker id, completed count, and total count;
- max length: 80 characters;
- forbidden title content: task id, child issue URL, PR/Done/Block URL, terminal summary/body, child broker id, handoff broker id, provider message id, receipt status, ACK status, raw logs, secrets, private paths, and runtime/bootstrap file names;
- the title is not proof of provider delivery, operator receipt, approval, or terminal-outbox ACK.

## Gwakga-origin + Seoseo-handoff canary contract

The v0 canary proves only this path:

1. Gwakga mints `parentRoundId` and `originBrokerId` for a parent aggregation round.
2. Gwakga creates a child handoff envelope for Seoseo that carries the parent metadata.
3. Seoseo owns the child task as broker of record and produces redacted terminal PR/Done/Block evidence.
4. Gwakga records a single projection row in the parent Terminal Brief aggregation ledger.
5. The aggregate brief links to the child terminal evidence but does not claim provider delivery, human receipt, approval, or ACK.

This canary does not permit cross-worker registration, parent-broker worker dispatch on the child broker, provider sends, production database mutation, terminal-outbox ACK mutation, repository visibility changes, force-pushes, or automatic merges.

## Rollback and no-replay guidance

- Rollback is metadata-only: mark the projection `blocked` or `conflict`, preserve the original projection URL/key, and add a redacted rollback reason.
- Do not delete or overwrite child terminal evidence from the parent broker.
- Do not rerun a child task just because parent aggregation failed. Create a new child task only with a new handoff/idempotency key and explicit operator scope.
- Replaying parent aggregation with the same `projectionKey` must return the existing projection and evidence URL with `newProjectionCreated: false`.
- A same-key/different-payload replay is a conflict and must fail closed.

## Evidence requirements

A PR/Done/Block closeout for this contract must provide:

- the contract document path and fixture path;
- local conformance command output for the fixture;
- the `parentRoundId`, `originBrokerId`, and `projectionKey` used in the synthetic proof;
- confirmation that evidence is redacted and no live provider send or ACK mutation occurred;
- replay/no-replay evidence showing duplicate aggregation returns the existing projection;
- rollback guidance or blocker handling for unsafe projection input;
- runtime/bootstrap hygiene confirmation before PR or artifact evidence publication.
