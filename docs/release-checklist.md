# v0.1.0 Release Checklist

This checklist prepares evidence for an initial `v0.1.0-alpha` or `v0.1.0` operator decision. It is safe documentation only. Do not create a tag, publish a release, change repository visibility, deploy, restart services, mutate production state, send provider messages, rotate secrets, rewrite history, force-push, or ACK terminal outbox records while completing this checklist.

## Candidate commit

- [ ] Record the exact candidate commit SHA.
- [ ] Confirm the branch/PR contains no OpenClaw runtime/bootstrap files: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, or `.openclaw/**`.
- [ ] Confirm evidence is redacted and contains no secrets, private endpoints, provider IDs, Telegram IDs, raw session dumps, production data, or host-specific private paths.

## CI and local gates

- [ ] GitHub Actions `ci` passes for the exact candidate commit: `https://github.com/jinwon-int/a2a/actions/workflows/ci.yml`.
- [ ] Fresh local install passes: `npm ci --ignore-scripts --include=dev`.
- [ ] Root release gate passes: `npm run check`.
- [ ] Public-readiness scan passes: `npm run scan:public-readiness`.
- [ ] External secret/history scan passes: `npm run scan:external-secrets`, or the operator records explicit fail-closed Block evidence if no supported scanner is available.

## Clone smoke

- [ ] Clone the candidate into a fresh directory without copying private OpenClaw config, local runtime files, or secrets.
- [ ] Run `npm ci --ignore-scripts --include=dev` and `npm run check` from that fresh checkout.
- [ ] Follow `docs/quickstart.md` only with local placeholder values and no production broker, Gateway, worker, provider, or Telegram integration.
- [ ] Confirm README links, package metadata, examples, and docs render without private-source references.

## Docs and release notes

- [ ] Review `README.md`, `CHANGELOG.md`, `docs/release-gate.md`, `docs/public-readiness.md`, and `docs/known-limitations.md` for current status.
- [ ] Ensure compatibility baselines in `contracts/compatibility/matrix.md` are exact and current.
- [ ] Keep unresolved blockers listed in `docs/public-readiness.md`; do not convert Block/NO-GO evidence into Done evidence.

## Final operator gate

- [ ] Operator explicitly chooses `v0.1.0-alpha` or `v0.1.0`.
- [ ] Operator explicitly approves any repository visibility change as a separate decision.
- [ ] Operator explicitly approves any tag/release creation after all required evidence is linked.
- [ ] If publication is desired later, create a separate approval and checklist for npm/Docker artifacts.
