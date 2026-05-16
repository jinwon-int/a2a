# R28 Team1/yukson Terminal Brief Progress Semantics Libero Validation

Issue: [a2a-plane#370](https://github.com/jinwon-int/a2a-plane/issues/370)  
Run: `a2a-r28-terminal-brief-progress-semantics-yukson-20260516`  
Lane: `yukson` / Team1 libero validation (Terminal Brief progress semantics contract and validation)  
Parent/origin broker: Seoseo (Team1) — Seoseo is the parent/origin broker and sole operator-facing parent Terminal Brief sender

This is a redacted, no-live validation artifact for R28. It defines the Terminal Brief progress semantics contract, its evidence boundaries, safety gates, and libero validation — **no production deploy, Gateway/broker/worker restart or reload, live provider or Telegram canary, production DB mutation/prune/migration, manual Terminal Brief ACK/replay, historical outbox replay, secret movement/rotation/value disclosure, release/tag publish, repo visibility change, history rewrite, or force-push**. Provider accepted/message-id evidence is send-acceptance only, not read/visibility/Terminal ACK.

## Decision

**R28 Terminal Brief progress semantics: `PR`.** This lane produces:

1. The Terminal Brief progress semantics contract at `contracts/a2a/terminal-brief-progress-semantics.md`.
2. The machine-readable fixture at `fixtures/contract/terminal-brief-progress.json`.
3. This validation document and its accompanying test at `scripts/check-team1-yukson-r28-terminal-brief-progress-semantics-libero.test.mjs`.

These artifacts define the progress semantics — intermediate non-terminal status updates between Start and terminal Done/PR/Block — for the A2A Terminal Brief system. The contract establishes the progress-vs-terminal boundary, report types, evidence requirements, safety gates, and parent aggregation rules.

This PR is **not** approval to:
- Deploy/reload Gateway, broker, or plugin services.
- Send a live provider or Telegram canary.
- Record Terminal Brief ACK.
- Open a live cross-broker relay window.
- Claim operator-visible receipt.
- Mutate terminal-outbox rows.
- Merge sibling lanes' implementation PRs without separate operator approval.

Source-public execution remains `NO_GO`. This is a **source-only** PR: it adds contract documentation and validation test evidence. Runtime activation requires a separate explicit operator approval.

## Validation matrix

### Domain 1 — Progress semantics contract integrity

| Gate | Required behavior | Current evidence snapshot | Closeout state |
|------|-------------------|---------------------------|----------------|
| Progress vs Terminal boundary | Progress is non-terminal, must declare `isProgress: true`, `isTerminal: false`. Terminal kinds (`done`, `pr`, `blocked`) must not be used as progress kinds. | `terminal-brief-progress-semantics.md` Section 1 defines the boundary. Fixture `terminal-brief-progress.json` `boundaryRules` enforces `progressIsNotTerminalEvidence`, `progressMustDeclareIsProgressTrue`, `progressMustDeclareIsTerminalFalse`. | `PASS` |
| Progress report types | Three types defined: `progress` (generic), `progress-checkpoint` (checkpoint-tied), `progress-accept` (broker/runner acknowledgment). Each has required fields, bounded constraints, and kind literals that do not overlap with terminal kinds. | `terminal-brief-progress-semantics.md` Section 2 defines the three types. Fixture `progressReportTypes` enumerates all required and optional fields with kind literals. `invalidExamples` include a `kind: "done"` overlap case. | `PASS` |
| Progress evidence requirements | Redaction rules match terminal evidence standards. Idempotency via `taskId` + `sequence`. Bounded size: 280 char summary, 20 file entries, 10 check entries. Sequence monotonic and gap-detected. | `terminal-brief-progress-semantics.md` Section 3 defines redaction, idempotency, bounded size, and sequence gap rules. Fixture `boundedConstraints` matches. | `PASS` |
| Safety gates | Six gates: no terminal outbox ACK mutation, no provider notification, no aggregate title advancement, no terminal kind overlap, no cursor advancement, sequence integrity. | `terminal-brief-progress-semantics.md` Section 4 defines all six gates. Fixture `safetyGates` enumerates each with required evidence. | `PASS` |
| Parent aggregation context | Progress relayed as non-terminal entry, must not change `projectionState` to `projected`, must not trigger aggregate notification, must carry parent metadata, must be ignored for aggregate title. | `terminal-brief-progress-semantics.md` Section 5 defines parent aggregation rules. Fixture `parentAggregationRules` confirms all constraints. | `PASS` |

### Domain 2 — Contract fixture conformance

| Gate | Required behavior | Current evidence snapshot | Closeout state |
|------|-------------------|---------------------------|----------------|
| Fixture frozen at v0 | Fixture declares `v0Freeze` with date, round, and note. | `terminal-brief-progress.json` `v0Freeze` records `2026-05-16`, round `a2a-r28-terminal-brief-progress-semantics-yukson-20260516`. | `PASS` |
| Valid examples exist and match schema | At least one valid example per progress report type, with correct field structure. | Three `validExamples` cover `progress`, `progress-checkpoint`, and `progress-accept`. Each matches the required field list. | `PASS` |
| Invalid examples exist and are properly rejected | Invalid examples must demonstrate boundary violations. | Three `invalidExamples`: kind overlap (`done`), progress marked as terminal, missing required field (`sequence`). | `PASS` |
| Redaction rules declared | Fixture declares `redactionRules` matching the contract. | `redactionRules` block lists seven rules: no secrets, no private endpoints, no raw session dumps, no host-specific paths, no runtime/bootstrap context files, repo-safe changed files, safe-to-display check commands. | `PASS` |
| Safety confirmations declared | Fixture declares `safetyConfirmations` with all seven fields. | `safetyConfirmations` block lists all seven confirmations, all set to `true`. | `PASS` |

### Domain 3 — Libero validation test coverage

| Gate | Required behavior | Current evidence snapshot | Closeout state |
|------|-------------------|---------------------------|----------------|
| Test binds issue, run, lane, and safe no-live scope | Test asserts `a2a-plane#370`, run id, lane identity, and no-live scope. | `check-team1-yukson-r28-terminal-brief-progress-semantics-libero.test.mjs` first test covers these. | `PASS` |
| Test validates contract document existence and structure | Test reads the contract doc and asserts required sections exist. | Second test covers `terminal-brief-progress-semantics.md` sections 1-5, progress report types, safety gates, parent aggregation rules. | `PASS` |
| Test validates fixture structure and boundary rules | Test reads the fixture and asserts `v0Freeze`, `boundaryRules`, `safetyGates`, `parentAggregationRules`, valid/invalid examples, `redactionRules`, `safetyConfirmations`. | Third test covers all fixture top-level blocks and value assertions. | `PASS` |
| Test validates no OpenClaw runtime/bootstrap files in evidence | Test asserts that forbidden runtime paths are absent from contract and fixture. | Fourth test checks `AGENTS.md`, `SOUL.md`, etc. are not mentioned as content. | `PASS` |
| Test validates safety gates, boundaries, and forbidden claims | Test asserts no false claims of GO, activation, live send, ACK, or operator-visible receipt. | Fifth test checks no-live/no-GO/no-ACK claims in doc. | `PASS` |

### Domain 4 — No-live/no-ACK approval gates

| Gate | Required behavior | Enforcement |
|------|-------------------|-------------|
| No live provider send without operator approval | `liveProviderSend: false` in all contract fixtures and routing decisions. | `terminal-brief-progress-semantics.md` Section 4 gate: `noProviderNotification`. Fixture `safetyGates.noProviderNotification`. |
| No terminal-outbox ACK without ACK-safe proof | `terminalOutboxAckMutated: false` in all fixtures. | `terminal-brief-progress-semantics.md` Section 4 gate: `noTerminalOutboxAckMutation`. Fixture `safetyGates.noTerminalOutboxAckMutation`. |
| No DB mutation for terminal evidence | Progress is read-only: it reads terminal-outbox events and projects them; it does not mutate outbox ACK, receipt, or cursor columns. | `terminal-brief-progress-semantics.md` Section 4 gate: `noCursorAdvancement`. `progressAccept` is non-ACK by design. |
| Progress is not terminal evidence | Every progress record carries `isProgress: true`, `isTerminal: false`. | Fixture `boundaryRules` enforces all five `is*False` declarations. |
| No runtime/bootstrap context files in evidence | `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `.openclaw/**` must not appear in branch diff, PR body, issue comments, or artifact evidence. | `terminal-brief-progress-semantics.md` Section 3.1 redaction rules. Fixture `redactionRules.noRuntimeBootstrapContextFiles: true`. |

## R28 lane snapshot

| Worker | Repo issue | Assigned scope | Snapshot |
|--------|-----------|----------------|----------|
| `yukson` (Team1) | [a2a-plane#370](https://github.com/jinwon-int/a2a-plane/issues/370) | Terminal Brief progress semantics contract and libero validation: define progress report types, progress-vs-terminal boundary, safety gates, evidence requirements, parent aggregation rules, and libero validation test. | PR with contract document, fixture, validation doc, and validation test. |

## Risk list

### Current risks

1. **Progress-notification gap**: The progress semantics contract explicitly forbids provider notification for progress updates unless a separate approved contract authorizes it. There is currently no such contract. Operators who want progress visibility via Telegram or other channels will need a separate progress-notification contract, approval gate, and implementation.

2. **Sequence integrity enforcement**: The contract defines sequence gap detection as a hygiene note, not a terminal blocker. Brokers that ignore sequence gaps will not fail closed. A future hardening round should make gap detection a hard gate.

3. **Parent aggregation optionality**: Parent brokers may optionally expose progress in their aggregation view. This flexibility could lead to inconsistent operator experiences across brokers. A future round should standardize progress exposure behavior.

4. **Progress-checkpoint state drift**: The checkpoint-interrupt contract defines `paused` and `awaiting_operator` as valid checkpoint states. If a broker adds new checkpoint states, the progress-checkpoint report type will need a corresponding update.

5. **Runtime/bootstrap hygiene**: The contract redaction rules cover runtime/bootstrap context files but rely on the same `safeString` mechanism as terminal evidence. Any regex-bypass variant (URL-encoded, base64, abbreviation) would also bypass progress redaction.

## Required checks before R28 closeout

- Terminal Brief progress semantics contract (`contracts/a2a/terminal-brief-progress-semantics.md`) is structurally sound and follows the terminal-semantics.md pattern.
- Progress fixture (`fixtures/contract/terminal-brief-progress.json`) is structurally valid and passes fixture conformance when integrated.
- This validation doc and test pass.
- `npm run test:release-gate` passes with the R28 test included.
- `npm run check:message-id-ack-boundary` remains green (progress semantics must not regress ACK boundary).
- `npm run check` (full release gate) passes for this validation branch.
- No production deploy/restart/reload, live provider/Telegram send, DB mutation/prune/migration, Terminal Brief ACK/replay, historical outbox replay, release/tag, secret movement/disclosure, force-push/history rewrite, visibility change, or cross-broker relay window opening occurred in this validation lane.
- Branch diff, PR body, issue comments, and artifact evidence exclude OpenClaw runtime/bootstrap context files. Before PR creation, fail closed and report exact repo-relative or artifact-relative offending paths for any `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `.openclaw/**`, `BOOTSTRAP.md`, `MEMORY.md`, or `memory/**` file.

## Verification performed for this lane

- Inspected parent issue [a2a-plane#370](https://github.com/jinwon-int/a2a-plane/issues/370) (R28 Team1/yukson Terminal Brief progress semantics).
- Inspected existing terminal result semantics contract: `contracts/a2a/terminal-semantics.md` with four receipt levels and three terminal result types (Done, PR, Block).
- Inspected task lifecycle contract: `contracts/a2a/task-lifecycle.md` with states queued, claimed, running, cancelling, done, pr, blocked, cancelled.
- Inspected checkpoint & interrupt contract: `contracts/a2a/checkpoint-interrupt.md` with paused and awaiting_operator states.
- Inspected parent-terminal-brief-aggregation contract: `contracts/a2a/parent-terminal-brief-aggregation.md` v1 symmetric, four-case routing fixture.
- Inspected existing libero validation patterns: R25 (`team1-yukson-r25-team2-terminal-brief-ops-readiness-libero.md`), activation libero (`team1-yukson-terminal-brief-activation-libero.md`).
- Confirmed no OpenClaw runtime/bootstrap context files exist in the repository checkout.
- Confirmed this patch adds contract documentation, fixture, validation doc, and validation test only — no runtime/bootstrap files in the repository.

## Source-only PR semantics

**Current: `PR`.** This lane produces a PR with contract documentation, fixture, validation document, and validation test. It is **not** runtime activation evidence.

`PR` is a source-only decision. It does not authorize:
- Runtime activation, production deploy, broker restart, Gateway restart, DB mutation.
- Live provider send, Terminal Brief ACK, cross-broker relay window opening.
- Any other live action.

Source execution remains `NO_GO` until a separate explicit operator approval is captured as a distinct downstream artifact.
