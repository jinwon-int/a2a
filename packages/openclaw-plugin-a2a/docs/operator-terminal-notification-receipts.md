# Operator terminal notification receipt policy

Terminal broker/outbox notifications are only considered acknowledged after a receipt-confirmed delivery.

## Ack rule

The plugin **must not** advance/persist the operator-event cursor for a terminal notification merely because a Telegram/Gateway provider call returned success. Provider success only means the message was accepted by the transport path; it does not prove the operator saw it.

A terminal notification may be acknowledged only when one of these confirmations exists:

1. **Current-session/user-visible receipt** — the channel adapter returns a receipt indicating the message is visible in the current operator session, for example `delivery.currentSessionVisible: true`, `receipt.userVisible: true`, or `confirmation.source: "current_session_visible"` with a delivered/confirmed status.
2. **Manual operator receipt** — an explicit operator/manual confirmation is present, for example `receipt.manualReceiptConfirmed: true`, `operatorReceiptConfirmed: true`, or `confirmation.source: "manual_operator_receipt"` with a delivered/confirmed status.

Dry-run projection remains local and may advance dry-run state because it never claims live Telegram receipt.

### Accepted-vs-acknowledged compatibility

If OpenClaw/core channel receipts expose separate `accepted` and `acknowledged` fields, the plugin treats them as different states. `accepted: true`, `providerAccepted: true`, or `status: "accepted"`/`"sent"` only means the provider/Gateway accepted the send request, so it must not become a terminal-outbox ACK by itself. The same receipt must also carry an explicit operator-visible acknowledgement such as `acknowledged: true` plus `currentSessionVisible: true`, or one of the manual receipt shapes above.

The plugin may retain Gateway/outbound lifecycle evidence for best-effort Terminal Brief notices as `accepted_non_ack`, `sent_non_ack`, or `unknown_non_ack`, but those states are diagnostic only. They are safe to surface in CLI/Gateway status as notice evidence and must not advance live notification cursors or ACK terminal outbox records until current-session-visible receipt proof is available after `openclaw/openclaw#78261`.

### Monitor/status projection states

`a2a.monitor.status` projects receipt gaps into operator-safe states: `accepted`, `sent`, `provider-delivered-if-known`, `operator-visible`, `timed_out`, `stale`, and `failed`. Only `operator-visible` with current-session/manual confirmation is ACK-eligible. Provider `accepted`, `sent`, or delivery-if-known states remain visible as pending receipt gaps so transport success is never misreported as operator receipt.

## Preflight before Gateway restart or live smoke

Per-worker terminal/completion Telegram sends are disabled by default. The preferred operator flow is to read the broker `/operator/task-report` endpoint and summarize the round once from the main operator session; do not add cron or worker-side Telegram sends.

Before asking an operator to restart Gateway or run a live Telegram smoke, run a dry preflight that verifies all three readiness layers without sending a message or acknowledging terminal outbox:

1. **Plugin activation** — `plugins.entries.a2a-broker-adapter.enabled=true` or the plugin is present in the allowlist.
2. **Operator-event bridge** — `plugins.entries.a2a-broker-adapter.config.operatorEvents.enabled=true`.
3. **Notification opt-in and target/runtime** — `operatorEvents.notification.enabled=true`, `operatorEvents.notification.to` (or `chatId`) resolves to the intended channel target, and the Gateway runtime can load that channel's outbound adapter. Stale `to`/`chatId`/`channel` values are ignored while either enabled gate is false.

The exported `preflightA2AOperatorNotificationRuntime(config, runtime)` helper is intentionally receipt-safe: it may resolve the runtime adapter, but it must not call `sendText`, send Telegram, restart Gateway, or post a terminal-outbox ACK. Its `notificationTarget` projection distinguishes `ready`, `disabled`, `missing`, and `blocked` so operators can tell whether a configured target is active, explicitly disabled/stale, absent, or gated by plugin/operator-events activation. Any failing check means live-send, Gateway restart, and real ACK remain operator approval gates; report the exact failed prerequisite instead of proceeding.

## Runbook

If live Telegram/Gateway send reports success but the operator does not receive the message:

1. Treat the terminal notification as **unacknowledged**.
2. Do not manually advance the stored operator-event cursor unless the operator confirms receipt.
3. Re-run in dry-run/projection mode first to verify envelope rendering and dedupe.
4. Resume live delivery only after the channel adapter can produce one of the confirmed receipt shapes above, or after the operator explicitly records manual receipt confirmation.
5. Keep the broker terminal event replayable until the confirmed receipt is recorded.

## Evidence

This policy was added after the live-send discrepancy captured in `jinwon-int/a2a-broker#241`, comment `4362567686`: Gateway reported success, but the operator did not receive the Telegram message. The fix prevents notifier code from treating provider/Gateway acceptance as broker terminal-outbox acknowledgement.

## Plugin-owned terminal outbox polling

For live broker terminal delivery, the plugin notifier polls `GET /a2a/tasks/terminal-outbox` with `reconcile_unacked=true`, renders each compact `task.terminal` record, and only posts `POST /a2a/tasks/terminal-outbox/ack` after the outbound adapter returns a current-session/user-visible receipt or an explicit manual operator receipt. Provider/Gateway send success without that receipt leaves the outbox record unacked and replayable on the next reconcile poll.
