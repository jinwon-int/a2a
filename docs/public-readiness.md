# Public Readiness Gate

Current decision: **ready for operator visibility review; public visibility remains NO-GO**.

This repository must remain private until an operator explicitly approves a visibility change. This page records redacted review evidence only; it does not authorize repository visibility changes, deploys, service restarts, production database mutations, live provider or Telegram sends, terminal-outbox ACK mutations, secret rotation, secret disclosure, history rewrites, or force-pushes.

## R3 operator review state

Team1 R3 prerequisite lanes are closed and merged:

| Lane | State | Merged PR |
|---|---|---|
| Integrated CI release gate and compatibility baselines (`#16`) | Closed | `#29` |
| Public README, quickstart, security docs, and templates (`#17`) | Closed | `#27` |
| Broker-to-broker handoff protocol (`#23`) | Closed | `#28` |
| Final closeout table (`#19`) | Closed | `#26` |

Final local validation on the candidate tree passed at `2026-05-07T14:57:00Z`:

- `npm ci --ignore-scripts --include=dev`: passed.
- `npm run check`: passed; release gate completed layout, package checks, public-readiness scan, and compatibility-baseline validation.
- `node scripts/redacted-readiness-inventory.mjs`: passed and printed redacted metadata only; total `1` finding class remained for operator disposition (`absolute-private-path` in a test fixture path, no matched value printed).
- `npm run test:release-gate`: passed `3/3`.
- GitHub repository metadata: `jinwon-int/a2a` remains private.
- Runtime/bootstrap hygiene: no tracked or unignored runtime/bootstrap context paths are entering this branch or evidence; root public-readiness scan reported no findings.

## NO-GO gates

- [x] License decision approved and committed: MIT. NOTICE is not required for MIT unless future third-party notices require it.
- [x] Secret and history scan clean or explicitly dispositioned with redacted evidence for operator review: root scanner passed with no findings; redacted inventory reports metadata only and keeps matched values out of evidence.
- [x] Private topology, host names, local paths, Telegram/provider IDs, and real-looking fake credentials removed from public docs/examples or dispositioned for operator review.
- [x] Broker, plugin, runner, contracts, and examples import via sanitized/squash import.
- [x] Integrated CI/local gate passes: `npm ci --ignore-scripts --include=dev`, root `npm run check`, package-local checks, unit tests through package checks, public-readiness scan, and no-live release gate.
- [x] Compatibility matrix names exact broker/plugin/runner/OpenClaw baselines and passes the compatibility-baseline checker.
- [x] Shared A2A contracts document Done/Block/PR terminal semantics, provider-send versus ACK boundaries, worker registration/read-model assumptions, and broker-to-broker handoff boundaries.
- [x] Release notes state no deploy/restart/provider send/DB mutation/terminal ACK/visibility change was performed unless explicitly approved.
- [ ] Explicit operator approval for public repository visibility.
- [ ] Final runner PR/CI evidence for this closeout refresh.
- [ ] R4 external secret/history scanner evidence from `npm run scan:external-secrets`, or explicit Block evidence that no supported scanner was available in the operator environment.

## R4 evidence lane

See [R4 External Scan and Release Dry-Run Freeze](./security/r4-external-scan-and-freeze.md). R4 remains a dry-run evidence lane only: keep the repository private, use redacted evidence, and do not publish npm/Docker artifacts or create a public release.

## R3 closeout validation

See [R3 Closeout Validation](./r3-closeout-validation.md). The refreshed decision is **ready for operator visibility review**, but public visibility remains **NO-GO** until explicit operator approval.

## R3 security disposition

See [R3 Secret / History Scan Disposition](./security/r3-secret-history-disposition.md). The root scanner has no current token-shaped or runtime/bootstrap findings. The redacted inventory still records metadata for one absolute-path-shaped test fixture; matched values are intentionally not printed. Operator review may require an external scanner before visibility approval.

## Current source repos

- `jinwon-int/a2a-broker`
- `jinwon-int/openclaw-plugin-a2a`
- `jinwon-int/a2a-docker-runner`

The original source repositories and histories are not approved for public exposure as-is. Public review is scoped to the sanitized/squash monorepo candidate only.

## Review ownership

`CODEOWNERS` now records an interim private visibility-review owner so the file is no longer an empty placeholder. This is not a public maintainer roster; replace it with the approved public maintainer team before any repository visibility change.

## License decision

Operator decision for R2 gate #6: use MIT License for the A2A monorepo candidate. Public visibility remains blocked until explicit operator approval.
