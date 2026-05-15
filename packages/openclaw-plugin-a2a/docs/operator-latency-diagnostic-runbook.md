# OpenClaw Latency Diagnostic Runbook

## Scope

- **Lane**: A2A R24 OpenClaw latency optimization
- **Run ID**: `a2a-r24-openclaw-latency-optimization-20260515T0655Z`
- **Target nodes**: `seoseo/vps4`, `bangtong/vps3`
- **Parent issue**: [#343](https://github.com/jinwon-int/a2a-plane/issues/343)
- **Issue**: [#344](https://github.com/jinwon-int/a2a-plane/issues/344)

This runbook documents the step-by-step inspection checklist for an operator
on a target OpenClaw node. It is meant to be followed **on the node** (SSH,
serial, or equivalent access) and is complementary to the automated health
projections in the monitoring handlers.

---

## P0 — Pre-flight

Before starting, confirm:

- [ ] You are on the correct node (`seoseo/vps4` or `bangtong/vps3`)
- [ ] `openclaw` CLI or Gateway process is installed and started
- [ ] The A2A broker is reachable from this node (network / firewall)
- [ ] Plugin `openclaw-plugin-a2a` build matches the latest merged commit for
      this run
- [ ] You have a terminal or direct session with the Gateway runtime environment
      (systemd, Docker Compose, or bare Node)

> **Safety**: Do not restart the Gateway, broker, or any workers during
> inspection. Do not mutate session store, DB, or terminal-outbox state.
> All commands below are read-only.

---

## P1 — OpenClaw Version, Runtime, and Active Model Route

Check the running OpenClaw version and model configuration:

```bash
# Current OpenClaw version (installed package or binary)
openclaw --version

# Active model configuration (if available via CLI)
openclaw config get agents.defaults.model
openclaw config get agents.defaults.modelRoute
openclaw config get agents.defaults.imageGenerationModel

# Gateway runtime info — service manager detection
systemctl show openclaw 2>/dev/null | grep -E '(Version|LoadState|ActiveState|SubState|MainPID)' || echo "not systemd"
docker ps --filter name=openclaw --format '{{.Image}} {{.Status}}' 2>/dev/null || echo "not docker"

# Node.js runtime (Node gateway mode)
node --version
```

### Expected output

Record for evidence:

| Field | Value |
|-------|-------|
| `openclaw --version` | _(output)_ |
| `agents.defaults.model` | _(output)_ |
| `agents.defaults.modelRoute` | _(output)_ |
| Node.js version | _(output)_ |
| Service manager | systemd / docker / bare |
| Plugin build revision | _(git rev-parse HEAD or image tag)_ |

---

## P2 — Gateway Health, Readiness, and Event-Loop Status

### P2.1 — Gateway API health probe

```bash
# Health endpoint (default port 9625 unless customized)
curl -sf http://127.0.0.1:9625/health 2>/dev/null || \
  curl -sf http://127.0.0.1:9625/status 2>/dev/null || \
  openclaw status 2>/dev/null

# Gateway readiness indicator (if available)
curl -sf http://127.0.0.1:9625/ready 2>/dev/null || echo "gateway: /ready not exposed"
```

### P2.2 — Event-loop delay metrics

```bash
# Check recent logs for event-loop delay warnings
journalctl -u openclaw --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -i 'event_loop_delay\|eventLoop\|event.loop\|loop.delay' \
  | tail -20

# If running in Docker
docker logs openclaw 2>/dev/null | grep -i 'event_loop_delay\|eventLoop\|event.loop\|loop.delay' | tail -20
```

Expected: zero or minimal occurrences. Each occurrence should include a
duration in ms. Investigate any entry above `500ms`.

### P2.3 — Process-level metrics

```bash
# CPU / memory / uptime
ps -p $(pgrep -f openclaw | head -1) -o pid,%cpu,%mem,rss,vsize,etimes 2>/dev/null || \
  echo "openclaw process not found by pgrep"

# Open file descriptors (indicator of session store bloat)
ls /proc/$(pgrep -f openclaw | head -1)/fd 2>/dev/null | wc -l || \
  echo "fd count unavailable"
```

**Thresholds** (informational, not hard limits):

| Metric | Caution | Investigate |
|--------|---------|------------|
| CPU (%) | >80% sustained | >95% sustained |
| RSS | >1GB | >2GB |
| FDs | >1000 | >2000 |
| Uptime | <1h (recent restart) | — |

---

## P3 — Latency Log Inspection

### P3.1 — `event_loop_delay` scan

```bash
journalctl -u openclaw --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -c 'event_loop_delay' || echo "0 events"

# With duration extraction
journalctl -u openclaw --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -oP 'event_loop_delay[=: ]+\K[0-9.]+' \
  | sort -n | tail -5
```

### P3.2 — `fetch-timeout` scan

```bash
journalctl -u openclaw --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -i 'fetch.timeout\|fetch-timeout\|timeout.*fetch' \
  | tail -20
```

Indicates upstream provider or model endpoint that did not respond in time.

### P3.3 — Prewarm / model / auth startup stalls

```bash
journalctl -u openclaw --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -i 'prewarm\|model.*load\|model.*start\|auth.*stall\|auth.*timeout\|startup.*stall' \
  | tail -20
```

These stalls delay the first response on cold-start or model swap. Multiple
occurrences suggest resource pressure or upstream throttling.

### P3.4 — Foreground pressure

```bash
journalctl -u openclaw --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -i 'foreground.*pressure\|foreground.*delay\|saturated\|backpressure' \
  | tail -20
```

Foreground pressure happens when a long-running or high-complexity task
monopolizes the Gateway worker pool, delaying subsequent requests.

### P3.5 — Aggregate log scan

```bash
journalctl -u openclaw --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -E 'warn|error|critical|fatal' \
  | grep -iE 'latency|timeout|stall|slow|block|backlog' \
  | tail -30
```

---

## P4 — Session Store Residue

Check for stale sessions, orphan transcripts, and checkpoint residue
that may bloat memory or disk.

```bash
# Session store directory (configurable; default paths listed)
ls -la ~/.openclaw/sessions/ 2>/dev/null | head -20
ls -la ~/.openclaw/memory/ 2>/dev/null | head -20
ls -la /var/lib/openclaw/sessions/ 2>/dev/null | head -20

# Count session files
find ~/.openclaw/sessions/ -type f 2>/dev/null | wc -l
find /var/lib/openclaw/sessions/ -type f 2>/dev/null | wc -l

# Session store size
du -sh ~/.openclaw/sessions/ 2>/dev/null
du -sh /var/lib/openclaw/sessions/ 2>/dev/null

# Orphan transcript residue (sessions older than 7 days with no recent activity)
find ~/.openclaw/sessions/ -name '*.jsonl' -mtime +7 -type f 2>/dev/null | wc -l
find ~/.openclaw/sessions/ -name '*.json'  -mtime +7 -type f 2>/dev/null | wc -l

# Checkpoint files (may be large in vector-store configuration)
find ~/.openclaw/ -name '*.checkpoint' -o -name '*.ckpt' 2>/dev/null | head -10
```

### Session store advisory thresholds

| Metric | Caution | Investigate |
|--------|---------|------------|
| Session file count | >500 | >2000 |
| Session store size | >500MB | >2GB |
| Orphan files (>7 days) | >100 | >500 |
| Checkpoint files | >10 | >50 |

> **Note**: Session store paths vary by deployment. Check `openclaw config get`
> for non-default paths. The `.tmp/`, `.cache/`, and checkpoint subdirectories
> may also contribute to residue.

---

## P5 — A2A Broker Queue / Backlog / Stale Task State

Query the broker for queue depth and stale task metrics.

```bash
# If broker HTTP endpoint is accessible
BROKER_URL="${A2A_BROKER_URL:-http://127.0.0.1:3003}"

# Broker health (includes audit rows, event count, heartbeat ratio)
curl -sf "$BROKER_URL/health" | jq '. // .audit // .diagnostics // empty'

# Broker diagnostics (task queue summary)
curl -sf "$BROKER_URL/diagnostics" | jq '. // empty'

# Broker queue state
curl -sf "$BROKER_URL/queue/status" 2>/dev/null | jq '. // empty' || \
  echo "queue/status endpoint not exposed"

# Broker recovery snapshot (stale/dead-lettered tasks)
curl -sf "$BROKER_URL/recovery" 2>/dev/null | jq '. // empty' || \
  echo "recovery endpoint not exposed"
```

### Queue state fields to check

| Field | Healthy | Caution | Investigate |
|-------|---------|---------|------------|
| `queued` | <10 | 10–50 | >50 |
| `claimed` | <5 | 5–20 | >20 |
| `running` | <5 | 5–20 | >20 |
| `stale` | 0 | 1–5 | >5 |
| `timedOut` | 0 | 1–5 | >5 |
| `auditRows` / `maxAuditEvents` | <80% | 80–95% | >95% |
| `heartbeatRatio` | <0.5 | 0.5–0.8 | >0.8 |
| `healthLatencyMs` | <200 | 200–1000 | >1000 |

---

## P6 — Plugin / Provider Discovery Warnings or Drift

Check the plugin's registration and any provider discovery issues.

```bash
# Plugin registration status
openclaw plugins list 2>/dev/null | grep -i a2a || \
  echo "a2a plugin: not found via plugins list"

# Provider discovery (model providers, enabled/disabled status)
openclaw config get plugins.entries.a2a-broker-adapter 2>/dev/null || \
  echo "a2a-broker-adapter config: not found"

# Provider drift — check configured provider vs. active
openclaw config get agents.defaults.modelProvider 2>/dev/null

# Log for provider discovery errors/warnings
journalctl -u openclaw --since "24 hours ago" --no-pager 2>/dev/null \
  | grep -iE 'provider.*discover|provider.*warn|provider.*error|plugin.*warn|plugin.*disabled|discovery.*fail' \
  | tail -20
```

### Discovery drift signals

- Plugin shows as `disabled` when it should be `active`
- Plugin version mismatch between seoseo/vps4 and bangtong/vps3
- Provider references a model endpoint that is no longer reachable
- Agent card capabilities differ from runtime capability test results
- SSE event bridge shows `disconnected` or `backpressure` warnings

---

## P7 — Summary and Decision Framework

After completing P1–P6, produce a structured summary:

```yaml
node: <seoseo/vps4 | bangtong/vps3>
timestamp: <ISO-8601>
openclaw_version: <version>
active_model: <model>
model_route: <route>

health:
  gateway_up: <yes|no>
  event_loop_delay_24h_count: <count>
  event_loop_delay_24h_max_ms: <max>
  fetch_timeout_count: <count>
  prewarm_stall_count: <count>
  foreground_pressure_count: <count>

session_store:
  file_count: <count>
  total_size: <size>
  orphan_count: <count>

broker_queue:
  queued: <count>
  claimed: <count>
  running: <count>
  stale: <count>
  timed_out: <count>
  audit_bottleneck: <yes|no>

discovery_drift:
  plugin_active: <yes|no>
  provider_drift: <yes|no>
  version_skew: <yes|no>

findings:
  - description: <text>
    severity: low|medium|high
    actionable: <yes|no>
```

### Decision outcomes

| Outcome | Action |
|---------|--------|
| **Clean** — no warnings above any threshold, event-loop delay count zero, queue healthy | Rotate to next node or mark the lane Done |
| **Caution** — one or more thresholds in Caution range, no Investigate findings | Log findings, continue monitoring, rotate |
| **Blocked** — any Investigate-threshold finding, or >1 event-loop delay >1000ms, or stale/timed_out count >5 | Post Block evidence with findings summary; do NOT proceed to PR without operator approval |

---

## References

- A2A operator-event bridge: [`src/operator-event-bridge.ts`](../src/operator-event-bridge.ts)
- Gateway monitoring handlers: [`src/gateway-monitoring-handlers.ts`](../src/gateway-monitoring-handlers.ts)
- Broker execution lifecycle: `packages/broker/src/core/execution-lifecycle.ts`
- Wake audit manager: `packages/broker/src/core/wake-audit.ts`
- Agent card discovery: [`./agent-card-discovery.md`](./agent-card-discovery.md)
- Recovery loop regression matrix: [`./recovery-loop-regression-matrix.md`](./recovery-loop-regression-matrix.md)
- Termux troubleshooting: [`./termux-troubleshooting.md`](./termux-troubleshooting.md)
