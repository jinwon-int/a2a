# R24 All-Node OpenClaw Latency Optimization Runbook

Run: `a2a-r24-openclaw-latency-optimization-20260515T0655Z`
Issue: https://github.com/jinwon-int/a2a-plane/issues/345
Parent: https://github.com/jinwon-int/a2a-plane/issues/343

## Scope

**Targets:**

| Node | Host | Role | Constraints |
|------|------|------|-------------|
| `yukson` | vps5 | Legacy echo worker (excluded from active dispatch) | Persistent worker mode; 90 s stale threshold; 10 capacity slots |
| `gongyung` | Android/Termux | Evidence model (mobile worker) | Mobile worker mode; 30 s stale threshold; 3 capacity slots; battery/sleep-aware |

## Collected Diagnostics

### OpenClaw Runtime Version & Model Route

The `a2a.monitor.status` gateway method now projects `openclawRuntime` diagnostics:

- `version` — OpenClaw release version (e.g. `1.8.5`)
- `mode` — deployment mode (`standalone`, `headless`, `node`)
- `activeModel` — currently active model route
- `modelRoutes[]` — per-route latency percentiles (P50, P95, P99), error rate
- `eventLoop` — event-loop lag (max, average, sample count)

### Health / Ready / Event-Loop Status

The broker `/health` endpoint exposes these latency-relevant metrics:

- `auditDiagnostics` — SQLite hot-table audit row counts for bottleneck detection
- `requestPressure` — rate limiter snapshot (general + worker buckets)
- `staleReaper` — stale-task reaper status (last run, requeued, dead-lettered)
- `uptimeSec` — process uptime

The monitoring handlers project a `broker_audit_bottleneck` warning when:

- audit rows exceed `maxAuditEvents` (retention/purging needed)
- heartbeat ratio >= 0.8 (heartbeat volume dominating audit writes)
- health latency >= 1000 ms (slow health endpoint)

### Session-Store Residue

Session-store residue is projected in `sessionStoreResidue` diagnostics from
the `a2a.monitor.status` response:

- `totalEntries` — total session store entries
- `staleEntries` — entries past their TTL
- `oldestEntryAgeMs` — age of the oldest retained entry
- `largestSessionKey` — identifier of the largest entry
- `largestSessionSizeBytes` — size of the largest entry
- `totalSizeBytes` — aggregate size of all entries

Large or growing residue on `gongyung` (Android/Termux) may indicate memory
pressure from unclosed sessions. On `yukson` (vps5), stale entries may indicate
a dispatch/wake lifecycle leak.

### A2A Task Backlog

Backlog diagnostics are projected in `taskBacklog` diagnostics:

- `totalQueued` — tasks waiting for worker claim
- `totalRunning` — tasks currently in progress
- `totalStale` — claimed/running tasks past their heartbeat threshold
- `oldestQueuedAgeMs` — age of the oldest queued task
- `perNode[]` — per-node breakdown of queued/running/stale counts

On `gongyung` (Android, mobile=3 slots), queued tasks accumulate faster than
on `yukson` (persistent, 10 slots). Monitor `oldestQueuedAgeMs` to detect
back-pressure.

### Plugin/Provider Discovery Drift

Provider discovery drift is projected in `providerDiscoveryDrift` diagnostics:

- `status` — `current`, `stale`, or `unknown`
- `items[]` — per-provider status including expected vs observed version
- `staleCount` — number of providers with version skew
- `absentCount` — number of expected providers not registered

On mobile Android nodes (`gongyung`), drift may increase after Termux restarts,
Doze sleep, or network suspend. The drift projection helps distinguish
intentional offline from misconfiguration.

## Inspection Procedure

### 1. Query Node Status

```bash
# All-node backlog projection
a2a.monitor.status

# Specific node peer status (read-only, cached)
a2a.peer.status { target: "yukson" }
a2a.peer.status { target: "gongyung" }
```

### 2. Check Event-Loop Health

Look for `openclawRuntime.eventLoop.status` in monitoring diagnostics:

| Status | Meaning | Action |
|--------|---------|--------|
| `healthy` | Max lag < 500 ms | No action |
| `degraded` | Max lag >= 500 ms | Check worker CPU/memory; review wake coalescing |
| `stuck` | Max lag >= 5000 ms | Investigate immediately; possible worker hang |

### 3. Review Latency Logs

Per-route latency percentiles in `openclawRuntime.modelRoutes[]`:

- Compare P50 vs P99 to detect tail-latency outliers
- Cross-reference `eventLoopLagMs` to separate model latency from runtime congestion
- On `gongyung` (Android), expect higher P95/P99 due to mobile CPU throttling

### 4. Inspect Session-Store Residue

Monitor `sessionStoreResidue` across monitoring polls:

- Steady growth in `staleEntries` → investigate session cleanup
- Large `totalSizeBytes` on Android → may trigger low-memory worker kill
- `oldestEntryAgeMs` growing unbounded → possible wake dispatch leak

### 5. Detect Provider Drift

Check `providerDiscoveryDrift`:

- `stale` status with version skew → provider update needed
- `absent` status → provider registration failed; check config
- After Termux/Android restarts, give 30 s (mobile stale threshold) before
  flagging drift

### 6. Backlog Pressure

Evaluate `taskBacklog`:

- `oldestQueuedAgeMs > 120_000` → task may be stuck; check worker liveness
- `totalStale > 0` on `gongyung` → mobile worker likely disconnected
- `perNode[*].queued` growing faster than `running` → capacity bottleneck

## Safety Gate

All inspection and diagnostics are **read-only**. No Gateway restart, broker
restart, worker restart, production deploy, provider/Telegram canary, terminal
ACK/replay, DB mutation/prune/migration, secret movement, release/tag, or
destructive cleanup is permitted without fresh operator approval.

Provider send success is **not** ACK evidence. Terminal-outbox ACK must remain
blocked until manual operator receipt confirmation.

## Related Diagnostics

- `brokerBuildInfo` — broker version, revision, image for version-mismatch detection
- `brokerRuntimeOwner` — deployment metadata (manager, service, compose project)
- `terminalReceiptGaps` — terminal tasks lacking operator-visible receipt confirmation
- `noLiveRehearsal` — no-live rehearsal manifest status (readiness barriers)
- `liveReadiness` — live-readiness canary/evidence/queue status

---

*This runbook is part of A2A R24 all-node OpenClaw latency optimization.*
