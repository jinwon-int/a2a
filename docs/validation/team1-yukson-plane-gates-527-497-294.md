# Team1/yukson plane gates for read-only validation and stability hardening

Parent: [a2a-broker#539](https://github.com/jinwon-int/a2a-broker/issues/539)  
Plane lane: [a2a-plane#275](https://github.com/jinwon-int/a2a-plane/issues/275)  
Trackers: [a2a-broker#527](https://github.com/jinwon-int/a2a-broker/issues/527), [a2a-broker#497](https://github.com/jinwon-int/a2a-broker/issues/497), [a2a-broker#294](https://github.com/jinwon-int/a2a-broker/issues/294)  
Snapshot: `2026-05-13T04:50Z`

This is a no-live Plane gate packet. It defines the safe evidence shape for GitHub read-only validation/libero lanes and the closeout gates for broker stability hardening. It does not deploy or restart services, mutate production databases, prune SQLite/WAL state, ACK terminal-outbox rows, replay historical outbox rows, send Telegram/provider messages, expose secrets, publish a release, force-push, rewrite history, or change repository visibility.

## Decision

**Decision: `NO-GO / Waiting` for operational activation.** Source docs/tests may proceed, but live broker rollout, cleanup, canary send, Terminal Brief ACK, or production state mutation remains blocked until every gate below has linked evidence and a separate explicit operator approval for that exact action.

Safe PR/Done evidence for this lane may say: **the read-only validation lane and broker-stability closeout gates are documented and locally tested; production activation remains `NO-GO / Waiting`.** It must not claim that #527, #497, or #294 is closed by documentation alone.

## Gate A — GitHub read-only validation/libero lane (`a2a-broker#527`)

A GitHub task with issue metadata may complete without a repository diff only when it is explicitly classified as read-only validation or analysis. Patch-producing tasks keep the existing no-diff false-Done guard.

| Required field or evidence | Pass condition | Fail-closed condition |
| --- | --- | --- |
| Intent/mode | The task uses `intent=verify` or `intent=analyze` with `taskOrigin=github` and a read-only mode such as `github-verify`, `github-read-only-validation`, or `read-only-analysis`. | GitHub issue metadata is forced into `github-propose-patch` when the worker role is validation/libero. |
| Allowed metadata | `repo`, `issue`, `issueNumber`, `issueUrl`, and `baseBranch` may be present for evidence binding. | Metadata implies a patch lane, live send, deploy, DB mutation, or terminal ACK. |
| Evidence | Start plus Done/Block GitHub evidence comments include bounded command results, issue/PR references, and a terminal kind of `done` or `block`. | Missing Start, missing terminal evidence, raw logs, secrets, host-private paths, or ambiguous terminal kind. |
| Repository diff | No diff is required for read-only validation/libero lanes. | A patch-producing lane posts Done with no diff or PR. |
| Terminal Brief | Terminal Brief may summarize the read-only result as evidence only. | Terminal Brief is treated as operator-visible receipt, read receipt, terminal ACK, or approval. |

Regression expectation: the `a2a-plane#240` style validation case from `a2a-broker#527` must be accepted as a read-only validation/libero task with Start and Done/Block evidence, while a `github-propose-patch` task with no repository changes still fails closed as false Done.

## Gate B — Broker hot-table growth and OOM stability (`a2a-broker#497`)

Before claiming #497 stability closure, require linked broker-side evidence for all of:

1. bounded SQLite hot-table loading or incremental persistence behavior that avoids full historical task/audit/outbox materialization in live heap;
2. health/readiness output that reports process memory, heap/RSS, table counts, terminal outbox total/acked/unacked counts, stale queued/claimed/running work, and WAL/checkpoint posture without secrets or host-private paths;
3. a representative regression, load, or soak test that seeds task/audit/outbox growth and shows startup/steady-state memory remains bounded;
4. terminal outbox hygiene that preserves unacked rows unless an approved retention policy handles them without forging ACK from provider accepted-send evidence;
5. safe-prune or cleanup APIs, if used, are dry-run first, target explicit tables/entities, require backup/restore evidence, and are blocked from production mutation without separate approval.

Any deploy, restart, DB prune, WAL mutation, backup/restore operation, or production cleanup is outside this Plane lane and remains `NO-GO / Waiting` without explicit approval.

## Gate C — Receipt semantics, queue hygiene, and canary safety (`a2a-broker#294`)

Before claiming #294 roadmap closure, require linked evidence for all of:

1. receipt vocabulary distinguishes `accepted`, `sent`, `provider-delivered-if-known`, `requester-visible`, `operator-visible`, `timed_out`, `stale`, `failed`, `Done`, `Block`, and `PR`;
2. provider accepted-send, Telegram message IDs, GitHub comment projection, and Terminal Brief notices are explicitly non-ACK and non-read-receipt evidence;
3. queue hygiene shows no stale claimed/running work, no unbounded backlog, and a clear no-change/evidence-only outcome path for validation/libero work;
4. a no-delivery or no-real-ACK canary path proves broker → plugin → worker → result projection without live provider send or terminal-outbox ACK;
5. any future live canary is disabled by default, one-shot allowlisted, replay/idempotency protected, tied to a fresh task/outbox id, and followed by restoration evidence.

The safe state for this lane is to leave #294 open as a residual-risk tracker until implementation PRs, canary proof, and operator approvals exist.

## Cross-broker Terminal Brief projection gate

For Seoseo-origin parent rounds and Gwakga handoffs, projected Terminal Brief evidence is an evidence ledger entry only. Accept it only when it includes:

- `parent=a2a-broker#539` and `lane=a2a-plane#275` or equivalent stable IDs;
- the child issue or PR/Done/Block evidence URL;
- a bounded summary and terminal kind (`pr`, `done`, or `block`);
- explicit flags showing no provider send, no terminal-outbox ACK, no read receipt, no approval, no production DB mutation, and no deploy/restart;
- runtime/bootstrap hygiene confirmation before copying the projection into parent evidence.

Do not manually ACK/replay Terminal Brief rows or replay historical outbox entries from this lane.

## Runtime/bootstrap and artifact hygiene gate

Before publishing PR, Done, or Block evidence, fail closed if any OpenClaw runtime/bootstrap context path would enter the branch, artifact evidence, or GitHub comment body. Report the exact repo-relative offending paths, including:

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `.openclaw/**`

Evidence must be bounded summaries only. It must not include raw session dumps, provider payloads, tokens, authorization header values, GitHub PATs, host-private paths, chat IDs, or secret-bearing config.

## Suggested local verification

```bash
npm run check:team1-yukson-plane-gates
npm run check:layout
npm run check:no-diff-closeout-guidance
git status --short --ignored
```
