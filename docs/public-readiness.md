# Public Readiness Gate

This repository is private until every gate below is closed with evidence.

## NO-GO gates

- [ ] License/NOTICE decision approved and committed.
- [ ] Secret and history scan clean or explicitly dispositioned with redacted evidence.
- [ ] Private topology, host names, local paths, Telegram/provider IDs, and real-looking fake credentials removed from public docs/examples.
- [ ] Broker, plugin, runner, contracts, and examples import via sanitized/squash import.
- [ ] Integrated CI passes: install, build/check, unit tests, public-readiness scan, no-live smoke where available.
- [ ] Compatibility matrix names exact broker/plugin/runner/OpenClaw baselines.
- [ ] Release notes state no deploy/restart/provider send/DB mutation/terminal ACK/visibility change was performed unless explicitly approved.

## Current source repos

- `jinwon-int/a2a-broker`
- `jinwon-int/openclaw-plugin-a2a`
- `jinwon-int/a2a-docker-runner`
