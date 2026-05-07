## Summary

- 

## Verification

- [ ] `npm ci --ignore-scripts --include=dev`
- [ ] `npm run check`
- [ ] `npm run scan:public-readiness`

## Safety checklist

- [ ] Repository visibility remains private.
- [ ] No production deploy, Gateway/broker/worker restart, production DB mutation, terminal-outbox ACK, live provider/Telegram send, secret rotation/disclosure, history rewrite, or force push was performed.
- [ ] Evidence is redacted and contains no secrets, private endpoints, provider IDs, Telegram IDs, raw session dumps, or production data.
- [ ] Branch/artifacts do not include OpenClaw runtime/bootstrap files: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, or `.openclaw/**`.

## Related issues

- Parent/issue:
