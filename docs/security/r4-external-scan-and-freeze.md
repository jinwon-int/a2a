# R4 External Scan and Release Dry-Run Freeze

This R4 lane keeps the repository private and records only redacted, local evidence. It does not authorize repository visibility changes, npm or Docker publishing, public releases, deploys, service restarts, production database mutations, live provider or Telegram sends, terminal-outbox ACKs, secret rotation, secret disclosure, history rewrites, or force-pushes.

## External-style secret/history scan

Operator-run command:

```sh
npm run scan:external-secrets
```

The command is fail-closed:

- If `gitleaks` is available, it runs `gitleaks detect --source . --redact --no-banner --verbose` for redacted Git secret/history evidence.
- If `trufflehog` is available, it runs `trufflehog filesystem . --only-verified --no-update` for verified filesystem findings without self-update.
- If neither scanner is installed, it exits non-zero and instructs the operator to install one before treating this gate as complete.

This external scan complements, but does not replace, the repository-local `npm run scan:public-readiness` and `node scripts/redacted-readiness-inventory.mjs` checks.

## R4 dry-run release boundary

The release dry-run is evidence-only. Valid commands are local checks such as:

```sh
npm ci --ignore-scripts --include=dev
npm run check
npm run scan:public-readiness
node scripts/redacted-readiness-inventory.mjs
npm run test:release-gate
npm run scan:external-secrets
```

Do not run publish, release, deploy, restart, provider-send, terminal ACK, visibility-change, secret-rotation, history-rewrite, or force-push commands as part of this lane without explicit operator approval.

## R4 evidence template

Record redacted evidence in the PR body or issue comment:

- `npm ci --ignore-scripts --include=dev`: pass/fail with timestamp and no dependency secrets.
- `npm run check`: pass/fail; includes layout, package checks, public-readiness scan, and compatibility-baseline validation.
- `npm run scan:public-readiness`: pass/fail with finding counts only.
- `node scripts/redacted-readiness-inventory.mjs`: redacted metadata only; never paste matched values.
- `npm run test:release-gate`: pass/fail test count.
- `npm run scan:external-secrets`: pass/fail, or blocked because no supported scanner was installed.
- Repository visibility: confirm private via redacted GitHub metadata.
- Runtime/bootstrap hygiene: confirm no tracked or unignored `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, or `.openclaw/**` paths enter the branch or evidence.
