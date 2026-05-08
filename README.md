# A2A Plane

[![ci](https://github.com/jinwon-int/a2a/actions/workflows/ci.yml/badge.svg)](https://github.com/jinwon-int/a2a/actions/workflows/ci.yml)

A2A Plane is the private release candidate for the broker, adapter plugin, Docker runner, shared contracts, and public-safe examples used by the A2A task flow.

> **Status:** private/public-readiness candidate. Do not make this repository public until every gate in [`docs/public-readiness.md`](docs/public-readiness.md) is closed and an operator explicitly approves the visibility change.

## What A2A Plane does

A2A Plane lets an operator hand a task to a broker, route it to a worker, and collect terminal evidence such as `Done`, `Block`, or a pull request link. The stack is intentionally split so each component has a narrow safety boundary:

- The operator-facing runtime remains a host application integration, with OpenClaw as the current adapter target.
- The A2A broker owns task lifecycle, worker registration, status, and terminal evidence.
- Workers execute assigned tasks and report evidence back through the broker.
- The Docker runner provides isolated GitHub patch execution for repository work.

This repository is the A2A Plane consolidation workspace for those components. It is not a production deployment target and it is not public-ready yet.

## Component map

```text
packages/broker/                 # broker HTTP/JSON-RPC APIs, worker registry, task lifecycle
packages/openclaw-plugin-a2a/    # host adapter plugin for broker-backed task request/status/cancel
packages/docker-runner/          # isolated GitHub patch runner for worker tasks
contracts/a2a/                   # shared task lifecycle and terminal semantics contracts
contracts/compatibility/         # compatibility matrix and supported baselines
examples/                        # public-safe demos and fixtures only
docs/                            # public-readiness gates, quickstart, release notes, migration notes
.github/workflows/               # integrated CI gates
```

## Alpha and safety boundary

This A2A Plane monorepo is an alpha private candidate. Treat every example as local-only unless a document says otherwise.

**NO-GO without explicit operator approval:**

- changing repository visibility
- production deploys or Gateway/broker/worker restarts
- production database or terminal-outbox mutation
- live provider, Telegram, or notification sends
- secret rotation, secret disclosure, or raw credential evidence
- history rewrite or force push

Use redacted evidence in issues, pull requests, logs, and artifacts.

## Five-minute local quickstart

Start with the local-only quickstart:

- [`docs/quickstart.md`](docs/quickstart.md)

The quickstart is designed for a disposable local broker and dummy/echo worker. If your checkout does not yet include the runnable broker or worker scripts described there, treat that as a documented blocker rather than substituting production services.

## Promotion and release prep

Draft A2A Plane announcement text and repository metadata recommendations live in [`docs/promotion-announcement.md`](docs/promotion-announcement.md). Keep that copy alpha/feedback-welcome and do not post it until public-readiness gates are closed and an operator explicitly approves repository visibility.

Release decision prep:

- [`docs/release-checklist.md`](docs/release-checklist.md)
- [`docs/promotion-validation.md`](docs/promotion-validation.md)
- [`CHANGELOG.md`](CHANGELOG.md)

## Adapter plugin connection example

Use safe placeholders only. Do not paste real broker URLs, tokens, node IDs, Telegram/provider IDs, or host paths into public docs or issue evidence.

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

Keep production connection details in private operator configuration, not in repository examples.

## Import policy

Default import mode is **sanitized/squash import**, not full private history preservation.

Existing source repositories remain private rollback/source-of-truth references until the A2A Plane candidate is validated:

- `jinwon-int/a2a-broker`
- `jinwon-int/openclaw-plugin-a2a`
- `jinwon-int/a2a-docker-runner`

## Verification

For local validation, use:

```bash
npm ci --ignore-scripts --include=dev
npm run check
```

The check script validates layout, package metadata, and public-readiness scan rules.
