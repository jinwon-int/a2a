# Team2/Soonwook R14 two-broker live-hardening acceptance matrix

Issue: [a2a-plane#309](https://github.com/jinwon-int/a2a-plane/issues/309)  
Parent: [a2a-broker#615](https://github.com/jinwon-int/a2a-broker/issues/615)  
Run: `a2a-r14-live-hardening-20260514T060000Z`  
Lane: Team2 / `soonwook` / `5/7`  
Team1 broker of record: `seoseo`  
Team2 broker of record: `gwakga`  
Overall finalizer: `seoseo`  
Snapshot: `2026-05-14T06:00Z`

This is a redacted, no-live acceptance matrix for R14 live broker/worker hardening. It uses repository and GitHub issue evidence only. It does not deploy, restart, reload, send a live provider/Telegram canary, mutate production databases, prune hot tables, run migrations, perform terminal ACK/replay or historical outbox replay, change secrets, rotate tokens, change repository visibility, create a release/tag, force-push, or execute approval. Provider accepted/message-id evidence is non-ACK evidence only; it is never requester-visible receipt, operator-visible receipt, terminal ACK, terminal-outbox ACK, or approval.

## R14 dispatch snapshot

| Order | Team | Broker | Worker | Lane issue | Task id | Snapshot state | Terminal evidence boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1/7 | Team1 | `seoseo` | `bangtong` | [a2a-broker#616](https://github.com/jinwon-int/a2a-broker/issues/616) | `a2a-r14-live-hardening-20260514T060000Z-01-bangtong` | `running` | Start/running is not terminal evidence; only PR, Done, or Block counts. |
| 2/7 | Team1 | `seoseo` | `sogyo` | [openclaw-plugin-a2a#309](https://github.com/jinwon-int/openclaw-plugin-a2a/issues/309) | `a2a-r14-live-hardening-20260514T060000Z-02-sogyo` | `running` | Start/running is not terminal evidence; only PR, Done, or Block counts. |
| 3/7 | Team1 | `seoseo` | `nosuk` | [a2a-broker#617](https://github.com/jinwon-int/a2a-broker/issues/617) | `a2a-r14-live-hardening-20260514T060000Z-03-nosuk` | `running` | Start/running is not terminal evidence; only PR, Done, or Block counts. |
| 4/7 | Team1 | `seoseo` | `yukson` | [a2a-docker-runner#253](https://github.com/jinwon-int/a2a-docker-runner/issues/253) | `a2a-r14-live-hardening-20260514T060000Z-04-yukson` | `running` | Start/running is not terminal evidence; only PR, Done, or Block counts. |
| 5/7 | Team2 | `gwakga` | `soonwook` | [a2a-plane#309](https://github.com/jinwon-int/a2a-plane/issues/309) | `a2a-r14-live-hardening-20260514T060000Z-05-soonwook` | `running` | This matrix lane; terminal evidence is this PR/Done/Block only. |
| 6/7 | Team2 | `gwakga` | `dungae` | [a2a-broker#618](https://github.com/jinwon-int/a2a-broker/issues/618) | `a2a-r14-live-hardening-20260514T060000Z-06-dungae` | `running` | Start/running is not terminal evidence; only PR, Done, or Block counts. |
| 7/7 | Team2 | `gwakga` | `jingun` | [a2a-broker#619](https://github.com/jinwon-int/a2a-broker/issues/619) | `a2a-r14-live-hardening-20260514T060000Z-07-jingun` | `running` | Start/running is not terminal evidence; only PR, Done, or Block counts. |

Parent dispatch evidence: [a2a-broker#615 comment 4448092508](https://github.com/jinwon-int/a2a-broker/issues/615#issuecomment-4448092508). The parent issue states the R14 theme, run id, seven-child total, Team1/Team2 broker split, and safety constraints.

## Two-broker acceptance matrix

| Gate | Team1 / `seoseo` acceptance condition | Team2 / `gwakga` acceptance condition | Fail-closed condition | Current lane result |
| --- | --- | --- | --- | --- |
| Metadata fail-closed | Team1 child work must carry `parentRoundId=a2a-r14-live-hardening-20260514T060000Z`, `originBrokerId=seoseo`, `parentRoundTotal=7`, and exact order/worker identity before terminal evidence is counted. | Team2 child work must carry the same `parentRoundId`, `originBrokerId=gwakga`, `parentRoundTotal=7`, exact order/worker identity, and bounded handoff/finalizer metadata linking back to Seoseo finalizer closeout. | Missing, mismatched, rewritten, truncated, or cross-team-swapped parent metadata is rejected; Start/running/provider accepted-send cannot substitute for PR/Done/Block. | `GO_CANDIDATE` for document shape; runtime enforcement remains owned by broker implementation lanes. |
| Secret-safe diagnostics | Diagnostic output may report presence/absence, config key names, redacted fingerprints, age/rotation status, and remediation steps for Team1 without printing secret values. | Team2 diagnostics must use the same redaction vocabulary and must not expose provider targets, token values, private host paths, raw payload dumps, or chat IDs. | Any secret/token value, authorization header, provider target, raw session dump, or host-private path in logs, issue comments, PR body, or artifacts is an immediate Block. | `PASS` for acceptance criteria; this lane did not read, move, disclose, rotate, or change secrets. |
| Hot-table health | Team1 broker health checks must be bounded/read-only and may surface aggregate row counts, oldest/newest age buckets, stale-risk thresholds, and degraded/no-go status. | Team2 broker health checks must expose equivalent bounded/read-only health signals and parity thresholds for `gwakga` hot tables. | Production DB mutation, prune, migration, replay, ACK-state write, or unbounded table scan without approval is rejected. Health must degrade/no-go rather than hide stale-table risk. | `PASS` for no-live matrix; no DB mutation/prune/migration was performed. |
| Deploy-marker semantics | Team1 workers/runners must treat first-class deploy marker files such as `.deploy-source-sha` as deployment provenance, not as misleading dirty-worktree evidence. | Team2 workers/runners must apply the same deploy-marker semantics so `gwakga` lanes distinguish deploy provenance from uncommitted source changes. | A deploy marker alone must not trigger a false dirty warning; a real source diff must still be reported. No deployment/restart/reload is authorized by the marker. | `PASS` for acceptance criteria; no deploy/restart/reload was performed. |
| Receipt/ACK boundaries | Team1 status must label provider accepted-send and provider message id as non-ACK evidence only. | Team2 status must use the same vocabulary and must not promote message-id evidence into requester-visible receipt, operator-visible receipt, terminal ACK, terminal-outbox ACK, or approval. | Any UI, log, comment, matrix, or Terminal Brief that calls provider accepted/message-id an ACK, read receipt, visibility proof, or approval is rejected. | `PASS` for documented boundary; provider accepted/message-id evidence is non-ACK. |
| No live approval-sensitive actions | Team1 lanes may publish code/docs/tests evidence only unless separate explicit approval names the exact deploy/restart/send/DB/ACK/replay/release/secret action. | Team2 lanes follow the same rule; this soonwook lane is documentation/test evidence only. | Unapproved production deploy/restart/reload, live provider send, DB mutation, terminal ACK/replay, historical outbox replay, release/tag, secret rotation, repo visibility change, or force-push is a Block. | `PASS` for this lane; no live approval-sensitive action was taken. |

## GO / NO-GO semantics

| Aggregate state | Required evidence | Allowed closeout text |
| --- | --- | --- |
| `GO_CANDIDATE / Acceptance matrix documented` | This matrix exists, local tests pass, runtime/bootstrap hygiene scan is clean, and no safety gate was violated. | This lane may say the R14 two-broker acceptance matrix is documented and locally validated. |
| `NO-GO / Waiting` | Any sibling lane is Start/running-only, any broker-specific runtime proof is missing, or the finalizer has not verified terminal PR/Done/Block evidence across all seven lanes. | Say parent finalizer closeout remains waiting; do not claim full R14 completion. |
| `BLOCK` | Metadata mismatch, secret leak, unapproved live action, DB mutation, terminal ACK/replay, raw runtime evidence leak, or OpenClaw context artifact contamination. | Stop and report the exact gate and offending repo-relative/artifact-relative paths. |

Current decision: **`GO_CANDIDATE / Acceptance matrix documented` for the Team2/Soonwook R14 matrix only.** Parent R14 closeout remains **`NO-GO / Waiting`** until all seven lanes publish terminal PR, Done, or Block evidence and the Seoseo finalizer verifies Team1/Team2 parity, broker-specific runtime behavior, and no approval-sensitive actions.

## Runtime/bootstrap and artifact hygiene gate

Before PR, Done, or Block evidence publication, fail closed if any OpenClaw runtime/bootstrap context file would enter the branch diff, PR body, issue comments, or artifact bundle. Offending paths must be reported exactly, including:

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `.openclaw/**`

Mentioning these names as a deny-list policy is allowed. Including their contents, raw session dumps, host-private paths, provider payloads, chat IDs, token values, authorization headers, or OpenClaw cache-boundary content is not allowed.

## Local validation commands

```bash
npm run check:team2-soonwook-r14-two-broker-acceptance-matrix
npm run check:message-id-ack-boundary
npm run check:layout
git diff --name-only -- . ':!node_modules'
find . \( -path './.git' -o -path './node_modules' -o -path './packages/*/node_modules' \) -prune -o \
  \( -name AGENTS.md -o -name SOUL.md -o -name USER.md -o -name TOOLS.md -o \
     -name HEARTBEAT.md -o -name IDENTITY.md -o -path './.openclaw/*' \) -print
```

## Closeout boundary

This lane may publish PR or Done evidence for the matrix and local validation only. It must not claim parent R14 closeout, production readiness, live canary authorization, deploy/reload approval, terminal ACK/read receipt, DB cleanup, release approval, source-public/visibility approval, or secret rotation completion.
