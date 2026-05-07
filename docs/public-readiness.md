# Public Readiness Gate

This repository is private until every gate below is closed with evidence.

## NO-GO gates

- [x] License decision approved and committed: MIT. NOTICE is not required for MIT unless future third-party notices require it.
- [ ] Secret and history scan clean or explicitly dispositioned with redacted evidence.
- [ ] Private topology, host names, local paths, Telegram/provider IDs, and real-looking fake credentials removed from public docs/examples.
- [ ] Broker, plugin, runner, contracts, and examples import via sanitized/squash import.
- [ ] Integrated CI passes: `npm ci --ignore-scripts --include=dev`, root `npm run check`, package-local checks where present, unit tests, public-readiness scan, and no-live smoke where available.
- [ ] Compatibility matrix names exact broker/plugin/runner/OpenClaw baselines and links the candidate CI run.
- [ ] Shared A2A contracts document Done/Block/PR terminal semantics, provider-send versus ACK boundaries, and worker registration/read-model assumptions.
- [ ] Release notes state no deploy/restart/provider send/DB mutation/terminal ACK/visibility change was performed unless explicitly approved.

## R3 closeout validation

See [R3 Closeout Validation](./r3-closeout-validation.md). The current final decision is **Waiting / Block** while prerequisite lanes `#16`, `#17`, and `#23` remain open. Public visibility remains blocked until those lanes close, final validation is re-run, runtime/bootstrap context hygiene is verified, and an operator explicitly approves any visibility change.

## R3 security disposition

See [R3 Secret / History Scan Disposition](./security/r3-secret-history-disposition.md). The current monorepo root scanner has no token-shaped findings after Team1 recovery, but public visibility remains blocked until source-history exposure is avoided and private topology/path fixtures are sanitized or dispositioned.

## Current source repos

- `jinwon-int/a2a-broker`
- `jinwon-int/openclaw-plugin-a2a`
- `jinwon-int/a2a-docker-runner`

## Review ownership draft

`CODEOWNERS` is currently a private placeholder and must be replaced with actual maintainers or teams before any public release.

## License decision

Operator decision for R2 gate #6: use MIT License for the A2A monorepo candidate. Public visibility remains blocked until the rest of this readiness gate is closed.
