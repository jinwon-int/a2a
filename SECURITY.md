# Security Policy

## Current status

This repository is a private/public-readiness candidate. Public visibility is blocked until the gates in [`docs/public-readiness.md`](docs/public-readiness.md) are complete and an operator explicitly approves the visibility change.

## Reporting a vulnerability

For now, report security concerns in the private issue tracker or directly to the repository maintainers using the approved private channel for this organization. Keep reports concise and redacted.

Do not include:

- real tokens, secrets, cookies, private keys, or authorization headers
- private hostnames, internal IPs, local filesystem paths, provider IDs, Telegram IDs, or raw session dumps
- production database contents or terminal-outbox payloads

If a proof of concept needs configuration, use placeholders such as `<local-dev-token>`, `<broker-url>`, and `<worker-id>`.

## Hard safety boundary

The following actions are not authorized by normal docs, issues, PRs, or local verification:

- changing repository visibility
- production deploys or Gateway/broker/worker restarts
- production database mutation
- live provider or Telegram sends
- terminal-outbox ACK mutation
- secret rotation or disclosure
- history rewrite or force push

Explicit operator approval must name the action before any exception.

## Evidence handling

Use redacted evidence only. Before opening a PR or posting task evidence, verify that the branch and artifacts do not include OpenClaw runtime/bootstrap context files:

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `.openclaw/**`

If any of those files would enter a branch or artifact bundle, fail closed and report the exact repo-relative paths.

## Supported versions

No public/stable version is supported yet. Treat all packages in this monorepo as private alpha candidates until the compatibility matrix and public-readiness gates are complete.
