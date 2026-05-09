# A2A Shared Contracts (v0 Freeze)

Public-safe contract skeletons for A2A protocol and task lifecycle behavior.

> **v0 Freeze (2026-05-09):** These contracts are frozen as the Contract v0 baseline for A2A Plane cross-broker compatibility.
> The v0 surface includes task lifecycle states/transitions, worker registration read-model assumptions,
> cancellation & idempotency semantics, terminal evidence result types, and the accepted-send non-ACK boundary.
> No new states, result types, or receipt levels may be added without a v0→v1 compatibility plan.

## Contracts

- [Task lifecycle](./task-lifecycle.md)
- [Terminal result semantics](./terminal-semantics.md)
- [Worker registration and read-model assumptions](./worker-registration.md)
- [Cancellation & idempotency](./cancellation-idempotency.md)
- [Broker-to-broker handoff protocol](./broker-handoff-protocol.md)

## Compatibility

- [Terminal evidence ACK boundary](../compatibility/terminal-evidence-ack-boundary.md)

## Fixtures

Machine-readable reference fixtures for broker/plugin/runner validation:

### Contract v0 fixtures

- [Task lifecycle state transitions](../../fixtures/contract/task-lifecycle.json)
- [Worker registration & capabilities](../../fixtures/contract/worker-registration-capabilities.json)
- [Cancellation & idempotency scenarios](../../fixtures/contract/cancellation-idempotency.json)
- [Terminal evidence examples](../../fixtures/contract/terminal-evidence.json)

### Compatibility fixtures

- [Accepted-send non-ACK boundary](../../fixtures/terminal-evidence/accepted-send-non-ack.json)

## Conformance

- `node test/conformance/check-contract-fixtures.mjs` — validates all four contract v0 fixtures
- `node test/conformance/check-terminal-evidence-ack-boundary.mjs` — validates accepted-send non-ACK fixture

These documents intentionally avoid private endpoint names, provider identifiers, secret values, host-specific paths, and raw session evidence.
