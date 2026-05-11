# Broker Docker Deployment Runbook

Terminal Brief 실전 활성화를 위한 A2A Broker Docker 배포 runbook.
Issue: [#242](https://github.com/jinwon-int/a2a-plane/issues/242)
Parent: [#241](https://github.com/jinwon-int/a2a-plane/issues/241)

## Safety Gates

- **Docker container only** — system service 설치 없음, 호스트 패키지 변경 없음
- **No production DB mutation** without explicit operator approval
- **No live provider send** without explicit operator approval
- **No secret change, history rewrite, force-push, release, or visibility change**

## Prerequisites

- Docker Engine 24+ (`docker --version`)
- Docker Compose v2+ (`docker compose version`)
- Node.js 22+ on host (for build verification only; container uses its own Node)
- Git checkout of `jinwon-int/a2a-plane` at the approved deployment commit
- Edge secret file prepared at a host-local path (not checked into git)

## 1. Build the Broker Image

```bash
cd packages/broker
docker compose build
```

Verify the image:

```bash
docker images a2a-broker --format '{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}'
```

Expected: `a2a-broker:latest` listed with recent creation time.

## 2. Environment Configuration

Copy and edit the environment file:

```bash
cp .env.example .env
# Edit .env with your deployment values
```

Minimum required `.env` entries:

```bash
# Service identity
SERVICE_NAME=a2a-broker

# Broker runtime
HOST=0.0.0.0
PORT=8787
PUBLIC_BASE_URL=http://127.0.0.1:8787

# Persistence
STATE_FILE=/var/lib/a2a-broker/state.json

# Security
ENFORCE_REQUESTER_IDENTITY=1
EDGE_SECRET_FILE=/run/secrets/a2a-edge-secret

# Stale reaper
STALE_REAPER_ENABLED=1
STALE_REAPER_INTERVAL_SEC=30

# Worker timeouts
WORKER_OFFLINE_AFTER_SEC=90

# Rate limits
RATE_LIMIT_WINDOW_SEC=60
RATE_LIMIT_MAX_REQUESTS=120
WORKER_RATE_LIMIT_WINDOW_SEC=60
WORKER_RATE_LIMIT_MAX_REQUESTS=120
```

## 3. Deploy the Broker Container

```bash
cd packages/broker
docker compose up -d
```

Check container status:

```bash
docker compose ps
docker compose logs --tail=20
```

Expected: container `a2a-broker` with status `Up` (healthy).

## 4. Post-Deploy Health Verification

### 4.1 Basic Health Check

```bash
curl -sf http://127.0.0.1:8787/health | jq .
```

Expected payload shape:

```json
{
  "ok": true,
  "service": "a2a-broker",
  "version": "0.1.0",
  "build": "<revision>",
  "persistence": { "kind": "sqlite" },
  "staleReaper": { "enabled": true, "intervalSec": 30 }
}
```

### 4.2 Edge Secret Verification

If `ENFORCE_REQUESTER_IDENTITY=1` and edge secret is configured:

```bash
# Without secret — should be rejected
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/workers
# Expected: 401

# With secret — should succeed
curl -sf http://127.0.0.1:8787/workers \
  -H "x-a2a-edge-secret: $(cat /path/to/edge-secret-file)" \
  -H "x-a2a-requester-id: operator" \
  -H "x-a2a-requester-role: operator" | jq .
# Expected: worker list (may be empty if no workers registered yet)
```

### 4.3 Docker Healthcheck Status

```bash
docker inspect a2a-broker --format '{{.State.Health.Status}}'
```

Expected: `healthy` (may take up to `start_period + interval * retries` = ~55s).

## 5. Terminal Outbox Verification

```bash
curl -sf "http://127.0.0.1:8787/a2a/tasks/terminal-outbox?limit=5" \
  -H "x-a2a-requester-id: operator" \
  -H "x-a2a-requester-role: operator" | jq .
```

Expected: `{ "kind": "task.terminal.outbox", "count": 0, "events": [] }` for a fresh deployment, or existing terminal events for a redeploy.

## 6. Pre-Deploy Canary (No-Live)

Before any live operations, run the canary in no-live mode:

```bash
cd packages/broker
npm run build
npm run live_readiness_canary -- --no-live --markdown
```

All checks must pass before proceeding to live validation.

## 7. Live Readiness Canary (Post-Approval Only)

**Requires explicit operator approval.** This performs read-only GET requests against the live broker:

```bash
BROKER_URL=http://127.0.0.1:8787 \
BROKER_EDGE_SECRET="$(cat /path/to/edge-secret-file)" \
npm run live_readiness_canary -- --json
```

If the broker is not running, the canary will report a clear failure with the health endpoint status rather than a cryptic 404.

## 8. Canary Preflight Health Check

For environments where the broker may not be running, use the preflight health check first:

```bash
npm run canary_preflight_health -- --base-url=http://127.0.0.1:8787
```

This script:
- Checks `/health` endpoint reachability
- Reports clear diagnostics when broker is unreachable (no cryptic 404)
- Verifies expected API surface (health, workers, diagnostics, terminal-outbox)
- Exits 0 only when all endpoints are reachable and healthy

## 9. Rollback

If the new deployment is unhealthy:

```bash
cd packages/broker
docker compose down
docker compose up -d  # Restarts with current config
# Or restore from backup:
# cp /backup/state.json /var/lib/a2a-broker/state.json && docker compose restart
```

For image rollback to a previous tag, set `A2A_BROKER_VERSION` build arg or pin the image tag in `docker-compose.yml`.

## 10. Cleanup (Optional)

```bash
# Stop and remove container (preserves volume)
docker compose down

# Stop, remove container, and remove volume (destructive)
docker compose down -v
```

## 11. Troubleshooting

| Symptom | Check | Action |
|---|---|---|
| Container exits immediately | `docker compose logs` | Verify `.env` file exists and has required entries |
| Health check fails | `docker inspect a2a-broker` | Check port binding, ensure `HOST=0.0.0.0` |
| `/health` returns 404 | Container may be running old image | Rebuild: `docker compose build --no-cache && docker compose up -d` |
| Workers can't register | Edge secret mismatch | Verify `EDGE_SECRET_FILE` path and file content |
| Stale tasks accumulating | `GET /tasks/diagnostics` | Check `STALE_REAPER_ENABLED=1` and interval |
| Port already in use | `ss -tlnp \| grep 8787` | Change `PORT` or stop conflicting service |

## Reference

- `docker-compose.yml` — main broker compose file
- `examples/docker-compose.smoke.yml` — smoke test compose with echo worker
- `examples/docker-compose.trading-partners.yml` — multi-broker trading partner setup
- `docs/operator-terminal-outbox.md` — outbox contract and HTTP adapter
- `docs/docker-broker-live-smoke.md` — live smoke test runbook
