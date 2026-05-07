#!/usr/bin/env bash
set -euo pipefail

# Canary preflight for the receipt-gated terminal-outbox notifier.
# Safe by design: this script runs local build/tests only. It does not deploy,
# restart Gateway, send Telegram messages, or ACK terminal-outbox records.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_COMMIT="${A2A_PLUGIN_CANARY_TARGET_COMMIT:-4f30c03aaea2df99b5a5e81670f50cf585a16480}"
CURRENT_COMMIT="$(git rev-parse HEAD 2>/dev/null || true)"

cat <<EOF
A2A plugin receipt-gated canary preflight
- expected canary target commit: ${TARGET_COMMIT}
- current repository commit: ${CURRENT_COMMIT:-unknown}
- live operations: disabled (no deploy, no Gateway restart, no Telegram send, no terminal-outbox ACK)
EOF

if [[ -n "$CURRENT_COMMIT" && "$CURRENT_COMMIT" != "$TARGET_COMMIT" ]]; then
  cat <<EOF
Note: current checkout is not the documented canary target commit.
This is acceptable for PR validation, but operator canary update should deploy
exactly ${TARGET_COMMIT} unless the runbook is updated with a newer approved target.
EOF
fi

npm run build
node --test test/operator-event-bridge.test.mjs
npm test

cat <<'EOF'
Receipt-gated no-live preflight passed.
Provider/Gateway send success alone is NOT terminal ACK evidence; only
current-session/user-visible or explicit manual operator receipt may unlock ACK.
EOF
