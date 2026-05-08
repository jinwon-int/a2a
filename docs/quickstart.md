# Five-minute local quickstart

This guide is the external-reader smoke path for a disposable local A2A broker plus a dummy/echo worker. It must not be pointed at production brokers, production databases, live provider transports, Telegram accounts, or terminal outboxes.

## What this quickstart proves

- The public monorepo layout, package metadata, and readiness checks are usable from a fresh checkout.
- A reader can identify the local broker, worker, plugin, contract, and known-limitation entry points without private context.
- Missing local-only broker or worker commands are blockers to document, not reasons to use production substitutes.

## Prerequisites

- Node.js 22 or newer
- npm matching the lockfile
- a local checkout of this repository

Install dependencies without lifecycle scripts:

```bash
npm ci --ignore-scripts --include=dev
```

## 1. Run the local broker

From the broker workspace, use the package's documented local start command when available:

```bash
cd packages/broker
npm ci --ignore-scripts --include=dev
npm run build
npm run start:local
```

Use only loopback URLs such as `http://127.0.0.1:8787`. If `start:local` is not present in your checkout, stop here and record the blocker. Do not substitute a production broker or restart a managed service.

## 2. Start a dummy or echo worker

Use a local worker fixture if the broker package provides one:

```bash
cd packages/broker
LOCAL_A2A_BROKER_URL=http://127.0.0.1:8787 \
LOCAL_A2A_WORKER_ID=<local-echo-worker> \
npm run worker:echo
```

If the echo-worker command is absent, the current blocker is: **no public-safe dummy worker entrypoint is documented in this monorepo yet**. That should be fixed before public release rather than using a live worker as a workaround.

## 3. Connect the OpenClaw plugin locally

Use placeholder-only configuration for local development:

```json
{
  "plugins": {
    "a2a-broker-adapter": {
      "enabled": true,
      "brokerUrl": "http://127.0.0.1:8787",
      "authToken": "<local-dev-token>",
      "requesterId": "<local-openclaw-node>",
      "defaultTargetWorker": "<local-echo-worker>"
    }
  }
}
```

Never include real tokens, private hostnames, provider identifiers, Telegram chat IDs, or operator-specific paths in examples, screenshots, issue comments, or PR evidence.

## 4. Submit a no-live test task

Use a no-live task message such as:

```text
Echo this message and return Done evidence only. Do not send provider messages, do not ACK terminal outbox items, and do not touch production systems.
```

Expected terminal evidence is one of:

- `Done` with a short echoed result
- `Block` with a clear local setup blocker

## 5. Verify public-readiness checks

Return to the repository root:

```bash
npm run check
```

Then review the docs that bound external claims:

- [`contracts/compatibility/matrix.md`](../contracts/compatibility/matrix.md) for supported baseline evidence
- [`docs/known-limitations.md`](./known-limitations.md) for alpha limits and NO-GO assumptions
- [`docs/public-readiness.md`](./public-readiness.md) for the current visibility decision gate

The public-readiness scan must remain clean before any PR is opened.

## Safety checklist

Before sharing evidence, confirm:

- repository visibility remains private
- no production deploy, Gateway/broker/worker restart, database mutation, provider send, Telegram send, terminal-outbox ACK, secret rotation, history rewrite, or force push occurred
- evidence is redacted and does not include raw session dumps, private paths, hostnames, tokens, provider IDs, Telegram IDs, or OpenClaw runtime/bootstrap files
