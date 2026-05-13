# A2A all-hands stability closeout gates

Parent: [a2a-broker#532](https://github.com/jinwon-int/a2a-broker/issues/532)  
Plane lane: [a2a-plane#272](https://github.com/jinwon-int/a2a-plane/issues/272)  
Round id: `a2a-allhands-stability-parent-soonwook-20260513T030320Z`  
Snapshot: `2026-05-13T03:20Z`

This is a redacted, no-live Team2/Soonwook closeout checklist for the all-hands stability round. It is documentation/spec evidence only. It does not deploy, restart, mutate production databases or terminal-outbox rows, send provider or Telegram messages, change secrets, publish releases, force-push, merge PRs, or approve repository visibility changes.

## Decision summary

- `a2a-plane#240` can close only after both `a2a-plane#267` and `a2a-plane#268` are merged or explicitly superseded, the final `docs/ecosystem-guide.md` link points at `issues/240` rather than the stale `issues/239`, and the final `main` branch CI is green.
- `a2a-broker#497` and `a2a-broker#294` remain open residual-risk trackers until explicit operator approval covers any deploy, canary, cleanup, pruning, live send, or ACK-affecting action. This round may produce gates and docs, not live closure.
- Team1 cross-broker Terminal Brief projections into `parentRoundId=a2a-allhands-stability-parent-soonwook-20260513T030320Z` are accepted only as redacted evidence ledger entries. They are not approval, read receipt, terminal ACK, or operator-visible proof.

## Closeout gate: `a2a-plane#240` PRs

| Gate | Required evidence | Closeout result rule |
| --- | --- | --- |
| `a2a-plane#267` migration checklist | PR is open or merged, mergeable against current `main`, CI check succeeded, and changed files are limited to the ecosystem guide plus `docs/monorepo-migration-checklist.md`. | May merge if it keeps the ecosystem guide short and moves detailed migration planning into the checklist. |
| `a2a-plane#268` ecosystem guide | PR is open or merged, mergeable against current `main`, CI check succeeded, and changed files are limited to `README.md` plus `docs/ecosystem-guide.md`. | May merge if it clarifies the external entrypoint and does not duplicate the migration checklist. |
| Shared file conflict | `docs/ecosystem-guide.md` is touched by both PRs. Run merge preflight or update the second PR after the first lands. | Block closing `#240` if the second merge drops either the `#240` link fix or the external-user guide improvements. |
| Stale tracker link | Final `docs/ecosystem-guide.md` must not contain `https://github.com/jinwon-int/a2a-plane/issues/239` as the target for `a2a-plane#240`. | Block until the final merged guide links to `https://github.com/jinwon-int/a2a-plane/issues/240`. |
| Scope boundary | No runtime, deployment, secret, DB, Terminal Brief ACK, provider send, release, visibility, or force-push action is included. | Any live-impact side effect moves the round to Block pending explicit approval. |

Suggested read-only verification:

```bash
gh pr view 267 --repo jinwon-int/a2a-plane --json state,mergeStateStatus,statusCheckRollup,files,url
gh pr view 268 --repo jinwon-int/a2a-plane --json state,mergeStateStatus,statusCheckRollup,files,url
gh pr diff 267 --repo jinwon-int/a2a-plane --name-only
gh pr diff 268 --repo jinwon-int/a2a-plane --name-only
grep -RIn "a2a-plane#240\|issues/240\|issues/239" README.md docs/ecosystem-guide.md docs/monorepo-migration-checklist.md 2>/dev/null || true
npm run check:layout
npm run check:no-diff-closeout-guidance
```

## Follow-up gates: `a2a-broker#497` and `a2a-broker#294`

These gates are residual-risk closeout criteria for the broker roadmap. They do not close either tracker by themselves.

### Broker hot-table memory/OOM gate (`a2a-broker#497`)

Before claiming stability closure, require all of:

- merged broker evidence for bounded hot-table loading or incremental persistence work from the #511 train (`a2a-broker#515`, `#516`, `#517`) or a later superseding PR set;
- health/readiness output that reports process memory, heap/RSS pressure, relevant table counts, terminal outbox total/acked/unacked counts, and stale queue indicators without exposing secrets or host-private paths;
- a regression or soak test that proves representative task/audit/outbox growth does not require unbounded startup heap or full snapshot serialization for each hot-row mutation;
- explicit safe-prune or cleanup API gates, if used, that are dry-run first and require backup evidence before any production DB mutation;
- a post-merge note that no deploy, restart, DB prune, WAL mutation, terminal ACK, live send, or secret change happened unless a separate approval names that exact action.

### Receipt/canary/queue gate (`a2a-broker#294`)

Before claiming roadmap closure, require all of:

- provider accepted-send, GitHub comment projection, and Terminal Brief evidence remain explicitly non-ACK and non-read-receipt evidence;
- terminal evidence projections preserve `isApproval: false`, `isTerminalAck: false`, and `isReadReceipt: false` unless a separate contract and approval say otherwise;
- live canary or notification activation is disabled by default and requires a one-shot allowlist, replay suppression, operator approval, and post-run restoration evidence;
- queue hygiene shows no stale claimed/running work, no unbounded terminal outbox backlog, and a clear no-change/evidence-only outcome path for PR-flow tasks;
- all GitHub evidence comments are bounded summaries, not raw logs, provider payloads, secrets, host-specific private paths, or OpenClaw runtime/bootstrap context.

## Cross-broker Terminal Brief watch gate

For Team1 lanes handed off through Seoseo, watch for a redacted projection back to the Gwakga parent round with this exact metadata:

```text
parentRoundId=a2a-allhands-stability-parent-soonwook-20260513T030320Z
originBrokerId=gwakga
parentBrokerId=gwakga
handoffBrokerId=seoseo
```

Accept a Team1 projection only if it includes:

- a stable projection key or idempotency marker;
- child issue or PR/Done/Block evidence URL;
- bounded summary and terminal kind (`pr`, `done`, or `block`);
- explicit non-live flags: no provider send, no terminal-outbox ACK, no read receipt, no approval;
- runtime/bootstrap hygiene confirmation before the projection is copied into parent evidence.

If no Team1 projection has arrived yet, the correct state is `Waiting for projection`, not `Done`. If a projection includes unsafe content, mark the parent evidence as `Block` with a sanitized reason instead of copying the unsafe payload.

Suggested watch commands:

```bash
gh issue view 532 --repo jinwon-int/a2a-broker --json comments,url,title,state
gh issue view 272 --repo jinwon-int/a2a-plane --json comments,url,title,state
gh search issues 'a2a-allhands-stability-parent-soonwook-20260513T030320Z owner:jinwon-int' --json repository,number,title,state,url,commentsCount --limit 50
```

## Runtime/bootstrap hygiene gate

Before publishing PR, Done, or Block evidence for this lane, fail closed if any OpenClaw runtime/bootstrap context path would enter the branch or artifacts:

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `.openclaw/**`

If the guard fails, report the exact repo-relative offending paths and do not create success evidence.
