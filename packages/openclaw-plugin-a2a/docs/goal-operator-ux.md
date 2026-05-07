# Goal-level operator UX for A2A orchestration

A2A goal UX is the plugin-side operator surface for a persistent objective that may span multiple broker child tasks. It is intentionally separate from `sessions_send`, subagent runs, and individual task status.

## Proposed plugin method surface

The OpenClaw-facing surface should be plugin/gateway methods rather than implicit slash-command behavior:

| Method | Scope | Purpose | Safety posture |
| --- | --- | --- | --- |
| `a2a.goal.set` | `operator.write` | Create or replace the active goal with title, acceptance summary, budget, and initial child task hints. | Records intent only; no production deploy/restart/live send/ACK. |
| `a2a.goal.status` | `operator.read` | Return the active goal operator summary. | Fails loud if no visible summary can be produced. |
| `a2a.goal.pause` | `operator.write` | Pause continuation with an operator-visible reason. | Does not cancel existing broker tasks unless separately requested. |
| `a2a.goal.resume` | `operator.write` | Resume a paused goal. | Reopens planning/dispatch eligibility only; still honors approvals. |
| `a2a.goal.clear` | `operator.write` | Clear the active goal from the operator surface. | Does not delete task history or evidence. |
| `a2a.goal.attach_task` | `operator.write` | Attach a broker child task and optional GitHub/artifact/evidence links to a goal. | Links evidence; does not infer goal achievement. |
| `a2a.goal.summarize` | `operator.read` | Build a concise operator summary for a supplied goal read model. | Returns `budget_limited` on budget exhaustion; never converts it to success. |

This PR adds the shared summary builder (`buildA2AGoalOperatorSummary`) that these methods can use while the broker goal read model is finalized.

## Goal states and operator summaries

Goal states are goal-level states, not child task states:

- `active` — goal is still being pursued; completed child tasks are evidence, not final achievement.
- `paused` — continuation is intentionally stopped until resumed.
- `blocked` — goal needs a blocker resolved or explicit operator approval.
- `achieved` — achievement was explicitly reported by the goal controller/operator, not inferred from successful tasks alone.
- `unmet` — goal stopped without being achieved.
- `budget_limited` — budget was exhausted; this is a terminal/non-success condition for the current budget window.
- `cleared` — goal was removed from the active operator surface.

Every visible summary must include:

- goal id, title, state, headline, and human-readable summary
- next action and/or stop reason when present
- task progress as evidence (`succeeded/total`) with wording that distinguishes task success from goal achievement
- child task links containing broker task id plus any GitHub issue, GitHub PR, artifact, or evidence URL

If the visible summary text is missing, the plugin must throw/return an explicit error instead of an empty successful response.

## Difference from existing surfaces

- `sessions_send` is a message dispatch path. A goal is a persistent objective around dispatches and child tasks; setting or showing a goal must not send Telegram messages or ACK terminal outbox events by itself.
- Subagent runs are execution attempts. A goal may launch or observe many subagent-backed tasks, but a completed subagent run is only evidence.
- `a2a.task.status` reports one broker task lifecycle. Goal status reports whether the operator objective is active, paused, blocked, achieved, unmet, or budget-limited across child tasks.

## Safety invariants

Goal continuation must not imply automatic production deploys, restarts, live Telegram sends, or real terminal-outbox ACKs without explicit approval. Budget exhaustion is represented as `budget_limited`, never as success.
