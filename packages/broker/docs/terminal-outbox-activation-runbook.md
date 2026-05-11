# Terminal Outbox Activation Runbook

Terminal Brief 실전 활성화를 위한 terminal-outbox 테이블 초기화 및 활성화 절차.
Issue: [#242](https://github.com/jinwon-int/a2a-plane/issues/242)
Parent: [#241](https://github.com/jinwon-int/a2a-plane/issues/241)

## Safety Gates

- **Read-only preflight only** — no terminal-outbox ACK, no notifier send, no DB mutation without operator approval
- **No live provider send** without explicit operator approval
- **Dry-run first** — 모든 신규 작업은 `--no-live` 모드로 검증 후 live 전환

## Overview

The terminal outbox records task terminal lifecycle events (`task.succeeded`, `task.failed`, `task.canceled`) for consumption by an external notifier. The broker does NOT call Telegram or any operator transport directly. The notifier (Gateway plugin or external service) polls the outbox and handles delivery.

### Outbox Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/a2a/tasks/terminal-outbox` | Poll outbox events with cursor-based pagination |
| `POST` | `/a2a/tasks/terminal-outbox/ack` | Acknowledge receipt (manual or automatic) |
| `POST` | `/a2a/tasks/terminal-outbox/receipt` | Record non-ACK receipt progress (provider_sent, timed_out, etc.) |

## 1. Pre-Deploy Outbox Preflight (No-Live)

**Always run first.** This is a read-only dry-run that exercises the outbox contract without contacting the broker or sending notifications:

```bash
cd packages/broker
npm run build
npm run terminal_outbox_preflight -- --no-live --json
```

Expected output shape:

```json
{
  "kind": "terminal-outbox.no-live-proof",
  "mode": "no-live",
  "providerCalled": false,
  "productionAckAttempted": false,
  "brokerHttpRequested": false,
  "ok": true
}
```

All checks must report `ok: true`. If any fail, review the `checks` array for detail.

## 2. Broker Health Verification

Before touching the outbox, verify the broker is running and healthy:

```bash
curl -sf http://127.0.0.1:8787/health | jq '{ ok, service, version, persistence }'
```

Expected: `ok: true`, `service: "a2a-broker"`, `persistence.kind: "sqlite"`.

If the broker is unreachable, deploy it first using `broker-docker-deployment-runbook.md`.

## 3. Outbox Poll (Read-Only Live Preflight)

Once the broker is running, verify the outbox is reachable:

```bash
curl -sf "http://127.0.0.1:8787/a2a/tasks/terminal-outbox?limit=5" \
  -H "x-a2a-requester-id: terminal-outbox-preflight" \
  -H "x-a2a-requester-role: operator" | jq '{ kind, count, cursor, eventCount: (.events | length) }'
```

Expected: `kind: "task.terminal.outbox"`, `count` reflects current event count.

### With Edge Secret (If Enabled)

```bash
EDGE_SECRET="$(cat /path/to/edge-secret-file)"
curl -sf "http://127.0.0.1:8787/a2a/tasks/terminal-outbox?limit=5" \
  -H "x-a2a-edge-secret: $EDGE_SECRET" \
  -H "x-a2a-requester-id: terminal-outbox-preflight" \
  -H "x-a2a-requester-role: operator" | jq .
```

## 4. Full Outbox Preflight (Live Mode)

Runs health check + outbox poll + outbox replay in sequence:

```bash
BROKER_URL=http://127.0.0.1:8787 \
npm run terminal_outbox_preflight -- --json
```

With edge secret:

```bash
BROKER_URL=http://127.0.0.1:8787 \
BROKER_EDGE_SECRET="$(cat /path/to/edge-secret-file)" \
npm run terminal_outbox_preflight -- --json
```

Each check (`health`, `poll`, `replay`) reports its own `ok`/`detail`. The overall `ok` is `true` only when all pass.

## 5. Outbox Cursor Management

The outbox uses stable cursors for deduplication and replay:

```bash
# Save the cursor from the last poll
CURSOR=$(curl -sf "http://127.0.0.1:8787/a2a/tasks/terminal-outbox?limit=1" \
  -H "x-a2a-requester-id: operator" \
  -H "x-a2a-requester-role: operator" | jq -r '.cursor')

# Poll for new events after the saved cursor
curl -sf "http://127.0.0.1:8787/a2a/tasks/terminal-outbox?after_id=$CURSOR&limit=10" \
  -H "x-a2a-requester-id: operator" \
  -H "x-a2a-requester-role: operator" | jq .
```

### Reconcile Unacknowledged Events

After a restart or if you suspect a gap, reconcile unacknowledged records:

```bash
curl -sf "http://127.0.0.1:8787/a2a/tasks/terminal-outbox?after_id=$CURSOR&limit=10&reconcile_unacked=true" \
  -H "x-a2a-requester-id: operator" \
  -H "x-a2a-requester-role: operator" | jq .
```

Note: `reconciledUnacked` in the response shows how many unacknowledged records were prepended.

## 6. Receipt Acknowledgment (Operator Approval Required)

**DO NOT run this without explicit operator approval.** ACKing terminal-outbox events is a stateful mutation.

```bash
# Record provider-send receipt (non-ACK — does not mark as operator-visible)
curl -sf -X POST http://127.0.0.1:8787/a2a/tasks/terminal-outbox/receipt \
  -H "content-type: application/json" \
  -H "x-a2a-edge-secret: $EDGE_SECRET" \
  -H "x-a2a-requester-id: operator" \
  -H "x-a2a-requester-role: operator" \
  -d '{
    "id": "<terminal-event-id>",
    "status": "provider_sent"
  }'

# Manual operator receipt ACK (stateful — requires approval)
curl -sf -X POST http://127.0.0.1:8787/a2a/tasks/terminal-outbox/ack \
  -H "content-type: application/json" \
  -H "x-a2a-edge-secret: $EDGE_SECRET" \
  -H "x-a2a-requester-id: operator" \
  -H "x-a2a-requester-role: operator" \
  -d '{
    "id": "<terminal-event-id>",
    "receipt": {
      "evidence": "operator_visible",
      "acknowledgedAt": "<ISO-8601-timestamp>"
    }
  }'
```

### Valid Receipt Evidence Values

| Evidence | Maps To | ACK? | Meaning |
|---|---|---|---|
| `provider_sent` | `receipt.status=provider_sent` | No | Provider send success only |
| `provider_accepted` | `receipt.status=provider_accepted` | No | Provider accepted-send evidence |
| `current_session_visible` | `receipt.status=current_session_visible` | No | Rendered in current session |
| `operator_visible` | `receipt.status=operator_visible` | Yes | Manual operator confirmation |
| `operator_confirmed` | `receipt.status=operator_visible` | Yes | Manual operator confirmation |

## 7. One-Shot Live Eligibility Check

One-shot live send is blocked until ALL terminal outbox records have manual operator receipt confirmation:

```bash
npm run live_readiness_canary -- --json | jq '{ oneShotLiveEligible, blockedCount }'
```

Expected when ready: `oneShotLiveEligible: true`, `blockedCount: 0`.

If blocked, review each blocked event's `ackStatus` and `receiptStatus` in the canary output.

## 8. Gateway Notification Bridge Activation

Once the outbox is verified and the broker is healthy, activate the Gateway notification bridge. See `docs/gateway-plugin-config-template.md` for the plugin configuration template.

### Activation Sequence

1. ✅ Broker Docker deployed and healthy (`/health` returns `ok: true`)
2. ✅ Terminal outbox verified (`terminal_outbox_preflight` passes)
3. ✅ Broker live readiness canary passes (no-live mode)
4. 🔲 Gateway plugin config applied (operator approval required)
5. 🔲 Gateway restart to pick up plugin config
6. 🔲 Canary smoke test with Gateway notification bridge
7. 🔲 One-shot live eligibility confirmed
8. 🔲 Provider send (operator approval required, 1회 only)

## 9. Operator Task Report

Verify terminal-outbox state through the operator read model:

```bash
curl -sf http://127.0.0.1:8787/operator/task-report \
  -H "x-a2a-requester-id: operator" \
  -H "x-a2a-requester-role: operator" | jq '[.[] | { id, terminalBrief: { cursor, receiptStatus, ackStatus, evidenceUrl } }]'
```

## 10. Troubleshooting

| Symptom | Check | Action |
|---|---|---|
| Outbox returns 404 | Broker not running or wrong URL | Verify with `curl /health`, deploy broker first |
| `reconcile_unacked` returns unexpected records | Stale unacknowledged events from previous runs | Review each event, manually ACK if confirmed, or let retention evict |
| One-shot blocked with `provider_delivery_receipt` | Provider send-only evidence is not operator confirmation | Requires manual operator receipt ACK with `operator_visible` evidence |
| Cursor advances but events are missing | Gap in consumer polling | Use `reconcile_unacked=true` to recover, review consumer polling interval |
| `terminal_outbox_preflight` fails with connection refused | Broker not running | Deploy broker first, then re-run preflight |

## Reference

- `docs/operator-terminal-outbox.md` — full outbox contract, record shape, replay/ack/retention rules
- `scripts/terminal-outbox-preflight.mjs` — preflight script source
- `scripts/terminal-outbox-preflight.test.mjs` — preflight test suite
- `scripts/broker-live-readiness-canary.mjs` — live readiness canary with one-shot gate
- `src/core/terminal-event-outbox.ts` — outbox implementation
