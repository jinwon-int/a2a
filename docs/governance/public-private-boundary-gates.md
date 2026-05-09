# Public/Private Boundary Governance Gates

This governance note defines who may turn public-readiness evidence into a visibility action for A2A Plane. It is a control surface, not approval to act.

## Boundary principles

- **Private by default:** the repository remains private until a separate, explicit operator approval names the visibility/publication action.
- **Evidence is not approval:** passing tests, clean scanners, merged PRs, or green CI may support review, but none of them authorizes a visibility change.
- **No bundled live actions:** visibility approval must not bundle deploys, service restarts, production database mutations, live provider sends, terminal-outbox ACKs, edge-secret rotation, secret disclosure, history rewrite, or force-push.
- **OpenClaw gate remains blocking:** do not claim public-readiness is unblocked by routing or terminal evidence that bypasses `openclaw/openclaw#78261`.

## Gate owners and outcomes

| Gate | Owner | GO condition | NO-GO / Block condition |
| --- | --- | --- | --- |
| Public/private boundary | Broker of record (`gwakga`) prepares evidence; operator decides | Repository remains private through review, and proposed public materials contain no private context | Any private endpoint, provider ID, host-specific path, raw session dump, or OpenClaw runtime/bootstrap file would enter branch/artifact/evidence |
| Scanner/readiness | Lane owner links redacted scanner output | Supported external scanner evidence is clean or explicitly dispositioned, and local readiness scans pass | External scanner unavailable, stale, or replaced by local-only checks |
| GO/NO-GO matrix | Cross-team broker | Every required gate is GO with owner, timestamp, and evidence link | Any required gate is missing, waiting, disputed, or stale |
| Evidence policy | PR author and reviewer | Evidence is redacted and limited to commands, statuses, counts/classes, commit SHAs, and links | Evidence includes raw secrets, matched values, private paths, provider IDs, Telegram IDs, raw session dumps, or terminal ACK mutation data |
| Operator approval | Operator only | Explicit comment approves repository visibility/publication for this repository and is separate from execution | Approval absent, ambiguous, scoped to another repository, or bundled with live-impact actions |

## Operator approval contract

A valid approval comment must include:

1. Repository name: `jinwon-int/a2a-plane`.
2. Approved action: repository visibility/publication, not a generic "looks good".
3. Scope exclusions: no deploy, restart, production DB mutation, provider send, terminal ACK, secret rotation/disclosure, history rewrite, force-push, npm publish, Docker publish, or release creation unless separately approved.
4. Link to the latest redacted GO/NO-GO matrix and scanner evidence.

If any element is missing, record **NO-GO / Waiting** and ask for clarification. Do not infer approval.

## Pre-PR fail-closed check

Before a PR/Done marker, run and report:

```sh
git status --short
npm run scan:readiness-gates
npm run scan:public-readiness
git diff --name-only HEAD --
```

Then explicitly confirm that these paths are absent from branch diffs and artifact evidence:

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `.openclaw/**`

If any listed path appears, stop and post Block evidence with the exact repo-relative offending paths.
