# R6 Terminal Brief OpenClaw routing no-bypass synthesis

Issue: [#87](https://github.com/jinwon-int/a2a-plane/issues/87)  
Parent: [#83](https://github.com/jinwon-int/a2a-plane/issues/83)  
Upstream gate: [`openclaw/openclaw#78261`](https://github.com/openclaw/openclaw/pull/78261)

## Decision

**Done synthesis / activation remains blocked.** It is safe for A2A Plane to prepare Terminal Brief notice plumbing around OpenClaw CLI/Gateway/outbound lifecycle abstractions, but unsafe to use that plumbing as a terminal ACK path while `openclaw/openclaw#78261` is still unmerged/unrolled out and does not provide current-session-visible receipt proof.

`providerAccepted`, provider send success, Telegram message ids, or Gateway outbound success are **notice transport evidence only**. They must remain non-ACK and must not close Terminal Brief receipt gaps.

## Evidence reviewed

- `#75` R5 closeout deferred Terminal Brief/source closeout until `openclaw/openclaw#78261` is merged and rolled out with fresh proof.
- `#83` R6 parent allows OpenClaw routing preparation only as no-bypass best-effort notice plumbing.
- `#84`, `#85`, and `#86` had Start evidence only at this snapshot; no sibling PR/Done/Block outputs were available to count as passing gates.
- `openclaw/openclaw#78261` was still open at this snapshot and describes `delivery.providerAccepted` as separate from read receipts or user-visibility guarantees.
- Current repo guardrails already state the core boundary:
  - `contracts/a2a/terminal-semantics.md` says provider-send success is not ACK evidence.
  - `contracts/a2a/broker-handoff-protocol.md` says terminal evidence relay does not ACK terminal outbox rows.
  - `packages/openclaw-plugin-a2a/docs/operator-terminal-notification-receipts.md` requires current-session/user-visible or manual receipt before terminal notification ACK.
  - `packages/openclaw-plugin-a2a/src/operator-notification-adapter.ts` skips live sends when the runtime does not advertise current-session-visible receipt support and rejects provider-only results as missing receipt confirmation.
  - `packages/broker/scripts/terminal-brief-activation-report.mjs` keeps code merge, send evidence, operator-visible receipt, manual ACK, and no-live restoration as separate gates.

## Unsafe bypass patterns to reject

Do not merge or run changes that do any of the following:

1. Treat `providerAccepted`, `accepted`, `sent`, Telegram `messageId`, or generic Gateway send success as `current_session_visible`, `operator_visible`, `receipt_confirmed`, or terminal ACK evidence.
2. Call Telegram Bot API directly, shell out to `curl`, or add ad-hoc provider delivery for Terminal Brief notices instead of using OpenClaw routing/outbound lifecycle seams.
3. Enable live Terminal Brief notification by default, send historical/backlog Terminal Brief rows, or bypass the one-shot/fresh-task guard.
4. Mutate broker terminal-outbox ACK state from a provider send callback or from a PR/Done/Block GitHub evidence relay.
5. Paste provider ids, Telegram ids, OpenClaw runtime/bootstrap files, raw session dumps, secrets, or host-specific paths into issue/PR evidence.

## Follow-up gates before activation

Proceed only after all gates are satisfied and linked from the parent issue:

1. `openclaw/openclaw#78261` is merged, released or pinned to an exact OpenClaw runtime build, and rolled out to the Gateway instance intended to own Terminal Brief delivery.
2. A follow-up OpenClaw proof shows **current-session-visible receipt** for the Terminal Brief route. Provider acceptance alone is insufficient, even after `#78261`.
3. R6 sibling lanes finish with PR/Done/Block evidence:
   - broker contract rejects direct Telegram/curl Terminal Brief paths;
   - plugin bridge uses OpenClaw routing/outbound lifecycle and remains ACK fail-closed without current-session-visible proof;
   - CI/static guard prevents regressions into direct provider sends or providerAccepted-as-ACK.
4. A no-live preflight proves runtime/config readiness without deploy, Gateway restart/reload, provider send, DB mutation, terminal ACK, source visibility change, or secret rotation.
5. Any live proof is explicitly operator-approved, one-shot, tied to a fresh task/outbox id, and records current-session-visible receipt before ACKing that exact id.
6. After proof, no-live defaults are restored and evidence is redacted; runtime/bootstrap context files must not enter the branch or artifacts.

Until these gates pass, the correct Terminal Brief closeout status is **Block / waiting on receipt-capable OpenClaw runtime proof**, not live notification or ACK activation.
