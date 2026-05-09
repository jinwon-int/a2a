# Contract conformance fixtures

These public-safe fixtures exercise the A2A Plane contracts without depending on a live broker, worker, provider, database, or terminal outbox. They are intended for cross-team compatibility tests and should remain independent from `examples/local/**` quickstart implementations.

Fixture set:

- `task-lifecycle.json` — lifecycle states, allowed transitions, and a complete PR-path event trace.
- `worker-registration-capabilities.json` — worker registration and capability read-model assumptions.
- `cancellation-idempotency.json` — duplicate request, cancellation, and terminal replay behavior.
- `terminal-evidence.json` — redacted PR, Done, and Block terminal evidence examples.

Do not add secrets, host-specific paths, OpenClaw runtime/bootstrap files, raw session dumps, live provider payloads, or terminal ACK mutation records to these fixtures.
