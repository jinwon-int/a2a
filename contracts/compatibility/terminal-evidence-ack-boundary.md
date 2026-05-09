# Terminal Evidence ACK Boundary Compatibility (v0 Freeze)

> **v0 Freeze (2026-05-09):** The accepted-send non-ACK boundary is frozen.
> `providerMessageId`, `providerAccepted`, `sendStatus: accepted`, and `sendStatus: sent`
> are locked as non-ACK signals. Only `manual_operator_receipt` and `current_session_visible`
> are permitted ACK-safe receipt types. No new receipt types without a v0→v1 plan.

This compatibility contract keeps terminal evidence separate from provider delivery acceptance.
It is intentionally fixture-only: it does not perform live sends and does not mutate terminal-outbox ACK state.

## Rules

- `providerMessageId`, `providerAccepted`, `sendStatus: accepted`, and `sendStatus: sent` are accepted-send evidence only.
- Accepted-send evidence may support a Done/PR/Block evidence trail, but it must not be promoted into terminal ACK evidence.
- Terminal ACK eligibility requires one of the explicit ACK-safe receipt proofs:
  - `manual_operator_receipt`
  - `current_session_visible`
- Even when a fixture says terminal ACK may be recorded, the fixture itself must keep `terminalOutboxAckMutated: false`.

## Fixture

The independent fixture lives at:

- `fixtures/terminal-evidence/accepted-send-non-ack.json`

The conformance check lives at:

- `test/conformance/check-terminal-evidence-ack-boundary.mjs`
