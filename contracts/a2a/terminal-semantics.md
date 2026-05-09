# Terminal Result Semantics

A2A terminal results are operator-facing evidence, not provider delivery signals. These semantics are stable assumptions for broker, plugin, runner, and imported package behavior.

## Result types

- **Done**: the worker completed the requested non-PR task and posted redacted evidence.
- **PR**: the worker completed code or documentation changes and opened, or prepared for the runner to open, a pull request with required check evidence.
- **Block**: the worker intentionally stopped because the request was unsafe, impossible, unclear, or would require approval that was not present.

## Receipt levels

This contract defines four receipt levels in increasing order of assurance:

1. **accepted-send** — the provider accepted the send request and returned a message id. This is lifecycle evidence only; it does not prove delivery, rendering, or human observation. Provider message ids at this level are non-ACK evidence.

2. **requester-visible receipt** — the message appeared in a GitHub issue/PR comment observable by the requesting system. Stronger than accepted-send but still not terminal ACK.

3. **operator-visible receipt** — a human operator has explicitly confirmed seeing the Terminal Brief (manual operator receipt, Telegram delivery confirmation with operator acknowledgment). Acknowledged-delivery evidence, not terminal-outbox ACK.

4. **terminal ACK** — the terminal outbox ACK contract has been satisfied through an explicit ACK-safe evidence path. Only this level may mutate the terminal outbox ACK column.

## ACK boundary

- Provider-send success is receipt level 1 (accepted-send) only. A successful send only means the provider accepted a message for delivery. It is never requester-visible receipt (level 2), operator-visible receipt (level 3), or terminal ACK (level 4).
- Provider message ids are non-ACK lifecycle evidence. They are recorded as accepted-send evidence in routing decisions but never constitute terminal ACK.
- Terminal-outbox ACK mutation is not allowed without explicit operator approval.
- Workers must not treat live Telegram/provider sends outside GitHub comments as terminal evidence for monorepo readiness tasks.
- Evidence must be redacted: no secret values, private endpoint values, raw session dumps, or host-specific private paths.

## Safety gates

Terminal evidence must state whether the worker avoided:

- public repository visibility changes,
- production deploys or Gateway restarts,
- production database mutations,
- live provider/Telegram sends outside approved GitHub comments,
- terminal-outbox ACK mutation,
- secret rotation or secret value disclosure.
