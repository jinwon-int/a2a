# Contributing

A2A Plane is currently a private public-readiness candidate. Public contribution flow will be finalized before any visibility change.

## License

Unless explicitly agreed otherwise, contributions to this repository are submitted under the same license as the repository: MIT.

By opening a pull request, issue patch, or other contribution, you confirm that you have the right to submit the contribution and that it may be distributed under the MIT License.

## Safety boundary

Do not include secrets, credentials, private endpoints, local operator paths, Telegram/provider IDs, production data, or real-looking token fixtures in issues, pull requests, examples, docs, tests, or artifacts.

Do not perform production deploys, Gateway restarts, database mutations, provider sends, terminal-outbox ACK mutations, secret rotations, or repository visibility changes unless an operator explicitly approves that specific action.

## A2A Spec-First Change Protocol

Medium and large A2A changes must start from a lightweight spec-first workflow before implementation. This is a documentation and operating layer; it does not authorize production deploys, Gateway restarts, live canaries, DB/outbox mutations, manual Terminal Brief ACK/replay, releases, secret movement, or visibility changes.

Use `docs/a2a-constitution.md` to classify the change:

- **Small**: short, reversible, single-repo work with no approval-sensitive action may proceed directly.
- **Medium**: write a feature spec and implementation plan before implementation.
- **Large**: write a feature spec, implementation plan, task list, and use a detached execution lane such as TaskFlow or A2A evidence workers.

Templates live in `docs/spec-templates/`:

- `a2a-feature-spec.md`
- `a2a-plan.md`
- `a2a-tasks.md`

Issues or PRs for medium/large changes should link the completed spec and plan. Closeout must include evidence and must name approval-sensitive actions that were not performed.
