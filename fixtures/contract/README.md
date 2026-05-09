# Contract conformance fixtures

These public-safe fixtures exercise the A2A Plane contracts without depending on a live broker, worker, provider, database, or terminal outbox. They are intended for cross-team compatibility tests and should remain independent from `examples/local/**` quickstart implementations.

Fixture set:

- `task-lifecycle.json` — lifecycle states, allowed transitions, and a complete PR-path event trace.
- `worker-registration-capabilities.json` — worker registration and capability read-model assumptions.
- `cancellation-idempotency.json` — duplicate request, cancellation, and terminal replay behavior.
- `terminal-evidence.json` — redacted PR, Done, and Block terminal evidence examples.
- `gwakga-cross-broker-handoff.json` — synthetic Seoseo-to-Gwakga handoff proof for the Team2 lane; it records Gwakga as broker of record, shows that Seoseo does not directly dispatch Team2 workers, lists no-live validation commands, and calls out visibility gaps around accepted-send/non-ACK evidence.

Do not add secrets, host-specific paths, OpenClaw runtime/bootstrap files, raw session dumps, live provider payloads, or terminal ACK mutation records to these fixtures.
