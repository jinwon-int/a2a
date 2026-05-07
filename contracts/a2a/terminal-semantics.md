# Terminal Result Semantics

A2A terminal results are operator-facing evidence, not provider delivery signals. These semantics are stable assumptions for broker, plugin, runner, and imported package behavior.

## Result types

- **Done**: the worker completed the requested non-PR task and posted redacted evidence.
- **PR**: the worker completed code or documentation changes and opened, or prepared for the runner to open, a pull request with required check evidence.
- **Block**: the worker intentionally stopped because the request was unsafe, impossible, unclear, or would require approval that was not present.

## ACK boundary

- Provider-send success is not ACK evidence. A successful send only means the provider accepted a message for delivery.
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
