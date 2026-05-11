# Team1/yukson Terminal Brief activation libero validation

Run: `terminal-brief-activation-20260511T080211Z`  
Parent: [a2a-plane#241](https://github.com/jinwon-int/a2a-plane/issues/241)  
Lane: Team1/yukson, [a2a-plane#243](https://github.com/jinwon-int/a2a-plane/issues/243)  
Snapshot: `2026-05-11T08:06:28Z`

This is a redacted libero activation/validation matrix for the Terminal Brief practical activation round. It validates the decision surface only. It does not deploy a broker, restart Gateway, enable core Gateway config, perform a live provider send, record Terminal Brief ACK, mutate production data, change secrets, rewrite history, force-push, release, or change repository visibility.

## Current decision

**Decision: `NO-GO / Waiting`.** At this snapshot the parent and all activation lanes have dispatch/Start evidence, but no linked terminal PR, Done, or Block evidence proves Docker broker deployment, plugin-level Gateway notification bridge configuration, canary smoke/receipt evidence, or cross-team parity completion. A Start marker proves work began; it is not activation evidence.

A later `GO_CANDIDATE` may be presented only after every required gate below has redacted evidence and a separate operator approval explicitly authorizes the one fresh canary provider send. Technical readiness, provider accepted-send, message ids, or Terminal Brief text must not be treated as operator-visible receipt or terminal-outbox ACK.

## Evidence snapshot

| Lane / source | Required evidence for this round | Snapshot evidence | Validation result |
| --- | --- | --- | --- |
| Parent dispatch — [a2a-plane#241](https://github.com/jinwon-int/a2a-plane/issues/241) | Round lane list, safety gates, and previous canary context. | Dispatch comment: https://github.com/jinwon-int/a2a-plane/issues/241#issuecomment-4418651459. Parent body records previous `a2a-terminal-brief-live-canary` service attempts failed with `404` because the broker API was not running. | Pass for dispatch context only; does not prove activation. |
| Broker deployment lane — [a2a-plane#242](https://github.com/jinwon-int/a2a-plane/issues/242) | Docker-only broker runbook/deploy evidence plus terminal-outbox activation evidence. | Start evidence only: https://github.com/jinwon-int/a2a-plane/issues/242#issuecomment-4418660262. | `NO-GO` until terminal PR/Done/Block evidence lands. |
| Plugin bridge lane — [openclaw-plugin-a2a#269](https://github.com/jinwon-int/openclaw-plugin-a2a/issues/269) | Plugin-level `operatorEvents` and notification bridge configuration evidence without core Gateway config mutation. | Start evidence only: https://github.com/jinwon-int/openclaw-plugin-a2a/issues/269#issuecomment-4418659643. | `NO-GO` until terminal PR/Done/Block evidence lands. |
| Runner canary lane — [a2a-docker-runner#204](https://github.com/jinwon-int/a2a-docker-runner/issues/204) | Fresh canary task, at-most-once live send guard, receipt evidence, and artifact redaction. | Start evidence only: https://github.com/jinwon-int/a2a-docker-runner/issues/204#issuecomment-4418661050. | `NO-GO` until terminal PR/Done/Block evidence lands. |
| Broker parity lane — [a2a-broker#493](https://github.com/jinwon-int/a2a-broker/issues/493) | Cross-broker terminal receipt parity and schema/ACK boundary validation. | Start evidence only: https://github.com/jinwon-int/a2a-broker/issues/493#issuecomment-4418660566. | `NO-GO` until terminal PR/Done/Block evidence lands. |
| Runner parity lane — [a2a-docker-runner#205](https://github.com/jinwon-int/a2a-docker-runner/issues/205) | Independent runner canary parity and artifact evidence validation. | Start evidence only: https://github.com/jinwon-int/a2a-docker-runner/issues/205#issuecomment-4418658779. | `NO-GO` until terminal PR/Done/Block evidence lands. |
| Libero parity lane — [a2a-plane#244](https://github.com/jinwon-int/a2a-plane/issues/244) | Independent Team2/Gwakga libero parity assessment. | Start evidence only: https://github.com/jinwon-int/a2a-plane/issues/244#issuecomment-4418674993. | `NO-GO` until terminal PR/Done/Block evidence lands. |
| Team1/yukson lane — [a2a-plane#243](https://github.com/jinwon-int/a2a-plane/issues/243) | This activation matrix and regression guard. | Start marker: https://github.com/jinwon-int/a2a-plane/issues/243#issuecomment-4418671727. | Pass for validation shape only; aggregate remains `NO-GO / Waiting`. |

## Activation gate checklist

| Gate | Pass condition | Fail / NO-GO condition | Current status |
| --- | --- | --- | --- |
| G1. Broker Docker deployment | Bounded Docker container deployment evidence names image/ref, health endpoint, and no system service installation. | Broker API unavailable, non-Docker service install, missing health proof, or unredacted host/secrets evidence. | `NO-GO`: no terminal deploy evidence yet; prior canary attempts failed `404` while broker API was not running. |
| G2. Terminal-outbox readiness | Terminal-outbox schema/init and read/reconcile path are proven on the deployed broker without production DB mutation outside the approved canary path. | Missing schema proof, direct production DB mutation, ACK before receipt, or replay/dedupe gap. | `NO-GO`: waiting on broker lane terminal evidence. |
| G3. Gateway notification bridge | Plugin-level `a2a-broker-adapter` operator events and notification config are enabled only for the proof window; core Gateway config remains untouched. | Core config change, stale target activated accidentally, bridge disabled/missing, or runtime adapter unavailable. | `NO-GO`: waiting on plugin lane terminal evidence. |
| G4. Operator approval and one-shot send guard | Separate operator approval names the canary task and authorizes exactly one live provider send; replay/idempotency guard prevents duplicates. | No explicit approval, approval inferred from comments/tests, more than one send possible, or stale task/backlog send allowed. | `NO-GO`: no approval evidence; live send must not run. |
| G5. Fresh canary smoke | A newly created canary task reaches Terminal Brief send attempt once, with artifact evidence redacted and bound to the run. | Reusing old task, sending backlog rows, missing artifact digest, provider error, or more than one provider send. | `NO-GO`: waiting on runner canary evidence. |
| G6. Receipt evidence | Current-session/user-visible or explicit manual operator receipt is linked separately from provider accepted-send. | Provider `accepted`, `sent`, message id, or Gateway outbound success is the only proof. | `NO-GO`: no operator-visible receipt proof. |
| G7. Terminal ACK eligibility | Manual ACK or ACK-safe receipt confirmation occurs only after G6 and leaves bounded evidence. | ACK before receipt, automatic ACK from provider success, or ACK without replay/reconciliation proof. | `NO-GO`: no ACK should be recorded. |
| G8. Rollback/restoration | Broker canary container, plugin bridge, and notification opt-in are restored to no-live/off state; unacked rows remain replayable; closeout evidence is posted. | Bridge left enabled, container left as unintended live service, ACK/cursor advanced without receipt, or no rollback verification. | `NO-GO`: rollback cannot be proven until activation steps exist. |
| G9. Cross-team parity/libero | Team2 broker/runner/libero evidence agrees on receipt boundary, one-shot safety, rollback, and final state. | Missing parity evidence or disagreement on accepted-send versus ACK semantics. | `NO-GO`: Team2 lanes are Start-only at snapshot. |

## GO/NO-GO decision matrix

| Aggregate state | Required gates | Allowed closeout |
| --- | --- | --- |
| `GO` | G1-G9 all pass with redacted terminal evidence; operator approval is separate and explicit; live provider send count is exactly one for the fresh canary; receipt and ACK evidence are separate. | Done evidence may say Terminal Brief activation can proceed or completed for the named canary only. |
| `GO_CANDIDATE / Needs operator approval` | G1-G3 and G8-G9 pass, canary plan is ready, but G4 approval has not been granted. | Done/PR evidence may request approval; it must not send or ACK. |
| `NO-GO / Waiting` | Any required lane has Start-only/missing evidence, prior canary failure is unresolved, receipt proof is absent, or parity is incomplete. | Current state. Post PR/Done with this matrix or Block if no safe artifact is needed. |
| `BLOCK` | Any safety gate is violated: non-Docker deploy, core config mutation, duplicate provider send, unapproved live send, DB/secret/history/release/visibility change, raw private evidence leak, or runtime/bootstrap context files entering branch/artifacts. | Stop activation, run rollback/restoration if anything changed, and post Block with exact offending repo-relative paths or violated gates. |

## Rollback / abort procedure

Use this procedure if any activation gate fails or if an operator stops the canary window. Steps must be evidenced with redacted output only.

1. **Stop live sends first.** Disable the plugin-level notification bridge or set notification opt-in off. Do not retry provider delivery until the operator explicitly re-approves a new fresh canary.
2. **Preserve receipt truth.** Do not ACK terminal-outbox rows from provider accepted-send, message id, or Gateway outbound success. Leave unconfirmed rows unacked and replayable for reconciliation.
3. **Remove bounded broker runtime.** Stop/remove only the Docker canary broker container created for this activation. Do not install, stop, or replace any system service.
4. **Restore Gateway/plugin state.** Revert only the plugin-level `operatorEvents`/notification settings changed for the proof window; do not mutate core Gateway config.
5. **Verify no duplicate send.** Confirm the canary task id/idempotency key produced at most one provider send attempt and that no backlog/historical task was sent.
6. **Post terminal evidence.** Post Done if rollback restored no-live cleanly; post Block if any safety gate was violated, receipt is ambiguous, or exact offending paths/artifacts must be reported.

## Previous canary failure evidence

- Parent [a2a-plane#241](https://github.com/jinwon-int/a2a-plane/issues/241) records prior `a2a-terminal-brief-live-canary` service attempts on 2026-05-10 failed with `404` because the broker API was not running. That is deployment readiness evidence for `NO-GO`, not a receipt or ACK attempt.
- Existing plugin receipt policy cites a prior live-send discrepancy in `jinwon-int/a2a-broker#241`, comment `4362567686`: Gateway/provider success did not prove operator receipt. This remains a standing reason to keep provider accepted-send and Terminal Brief ACK separate.
- The current round has not produced new terminal canary evidence in this snapshot. Reusing the previous failed canary or treating it as a successful smoke test is not allowed.

## Runtime/bootstrap and artifact hygiene

Before PR creation or Done evidence, fail closed if any OpenClaw runtime/bootstrap context file would enter the branch diff, PR body, issue comments, or artifact bundle. Offending paths must be reported exactly, including `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, or `.openclaw/**`.

Evidence must also avoid secrets, provider targets, chat IDs, raw session dumps, private host paths, raw task payloads, and unredacted logs.

## Safe closeout

The safe closeout for this lane is a PR/Done marker that says the activation matrix is documented and the current aggregate decision remains **`NO-GO / Waiting`**. Refresh this libero matrix last after sibling lanes post terminal evidence; do not advance to `GO` while any deploy, config, canary, receipt, rollback, or parity gate remains missing or disputed.
