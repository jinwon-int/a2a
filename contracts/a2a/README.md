# A2A Shared Contracts

Public-safe contract skeletons for A2A protocol and task lifecycle behavior.

- [Task lifecycle](./task-lifecycle.md)
- [Terminal result semantics](./terminal-semantics.md)
- [Worker registration and read-model assumptions](./worker-registration.md)
- [Cancellation & idempotency](./cancellation-idempotency.md)
- [Broker-to-broker handoff protocol](./broker-handoff-protocol.md)

## Fixtures

Machine-readable reference fixtures for broker/plugin/runner validation:

- [Task lifecycle state transitions](./fixtures/task-lifecycle-states.json)
- [Terminal evidence examples](./fixtures/terminal-evidence-examples.json)

These documents intentionally avoid private endpoint names, provider identifiers, secret values, host-specific paths, and raw session evidence.
