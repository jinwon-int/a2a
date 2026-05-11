# Gateway Plugin Config Template — a2a-broker-adapter

Terminal Brief 실전 활성화를 위한 OpenClaw Gateway `a2a-broker-adapter` plugin 구성 템플릿.
Issue: [#242](https://github.com/jinwon-int/a2a-plane/issues/242)
Parent: [#241](https://github.com/jinwon-int/a2a-plane/issues/241)

## Safety Gates

- **Plugin-level config only** — no core Gateway config changes
- **Opt-in notification delivery** — disabled by default, explicit operator approval required
- **No live provider send** without operator approval
- **No secret exposure** — edge secret must be loaded from file, not pasted into config

## Overview

The `a2a-broker-adapter` plugin connects the OpenClaw Gateway to the standalone A2A broker for:
- Wake-on-Task (task assignment wake hints)
- Operator event bridge (SSE-based broker monitoring)
- Terminal notification delivery (opt-in, broker→notifier→operator chat)

## Plugin Config Template

Place in your Gateway plugin config (e.g., `plugins.entries.a2a-broker-adapter.config`):

```json
{
  "baseUrl": "http://127.0.0.1:8787",
  "edgeSecret": "${A2A_BROKER_EDGE_SECRET}",
  "requester": {
    "id": "openclaw-gateway",
    "kind": "service",
    "role": "operator"
  },
  "wakeOnTask": {
    "enabled": false
  },
  "operatorEvents": {
    "enabled": false,
    "notification": {
      "enabled": false,
      "channel": "telegram",
      "to": "telegram:<operator-chat-id>",
      "accountId": null,
      "threadId": null
    }
  }
}
```

## Field Reference

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `baseUrl` | string (http/https) | Yes | — | Broker base URL. Must start with `http://` or `https://`. |
| `edgeSecret` | string | No | — | `x-a2a-edge-secret` header value for protected broker routes. Load from env/secret file. |
| `requester.id` | string | No | — | `x-a2a-requester-id` header when Gateway calls the broker. |
| `requester.kind` | string | No | — | `x-a2a-requester-kind` header. One of: `session`, `node`, `user`, `service`. |
| `requester.role` | string | No | — | `x-a2a-requester-role` header. One of: `hub`, `live-trader`, `researcher`, `analyst`, `operator`. |
| `wakeOnTask.enabled` | boolean | No | `false` | Opt-in task wake bridge for accepted broker tasks. |
| `operatorEvents.enabled` | boolean | No | `false` | Opt-in SSE bridge for broker `/a2a/operator/events`. |
| `operatorEvents.notification.enabled` | boolean | No | `false` | **Explicit opt-in** for operator terminal notification delivery. |
| `operatorEvents.notification.channel` | string | No | — | Destination channel, e.g. `telegram`. |
| `operatorEvents.notification.to` | string | No | — | Destination target, e.g. `telegram:<operator-chat-id>`. |
| `operatorEvents.notification.accountId` | string | No | — | Channel account id when multiple accounts are configured. |
| `operatorEvents.notification.threadId` | string/number | No | — | Optional thread/topic id for threaded delivery. |

## Activation Phases

### Phase 1: Read-Only Bridge (Safe Default)

Start with all features disabled. This validates the plugin loads and the broker is reachable without any mutation or notification risk:

```json
{
  "baseUrl": "http://127.0.0.1:8787",
  "requester": { "id": "openclaw-gateway", "kind": "service", "role": "operator" },
  "wakeOnTask": { "enabled": false },
  "operatorEvents": {
    "enabled": false,
    "notification": { "enabled": false }
  }
}
```

Gateway restart required for plugin activation. Verify with:

```bash
openclaw gateway status
# Check plugin is loaded under plugins.entries.a2a-broker-adapter
```

### Phase 2: Operator Event Bridge (Opt-In)

Enable the SSE bridge for broker monitoring (still no notifications):

```json
{
  "baseUrl": "http://127.0.0.1:8787",
  "requester": { "id": "openclaw-gateway", "kind": "service", "role": "operator" },
  "wakeOnTask": { "enabled": false },
  "operatorEvents": {
    "enabled": true,
    "notification": { "enabled": false }
  }
}
```

### Phase 3: Notification Bridge (Operator Approval Required)

**Requires explicit operator approval.** Enable terminal notification delivery:

```json
{
  "baseUrl": "http://127.0.0.1:8787",
  "edgeSecret": "${A2A_BROKER_EDGE_SECRET}",
  "requester": { "id": "openclaw-gateway", "kind": "service", "role": "operator" },
  "wakeOnTask": { "enabled": false },
  "operatorEvents": {
    "enabled": true,
    "notification": {
      "enabled": true,
      "channel": "telegram",
      "to": "telegram:<operator-chat-id>"
    }
  }
}
```

### Phase 4: Wake-on-Task (Opt-In)

Enable task wake hints for worker nodes (reduces polling):

```json
{
  "baseUrl": "http://127.0.0.1:8787",
  "edgeSecret": "${A2A_BROKER_EDGE_SECRET}",
  "requester": { "id": "openclaw-gateway", "kind": "service", "role": "operator" },
  "wakeOnTask": { "enabled": true },
  "operatorEvents": {
    "enabled": true,
    "notification": {
      "enabled": true,
      "channel": "telegram",
      "to": "telegram:<operator-chat-id>"
    }
  }
}
```

## Pre-Apply Validation

Before applying any plugin config change:

```bash
# 1. Verify broker is healthy
curl -sf http://127.0.0.1:8787/health | jq '{ ok, service, version }'

# 2. Verify plugin schema supports the config
# (Gateway will validate on apply; check plugin openclaw.plugin.json configSchema)

# 3. Dry-run the canary (no broker contact)
cd packages/broker && npm run build && npm run terminal_outbox_preflight -- --no-live --json

# 4. Live preflight (read-only broker contact)
BROKER_URL=http://127.0.0.1:8787 npm run terminal_outbox_preflight -- --json
```

## Post-Apply Verification

After applying and restarting Gateway:

```bash
# Check plugin loaded
openclaw gateway status

# Verify broker connectivity through Gateway
# (check Gateway logs for broker adapter messages)

# Run canary smoke test
cd packages/broker
npm run live_readiness_canary -- --json | jq '{ ok, oneShotLiveEligible, blockedCount }'
```

## Notification Delivery Safety

The notification bridge follows the broker outbox contract:
- Only `terminal-outbox/preflight` verified events are eligible for notification
- `provider_sent` / `provider_accepted` receipt status alone does NOT trigger operator notification
- Only `operator_visible` / `operator_confirmed` receipt evidence qualifies for notification delivery
- One-shot live eligibility gates all live provider sends

## Rollback

To disable the notification bridge (emergency):

```json
{
  "operatorEvents": {
    "notification": { "enabled": false }
  }
}
```

To disable the entire plugin bridge:

Remove or disable the `a2a-broker-adapter` plugin entry from Gateway config.

## Reference

- Plugin schema: `packages/openclaw-plugin-a2a/openclaw.plugin.json`
- Plugin docs: `packages/openclaw-plugin-a2a/docs/`
- Plugin tests: `packages/openclaw-plugin-a2a/test/`
- Broker outbox contract: `packages/broker/docs/operator-terminal-outbox.md`
- Canary preflight: `packages/openclaw-plugin-a2a/scripts/canary-receipt-gated-preflight.sh`
