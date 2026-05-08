# A2A Monorepo Candidate

A2A is an alpha reference implementation for handing OpenClaw tasks to broker-managed workers and collecting terminal evidence such as `Done`, `Block`, or a pull request link. This monorepo contains the broker, OpenClaw plugin, Docker runner, shared contracts, and public-safe examples needed to evaluate that flow from a fresh checkout.

> **Status:** public-readiness candidate, not production-ready. Do not make this repository public until every gate in [`docs/public-readiness.md`](docs/public-readiness.md) is closed and an operator explicitly approves the visibility change.

## External-reader path

If you are reviewing A2A for the first time, use this order:

1. Read [What A2A does](#what-a2a-does) and the [component map](#component-map) below.
2. Run the local-only [`docs/quickstart.md`](docs/quickstart.md).
3. Review [`contracts/compatibility/matrix.md`](contracts/compatibility/matrix.md) before making support claims.
4. Check [`docs/known-limitations.md`](docs/known-limitations.md) and [`docs/public-readiness.md`](docs/public-readiness.md) for current NO-GO gates.

## What A2A does

A2A lets an OpenClaw operator hand a task to a broker, route it to a worker, and collect terminal evidence. The stack is intentionally split so each component has a narrow safety boundary:

- OpenClaw remains the operator-facing runtime.
- The A2A broker owns task lifecycle, worker registration, status, and terminal evidence.
- Workers execute assigned tasks and report evidence back through the broker.
- The Docker runner provides isolated GitHub patch execution for repository work.

This repository is a consolidation workspace for those components. It is not a production deployment target and does not claim stable OpenClaw, broker, runner, or multi-tenant compatibility yet.

## Component map

```text
packages/broker/                 # broker HTTP/JSON-RPC APIs, worker registry, task lifecycle
packages/openclaw-plugin-a2a/    # OpenClaw plugin adapter for broker-backed task request/status/cancel
packages/docker-runner/          # isolated GitHub patch runner for worker tasks
contracts/a2a/                   # shared task lifecycle and terminal semantics contracts
contracts/compatibility/         # compatibility matrix and supported baselines
examples/                        # public-safe demos and fixtures only
docs/                            # public-readiness gates, quickstart, release notes, migration notes
.github/workflows/               # integrated CI gates
```

## Alpha and safety boundary

This monorepo is an alpha private candidate. Treat every example as local-only unless a document says otherwise.

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

The quickstart is the supported external-reader smoke path: it uses a disposable local broker, a dummy/echo worker when available, placeholder plugin configuration, and the public-readiness checks. If your checkout does not yet include the runnable broker or worker scripts described there, treat that as a documented blocker rather than substituting production services.

## OpenClaw plugin connection example

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

Existing source repositories remain private rollback/source-of-truth references until the monorepo candidate is validated:

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
