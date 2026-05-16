# Team2/Soonwook R28 Libero validation — All-hands validation matrix for progress and capacity assignment

Issue: [a2a-plane#372](https://github.com/jinwon-int/a2a-plane/issues/372)  
Parent: [a2a-plane#370](https://github.com/jinwon-int/a2a-plane/issues/370) — R28 all-hands: Terminal Brief progress semantics and ACK boundary hardening  
Parent/origin broker: Seoseo (Team1) — Seoseo is the parent/origin broker and sole operator-facing parent Terminal Brief sender  
Handoff broker: Gwakga (Team2) — Gwakga validates cross-broker Terminal Brief progress semantics, ACK boundaries, and capacity profile validation  
Run: `a2a-r28-terminal-brief-progress-ack-allhands-20260516T134401Z`  
Lane: `soonwook` / Team2 libero validation (all-hands validation matrix for progress and capacity assignment)

This is a redacted, no-live validation artifact for the R28 all-hands validation cross-check. It performs repository and GitHub evidence review only. **It does not deploy, restart Gateway/broker/worker services, reload runtime config, send a live provider or Telegram canary, mutate/prune/migrate production databases, manually ACK or replay terminal-outbox rows, replay historical tasks, open a live cross-broker relay window, publish a release/tag, move or disclose secrets, force-push, rewrite history, change repository visibility, execute operator approval, claim operator-visible receipt, or issue a Terminal Brief ACK.**

## Decision

**R28 closeout is `NO-GO / Waiting`.** R28 source changes cannot be treated as final-GO until:

- Team1 implementation fix for Terminal Brief n/N progress semantics (a2a-broker#656) is published as terminal validation evidence with linked PR/Done/Block markers and passing CI. `parentRoundProgress` must represent completed canonical lanes count, not lane order/index. Retried/superseded tasks must not inflate the denominator or completed count.
- Done/receipt/provider accepted evidence remains distinct from terminal ACK across all cross-broker projections. The four-level receipt model (`providerAccepted` → `requesterVisibleReceipt` → `operatorVisibleReceipt` → `terminalAck`) is re-verified.
- Missing `sessionKey` produces a visible monitor error, satisfying the explicit-sessionKey contract rather than silently hiding poller state.
- Worker capacity profile schema (a2a-plane#369) has a documented schema definition and at least one read-only capability probe that does not expose secrets.
- Runtime bootstrap hygiene is confirmed: OpenClaw runtime context files (AGENTS.md, SOUL.md, USER.md, TOOLS.md, HEARTBEAT.md, IDENTITY.md, .openclaw/**, BOOTSTRAP.md, MEMORY.md, memory/**) are absent from branch diff, PR body, issue comments, and artifact evidence.
- Required tests pass and a separate explicit operator approval authorizes any runtime activation.

Safe current closeout for this lane: this PR documents the R28 all-hands validation matrix, Terminal Brief progress semantics verification, ACK boundary re-verification, sessionKey contract verification, worker capacity profile acceptance criteria, risk list, source-only GO/NO-GO decision, and explicit runtime activation blockers. It is not approval to merge implementation PRs, deploy/reload, send a provider canary, claim operator-visible receipt, or open a live relay window.

Source-public execution remains **`NO_GO`**. This is a **source-only** GO/NO-GO: it evaluates source changes, not runtime activation. Runtime activation requires a separate downstream approval after sibling lanes complete.

## R28 all-hands validation matrix

### Domain 1 — Terminal Brief progress semantics: parentRoundProgress must be completed-count, not lane order

| Gate | Required R28 behavior | Current evidence snapshot | Closeout state |
| --- | --- | --- | --- |
| parentRoundProgress vs parentRoundOrder separation | `parentRoundOrder` / `parentRoundIndex` means planned lane position only. `parentRoundProgress` must mean completed canonical lanes count. Terminal Brief n/N must answer "how much of the whole round is completed?" not "which lane order is this worker?" | Bug report [a2a-broker#656](https://github.com/jinwon-int/a2a-broker/issues/656) documents the issue. Fix targets `terminal-event-outbox.ts` where `parentRoundOrder` was reused as `parentRoundProgress`. | `NO-GO / Waiting` — fix PR not yet merged. |
| Retry/supersede exclusion | Failed original tasks superseded by retry are excluded from canonical progress. Denominator is not inflated by retry lanes. | Defined in a2a-broker#656 acceptance criteria. Not yet implemented in known codebase. | `NO-GO / Waiting` — retry exclusion not yet implemented. |
| Unknown progress safety | If completion count cannot be computed safely, render progress unknown or omit n/N; do not reuse lane order. | Defined in a2a-broker#656 acceptance criteria. | `NO-GO / Waiting` — fallback behavior not yet implemented. |
| Test coverage for progress semantics | Tests cover out-of-order completion, retries, and standalone 1/1 fallback. Cross-broker metadata validation still requires order/index where needed, but does not call it progress. | Defined in a2a-broker#656 acceptance criteria. | `NO-GO / Waiting` — test coverage not yet implemented. |

### Domain 2 — ACK boundary hardening: evidence types remain distinct

| Gate | Required R28 behavior | Current evidence snapshot | Closeout state |
| --- | --- | --- | --- |
| Four-level receipt model preserved | `providerAccepted`, `providerMessageId`, `sendStatus: accepted`, and `sendStatus: sent` remain accepted-send evidence only. `manual_operator_receipt` and `current_session_visible` are the only ACK-safe receipt types. | Contract [`terminal-evidence-ack-boundary.md`](https://github.com/jinwon-int/a2a-plane/blob/main/contracts/compatibility/terminal-evidence-ack-boundary.md) v0 Freeze. Conformance: `npm run check:message-id-ack-boundary`. | `PASS` — boundary contract is frozen and conformance test exists. Re-verify after any R28 changes. |
| Team1 n/N fix does not blur ACK boundary | The progress fix in `terminal-event-outbox.ts` must not promote `parentRoundProgress` into a new ACK signal or receipt level. | No known code change blurs this boundary. | `PASS (pending fix review)` — no evidence of boundary blur in current R28 scope. |
| Cross-broker projection semantics | Gwakga (Team2) projections must preserve the ACK boundary when carrying progress metadata. Handoff broker must not mix progress evidence with ACK or receipt types. | Existing cross-broker handoff protocol documented at [`broker-handoff-protocol.md`](https://github.com/jinwon-int/a2a-plane/blob/main/contracts/a2a/broker-handoff-protocol.md). | `PASS` — handoff contract is defined. Re-verify after any R28 changes. |

### Domain 3 — Explicit sessionKey contract: missing sessionKey must produce visible monitor error

| Gate | Required R28 behavior | Current evidence snapshot | Closeout state |
| --- | --- | --- | --- |
| Missing sessionKey visibility | A missing `sessionKey` in a poller/outbox context must produce a visible monitor error or otherwise satisfy the explicit-sessionKey contract. It must not silently hide poller state. | R27 parent [a2a-plane#364](https://github.com/jinwon-int/a2a-plane/issues/364) identified missing sessionKey as a risk. | `NO-GO / Waiting` — fix not yet verified in R28. |
| Explicit-sessionKey contract enforcement | Broker or plugin must reject or alert on outbox entries lacking a required `sessionKey` instead of silently dropping or skipping them. | No explicit enforcement contract identified in current codebase. | `NO-GO / Waiting` — enforcement contract not yet defined. |

### Domain 4 — Worker capacity profile: schema and read-only probe

| Gate | Required R28 behavior | Current evidence snapshot | Closeout state |
| --- | --- | --- | --- |
| Worker capacity schema defined | A read-only worker capability profile schema exists covering: CPU count/architecture, memory total/available, swap presence, disk free / Docker storage pressure, current load / active A2A containers, OpenClaw/Gateway/worker health, recent task runtime/timeout history, known lane strengths, max recommended lane size, preferred timeout/resource hints. | Issue [a2a-plane#369](https://github.com/jinwon-int/a2a-plane/issues/369) defines proposed scope. No schema document or contract merged yet. | `NO-GO / Waiting` — schema definition not yet merged. |
| Read-only probe exists | At least one read-only worker capability probe exists that collects profile data without exposing secrets, raw logs, or private endpoints. | No probe implementation identified in current R28 codebase. | `NO-GO / Waiting` — probe not yet implemented. |
| Assignment planning metadata | Broker or plane can output a capacity-aware recommendation. Dispatch does not silently ignore capacity metadata. Existing behavior remains available when no capacity profile exists. | Defined as acceptance criteria in a2a-plane#369. | `NO-GO / Waiting` — assignment planning not yet implemented. |

### Domain 5 — Cross-broker compatibility and validation (Team2 ownership)

| Gate | Required R28 behavior | Current evidence snapshot | Closeout state |
| --- | --- | --- | --- |
| Parent-round metadata invariants | Cross-broker `parentRoundId`, `originBrokerId`, `parentBrokerId`, `parentRoundTotal`, `handoffBrokerId`, `brokerOfRecord`, `projectionKey` are preserved. `parentRoundOrder` remains a lane position field; `parentRoundProgress` is separate. | Contract [`parent-terminal-brief-aggregation.md`](https://github.com/jinwon-int/a2a-plane/blob/main/contracts/a2a/parent-terminal-brief-aggregation.md) defines parent metadata invariants. Fixture [`terminal-brief-parent-origin-routing.json`](https://github.com/jinwon-int/a2a-plane/blob/main/fixtures/contract/terminal-brief-parent-origin-routing.json). | `PASS` — metadata fields are documented in contract and fixture. Re-verify after R28 n/N fix. |
| Parent-only notification ownership | Seoseo (Team1) is the only broker that sends operator-facing parent-round Terminal Brief notifications. Gwakga (Team2) does not render/send/update/retract/ACK the parent aggregate Brief. | Guard [`terminal-brief-routing-contract.ts`](https://github.com/jinwon-int/a2a-plane/blob/main/packages/broker/src/core/terminal-brief-routing-contract.ts) enforces OpenClaw-only outbound lifecycle routing. | `PASS` — guard exists. Re-verify after any R28 changes. |
| Capacity profile integration with handoff | Worker capacity metadata can be carried in handoff payloads for future assignment planning without exposing secrets. | No handoff capacity metadata integration defined yet. | `NO-GO / Waiting` — not yet implemented. |

## R28 lane snapshot

| Worker | Repo issue | Assigned scope | Snapshot |
| --- | --- | --- | --- |
| `soonwook` (Team2) | [a2a-plane#372](https://github.com/jinwon-int/a2a-plane/issues/372) | Cross-team validation matrix for R28 all-hands: Terminal Brief progress semantics (n/N = completed-count, not lane order), ACK boundary hardening, explicit sessionKey contract, worker capacity profile schema and probe, cross-broker compatibility, verification, and capacity profile validation. Risk list, blocker documentation, and source-only GO/NO-GO. | Start evidence plus this validation document and test. |

Start, queued, running, provider accepted-send, GitHub comment creation, and PR creation are not terminal lane evidence. Count a sibling lane as terminal only when it has an explicit PR, Done, or Block marker with linked checks/evidence.

## Risk list and runtime activation blockers

### Current risks

1. **Terminal Brief n/N progress semantic ambiguity persists until fix is merged**: The current `terminal-event-outbox.ts` code sets `parentRoundProgress` from `parentRoundOrder` (a2a-broker#656). Until the fix is implemented and merged, every Terminal Brief notification with n/N renders misleading lane-order-as-progress data. Operator trust in Terminal Brief progress depends on this fix.

2. **Retry/supersede inflation edge case**: If a task is retried, the retry lane could inflate both the denominator and completed count. The fix must ensure superseded originals are excluded from canonical progress, but the tracking mechanism (state flag, separate field, or idempotency check) has not yet been designed.

3. **Missing sessionKey silent failure**: R27 identified that missing `sessionKey` can silently hide poller state. If the fix is not validated before the next live round, operators may not see poller errors that should be visible.

4. **Worker capacity profile design incomplete**: Issue #369 defines high-level scope but no schema, contract, or probe has been implemented. Without a standardized profile, the broker cannot make capacity-aware assignment recommendations.

5. **Cross-broker progress projection consistency**: If Team1 fixes n/N semantics in `terminal-event-outbox.ts` but Team2 projections (handoff broker relay) map `parentRoundOrder` instead of `parentRoundProgress`, the cross-broker view may still show lane-order-as-progress. The handoff contract must be re-verified after the Team1 fix.

6. **Runtime bootstrap hygiene drift**: New contributors or tooling changes could reintroduce OpenClaw runtime/bootstrap context files (AGENTS.md, SOUL.md, USER.md, TOOLS.md, HEARTBEAT.md, IDENTITY.md, .openclaw/**, BOOTSTRAP.md, MEMORY.md, memory/**) into branch diffs, issue comments, or artifact evidence. The public-readiness scan catches tracked files, but untracked leaked context in GitHub comments or runner artifacts requires manual inspection per PR.

### Runtime activation blockers

The following are confirmed **hard blockers** for any future runtime activation (separate operator approval):

- Terminal Brief n/N progress fix (a2a-broker#656) is merged and the `parentRoundProgress` field renders completed-count not lane-order in at least one broker deployment.
- Done/receipt/provider accepted evidence remains distinct from terminal ACK; the four-level receipt model has been re-verified in any modified projection or outbox code.
- Missing `sessionKey` produces a visible monitor error; the explicit-sessionKey contract is enforced.
- Worker capacity profile schema is documented and at least one read-only probe exists.
- No sibling lane relies on Start-only evidence for final closeout.
- Runtime bootstrap hygiene is confirmed: no OpenClaw runtime/bootstrap context files are present in branch diff, PR body, issue comments, or artifact evidence.
- Operator approval is a separate downstream action not satisfied by any lane evidence alone.

## Source-only GO/NO-GO decision

**Current: `NO-GO / Waiting`.**

Transition to `GO` (source-only) requires:

- Terminal Brief n/N progress fix (a2a-broker#656) is published as terminal validation evidence with linked PR/Done/Block markers and passing CI. `parentRoundProgress` is confirmed as completed-count, not lane order.
- ACK boundary conformance test (`npm run check:message-id-ack-boundary`) remains green against any R28 code changes.
- Explicit sessionKey contract enforcement is documented and verified.
- Worker capacity profile schema is documented in a published contract or design document.
- No runtime/bootstrap hygiene leaks are detected in branch diff, PR body, issue comments, or artifact evidence.
- This validation lane's PR has passing CI and local `npm run check` results.

**`GO` is a source-only decision.** It does not authorize runtime activation, production deploy, broker restart, Gateway restart, DB mutation, live provider send, Terminal Brief ACK, relay window opening, or any other live action. Source execution remains `NO_GO` until a separate explicit operator approval is captured as a distinct downstream artifact.

## Required checks before R28 closeout

- Terminal Brief n/N progress fix (a2a-broker#656) is merged and the `parentRoundProgress` field is separated from `parentRoundOrder`. Completed-count semantics are confirmed in code review and test coverage.
- `npm run check:message-id-ack-boundary` remains green. No R28 change promotes accepted-send evidence to receipt or ACK level.
- Missing sessionKey contract: enforcement logic is documented and verified in at least one broker test or monitor output.
- Worker capacity profile schema is documented in a published contract or design document (e.g., `contracts/workforce/worker-capacity-schema.md` or similar).
- `npm run check:team2-final-go-no-go-semantics-libero` passes and the final GO/NO-GO semantics doc covers R28 lane boundaries.
- `npm run check` (full release gate) passes for this validation branch.
- This lane's validation test (`check-team2-soonwook-r28-allhands-validation-progress-capacity.test.mjs`) passes.
- No production deploy/restart/reload, live provider/Telegram send, DB mutation/prune/migration, Terminal Brief ACK/replay, historical outbox replay, release/tag, secret movement/disclosure, force-push/history rewrite, visibility change, or cross-broker relay window opening occurred in this validation lane.
- Branch diff, PR body, issue comments, and artifact evidence exclude OpenClaw runtime/bootstrap context files. Before PR creation, fail closed and report exact repo-relative or artifact-relative offending paths for any `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `.openclaw/**`, `BOOTSTRAP.md`, `MEMORY.md`, or `memory/**` file.

## Verification performed for this lane

- Inspected parent issue [a2a-plane#370](https://github.com/jinwon-int/a2a-plane/issues/370) (R28 all-hands: Terminal Brief progress semantics and ACK boundary hardening) and this issue [a2a-plane#372](https://github.com/jinwon-int/a2a-plane/issues/372).
- Inspected Terminal Brief n/N progress bug tracker [a2a-broker#656](https://github.com/jinwon-int/a2a-broker/issues/656) documenting the lane-order vs completed-count ambiguity in `terminal-event-outbox.ts`.
- Inspected worker capacity-aware assignment tracker [a2a-plane#369](https://github.com/jinwon-int/a2a-plane/issues/369) for proposed scope and acceptance criteria.
- Inspected R27 parent [a2a-plane#364](https://github.com/jinwon-int/a2a-plane/issues/364) for missing sessionKey risk identification.
- Inspected terminal evidence ACK boundary contract at [`contracts/compatibility/terminal-evidence-ack-boundary.md`](https://github.com/jinwon-int/a2a-plane/blob/main/contracts/compatibility/terminal-evidence-ack-boundary.md) and its conformance test.
- Inspected parent-terminal-brief-aggregation contract at [`contracts/a2a/parent-terminal-brief-aggregation.md`](https://github.com/jinwon-int/a2a-plane/blob/main/contracts/a2a/parent-terminal-brief-aggregation.md) for parent-round metadata invariants.
- Inspected cross-broker routing fixture [`fixtures/contract/terminal-brief-parent-origin-routing.json`](https://github.com/jinwon-int/a2a-plane/blob/main/fixtures/contract/terminal-brief-parent-origin-routing.json).
- Inspected broker Terminal Brief routing guard [`terminal-brief-routing-contract.ts`](https://github.com/jinwon-int/a2a-plane/blob/main/packages/broker/src/core/terminal-brief-routing-contract.ts).
- Inspected existing libero validation artifacts: R23 (`team2-soonwook-r23-terminal-brief-taskflow-monorepo-libero.md`), R22 (`team2-soonwook-r22-broker-lightweight-libero.md`), R20 (`team2-soonwook-r20-libero-go-nogo-retry.md`), and earlier R16/R15/R13/R9/R8 validation artifacts for pattern reference.
- Reviewed parent-round metadata fields (`parentRoundId`, `originBrokerId`, `parentBrokerId`, `parentRoundTotal`, `parentRoundOrder`, `handoffBrokerId`, `brokerOfRecord`, `projectionKey`) and confirmed they are documented in contract and fixture.
- Confirmed `team2-final-go-no-go-semantics-libero.md` and its test exist for Team2 GO/NO-GO semantics.
- Confirmed `npm run check:message-id-ack-boundary` exists and enforces the ACK boundary contract.
- Added a local validation test that fails if required R28 gates, Terminal Brief progress semantics, ACK boundary hardening, explicit sessionKey contract, worker capacity profile acceptance criteria, risk list, source-only GO/NO-GO semantics, runtime activation blockers, ACK/receipt separation, or bootstrap hygiene language are removed.
- Confirmed this patch adds documentation/test evidence only and does not create runtime/bootstrap files in the repository.
