# Terminal Result Semantics (v0 Freeze)

> **v0 Freeze (2026-05-09):** Result types (Done, PR, Block) and the four receipt levels
> (accepted-send, requester-visible, operator-visible, terminal ACK) are frozen.
> The accepted-send non-ACK boundary is locked: provider message IDs and send-status
> values must never be promoted to terminal ACK evidence without an explicit v0→v1 plan.

A2A terminal results are operator-facing evidence, not provider delivery signals. These semantics are stable assumptions for broker, plugin, runner, and imported package behavior.

## GitHub Evidence Projection (Terminal Brief Extension)

GitHub issue/PR comment evidence projection is a first-class Terminal Brief extension defined in
[contracts/a2a/github-evidence-projection.md](github-evidence-projection.md). GitHub comments serve
as durable evidence ledger entries — manifest-bound, idempotent, replay-safe, and redacted — but
they are **never** terminal ACK, read receipts, visibility proof, or operator approval.

- Contract: [contracts/a2a/github-evidence-projection.md](github-evidence-projection.md)
- Fixture: [fixtures/contract/github-evidence-projection.json](../../fixtures/contract/github-evidence-projection.json)
- Conformance: `node test/conformance/check-github-evidence-projection.mjs`

## Result types

- **Done**: the worker completed the requested non-PR task and posted redacted evidence.
- **PR**: the worker completed code or documentation changes and opened, or prepared for the runner to open, a pull request with required check evidence.
- **Block**: the worker intentionally stopped because the request was unsafe, impossible, unclear, or would require approval that was not present.

## Receipt levels

This contract defines four receipt levels in increasing order of assurance:

1. **accepted-send** — the provider accepted the send request and returned a message id. This is lifecycle evidence only; it does not prove delivery, rendering, or human observation. Provider message ids at this level are non-ACK evidence.

2. **requester-visible receipt** — the message appeared in a GitHub issue/PR comment observable by the requesting system. Stronger than accepted-send but still not terminal ACK.

3. **operator-visible receipt** — a human operator has explicitly confirmed seeing the Terminal Brief (manual operator receipt, Telegram delivery confirmation with operator acknowledgment). Acknowledged-delivery evidence, not terminal-outbox ACK.

4. **terminal ACK** — the terminal outbox ACK contract has been satisfied through an explicit ACK-safe evidence path. Only this level may mutate the terminal outbox ACK column.

## ACK boundary

- Provider-send success is receipt level 1 (accepted-send) only. A successful send only means the provider accepted a message for delivery. It is never requester-visible receipt (level 2), operator-visible receipt (level 3), or terminal ACK (level 4).
- Provider message ids are non-ACK lifecycle evidence. They are recorded as accepted-send evidence in routing decisions but never constitute terminal ACK.
- Terminal-outbox ACK mutation is not allowed without explicit operator approval.
- Workers must not treat live Telegram/provider sends outside GitHub comments as terminal evidence for monorepo readiness tasks.
- Evidence must be redacted: no secret values, private endpoint values, raw session dumps, or host-specific private paths.

## Terminal Brief extension: GitHub comment evidence projection

GitHub issue and pull-request comments are a first-class Terminal Brief evidence
projection target. They are useful ledger entries for Start/PR/Done/Block markers,
but they do not change the receipt/approval boundary above.

Every GitHub comment projection MUST be:

- **Manifest-bound**: the projected comment references the runner artifact manifest
  and its digest or equivalent immutable manifest identity. Comments without a
  matching manifest binding are incomplete evidence.
- **Idempotent**: each managed comment has a stable dedupe key derived from the
  task/run, target issue or PR, marker kind, and manifest identity. Replays must
  update or reuse the same managed comment instead of minting duplicate terminal
  markers.
- **Redacted**: comment bodies and projection metadata must contain only compact
  summaries, status/check results, safe GitHub URLs, and manifest identifiers. Do
  not include secrets, provider identifiers, Telegram targets, raw session dumps,
  or host-private paths.
- **Replay-safe**: stale or mismatched manifests block projection. Replaying the
  same manifest/comment key must not mutate terminal-outbox ACK state, advance a
  notification cursor, infer read/visibility, or infer approval.
- **Approval-separated**: PR/Done/Block/Start comments are evidence ledger entries
  only. They are not operator approval for deploys, restarts, terminal ACK,
  database mutation, repository visibility changes, releases, merges, or force
  pushes.

GitHub comments may satisfy requester-visible ledger evidence (receipt level 2),
but they are not read receipts, operator-visible receipt, human-seen proof, or
terminal ACK. Operator approval remains a separate explicit comment or decision
record that names the approved action and scope.

The fixture for this extension lives at:

- `fixtures/terminal-evidence/github-comment-projection.json`

## Safety gates

Terminal evidence must state whether the worker avoided:

- public repository visibility changes,
- production deploys or Gateway restarts,
- production database mutations,
- live provider/Telegram sends outside approved GitHub comments,
- terminal-outbox ACK mutation,
- secret rotation or secret value disclosure.
