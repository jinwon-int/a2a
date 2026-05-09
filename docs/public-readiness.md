# Public Readiness Gate

Current decision: **NO-GO/Waiting for public visibility**.

The candidate is not ready for an operator public-visibility approval while the external secret/history scanner lane remains incomplete. This repository must remain private until that blocker is cleared and an operator explicitly approves a visibility change. This page records redacted review evidence only; it does not authorize repository visibility changes, deploys, service restarts, production database mutations, live provider or Telegram sends, terminal-outbox ACK mutations, secret rotation, secret disclosure, history rewrites, or force-pushes.

## Team1 P0 public preflight decision table

Updated for run `team1-a2a-public-p0-20260507T221151Z` at `2026-05-07T22:16:10Z`.

| Decision surface | Current state | Operator decision impact | Evidence |
|---|---|---|---|
| Repository visibility | Private; no visibility change performed | **Public visibility NO-GO** until explicit approval after all blockers close | GitHub metadata remains private; docs keep the private/public-readiness boundary |
| R4 closeout lanes | Closed and merged | Candidate evidence is available for operator review, but does not override the external scanner blocker | R4 lane table below |
| External secret/history scanner | **Blocked/Waiting**: `npm run scan:external-secrets` failed closed because no supported external scanner was installed in this runner | **NO-GO/Waiting**; install `gitleaks` or `trufflehog` in the operator environment and rerun before public visibility approval | `docs/security/r4-external-scan-and-freeze.md`; local command output is redacted and contains no findings payload |
| Local public-readiness/release gate | Passed in this run | Supports operator review, but is not a substitute for the external scanner lane | `npm ci --ignore-scripts --include=dev`, `npm run check`, `npm run scan:public-readiness`, `node scripts/redacted-readiness-inventory.mjs`, and `npm run test:release-gate` |
| Runtime/bootstrap hygiene | Clear for this branch/evidence when only tracked diff files are included | Fail closed if any runtime/bootstrap path enters the branch or evidence | Guard paths: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `.openclaw/**` |
| Public docs/SECURITY/templates/CODEOWNERS/README decision surface | Clear private-candidate and hard NO-GO boundaries remain documented | Ready for operator review once scanner and PR evidence blockers are cleared; public visibility remains **NO-GO** now | `README.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`, `CODEOWNERS`, this page |

Explicit state split: the documentation surface is **ready for operator review**, but the repository is **not ready for public visibility**. The active decision is **NO-GO/Waiting** because the external scanner lane is incomplete.

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
- GitHub repository metadata: `jinwon-int/a2a-plane` remains private.
- Runtime/bootstrap hygiene: no tracked or unignored runtime/bootstrap context paths are entering this branch or evidence; root public-readiness scan reported no findings.

## R4 final closeout state

Team1 R4 prerequisite lanes are closed and merged:

| Lane | State | Merged PR |
|---|---|---|
| `#32` | Closed | `#38` |
| `#33` | Closed | `#36` |
| `#34` | Closed | `#37` |

Final R4 closeout decision: **ready for operator visibility decision; public visibility remains NO-GO** until 진원님 explicitly approves a repository visibility change. GitHub repository metadata was verified private during this closeout refresh.

Final closeout PR for `#35` is this task PR, with parent tracking in `#31`.

Final R4 local validation on the closeout refresh passed at `2026-05-07T20:19:47Z` unless noted:

- `npm ci --ignore-scripts --include=dev`: passed.
- `npm run scan:public-readiness`: passed with no findings.
- `npm run check`: passed; release gate completed layout, package checks, public-readiness scan, and compatibility-baseline validation.
- `node scripts/redacted-readiness-inventory.mjs`: passed with redacted metadata only; total `2` finding classes remained for operator disposition (`absolute-private-path`, `private-topology-term`) with no matched values printed.
- `npm run test:release-gate`: passed `3/3`.
- `npm run scan:external-secrets`: blocked because no supported external scanner (`gitleaks` or `trufflehog`) was installed in this runner; this remains fail-closed external scanner evidence, not a substitute scan.
- Runtime/bootstrap hygiene: no tracked or unignored `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, or `.openclaw/**` paths enter this branch or evidence.

This R4 closeout refresh performed only redacted repository evidence updates and local validation. It did **not** perform any repository visibility change, release, deploy, Gateway/broker/worker restart, production database mutation, live provider/Telegram send, terminal-outbox ACK, secret rotation, secret disclosure, history rewrite, or force-push.

## Team1 P0 libero aggregate closeout framework

Issue `#44` uses the read-only `npm run libero:public-preflight-closeout -- --input <redacted-evidence.json> --markdown` framework to aggregate the required `bangtong`, `sogyo`, and `nosuk` lanes before any public visibility decision. The framework fails closed as `Waiting` when any sibling lane is still active or missing, and as `Block` when terminal lane evidence, scanner evidence, safety flags, or approval separation are unresolved.

A public visibility **GO** must not be declared unless both local public-readiness and external secret/history scanner evidence are clean, the repository remains private up to the decision point, and operator approval is explicitly separated from any visibility execution step. Without explicit visibility approval from 진원님, the aggregate decision remains **NO-GO** even when all lanes and scanners are clean.

## Post-R5 A2A dispatch synthesis (Bangtong lane)

Parent: [#75](https://github.com/jinwon-int/a2a-plane/issues/75).

R5 lanes [#76](https://github.com/jinwon-int/a2a-plane/issues/76), [#77](https://github.com/jinwon-int/a2a-plane/issues/77), [#78](https://github.com/jinwon-int/a2a-plane/issues/78), and [#79](https://github.com/jinwon-int/a2a-plane/issues/79) are closed and merged via PRs [#80](https://github.com/jinwon-int/a2a-plane/pull/80), [#81](https://github.com/jinwon-int/a2a-plane/pull/81), and [#82](https://github.com/jinwon-int/a2a-plane/pull/82).

a2a-plane R4 follow-on PRs [#92](https://github.com/jinwon-int/a2a-plane/pull/92) and [#95](https://github.com/jinwon-int/a2a-plane/pull/95) are merged.

A follow-on A2A dispatch round cross-repo synthesis (post-merge state after `openclaw-plugin-a2a#235` and `a2a-broker#433/#434`):

| Lane | Repo | Issue | PR | Status |
|---|---|---|---|---|
| Sogyo (A2A Inspector conformance gate) | `jinwon-int/openclaw-plugin-a2a` | [#234](https://github.com/jinwon-int/openclaw-plugin-a2a/issues/234) | [#235](https://github.com/jinwon-int/openclaw-plugin-a2a/pull/235) | Merged |
| Nosuk (broker lifecycle → A2A 1.0 task mapping) | `jinwon-int/a2a-broker` | [#431](https://github.com/jinwon-int/a2a-broker/issues/431) | [#434](https://github.com/jinwon-int/a2a-broker/pull/434) | Merged |
| Yukson (Worker Capability/AgentCard registry) | `jinwon-int/a2a-broker` | [#432](https://github.com/jinwon-int/a2a-broker/issues/432) | [#433](https://github.com/jinwon-int/a2a-broker/pull/433) | Merged |

**Synthesis decision: NO-GO / Waiting.**

- All three sibling cross-repo lanes are now merged (`openclaw-plugin-a2a#235`, `a2a-broker#433`, `a2a-broker#434`). This clears the sibling-lane blocker.
- Upstream gate [openclaw/openclaw#78261](https://github.com/openclaw/openclaw/pull/78261) remains open and blocks Terminal Brief/source closeout activation.
- External secret scanner unavailable (fail-closed).
- Explicit operator approval for public repository visibility is still required.
- Repository visibility remains **NO-GO** until upstream receipt proof is available, scanner evidence is clean, and operator explicitly approves.
- Issue [#75](https://github.com/jinwon-int/a2a-plane/issues/75) remains open: all public-readiness gates are not yet met.

Relevant cross-repo guardrail docs:
- `contracts/a2a/task-lifecycle.md` — A2A task-state mapping reference.
- `contracts/a2a/worker-registration.md` — Worker registration and capability assumptions.
- `contracts/a2a/terminal-semantics.md` — Terminal ACK boundary.
- `docs/r6-terminal-brief-openclaw-routing-synthesis.md` — R6 upstream gate and no-bypass rules.

## R7 public-readiness closeout refresh (post-merge)

Bangtong lane closeout refresh after merged round `a2a-plane#92/#95`, `openclaw-plugin-a2a#235`, `a2a-broker#433/#434`.

Parent: [#75](https://github.com/jinwon-int/a2a-plane/issues/75).
Roadmap: [#294](https://github.com/jinwon-int/a2a-broker/issues/294).

Local validation on this closeout refresh:

- `npm ci --ignore-scripts --include=dev`: passed.
- `npm run scan:public-readiness`: passed with no findings.
- `npm run check`: release gate passed (layout, package checks, public-readiness scan, compatibility-baseline validation).
- `npm run test:release-gate`: passed (3/3).
- `npm run scan:external-secrets`: blocked — no supported external scanner (`gitleaks` or `trufflehog`) installed in this runner; remains fail-closed.
- Runtime/bootstrap hygiene: no tracked or unignored `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, or `.openclaw/**` paths enter this branch or evidence.

Decision: **NO-GO / Waiting.**

- Sibling cross-repo lanes are now merged, clearing that blocker.
- `openclaw/openclaw#78261` remains the upstream Terminal Brief gate; do not claim it is rolled out.
- External secret scanner evidence remains unavailable (fail-closed).
- Explicit operator approval for repository visibility is still required.
- Issue [#75](https://github.com/jinwon-int/a2a-plane/issues/75) remains open.

This closeout refresh performed redacted documentation evidence updates and local validation only. It did **not** perform any repository visibility change, release, deploy, Gateway/broker/worker restart, production database mutation, live provider/Telegram send, terminal-outbox ACK, secret rotation, secret disclosure, history rewrite, or force-push.

## R9 Preflight Refresh: Upstream Conflict Gate (Bangtong lane)

Parent: [#75](https://github.com/jinwon-int/a2a-plane/issues/75).
Roadmap: [#294](https://github.com/jinwon-int/a2a-broker/issues/294).

Live preflight at dispatch (`team1-a2a-public-p0-next-round`): `openclaw/openclaw#78261` is OPEN and now `mergeable=CONFLICTING`, `mergeStateStatus=DIRTY`. No failed or in-progress checks were reported at the exact poll snapshot. This is an **external blocker only** — no upstream maintainer action is authorized from this repository.

This refines the G1 gate shape from "open and unmerged" to "CONFLICTING/DIRTY merge gate." The upstream PR has a merge conflict that must be resolved by the openclaw/openclaw maintainers before it can land. The conflict is not actionable from A2A Plane and does not change the NO-GO decision; it hardens the upstream-merge gate.

### G1 Gate Refinement: Upstream Conflict State

| Field | Previous State (R8) | Current State (R9 preflight) |
|---|---|---|
| PR status | Open, unmerged | Open, unmerged |
| Mergeability | `mergeable=MERGEABLE` (assumed) | `mergeable=CONFLICTING` |
| Merge state | Clean (assumed) | `mergeStateStatus=DIRTY` |
| Required action | Wait for merge + rollout + receipt proof | Wait for **upstream conflict resolution** → merge → rollout → receipt proof |

The conflict adds a prerequisite: even if rollout and receipt proof were ready, the PR cannot merge until the conflict is resolved upstream. This does not relax or bypass any existing gate.

### Aggregate Decision

**NO-GO / Waiting.** All three gates remain NO-GO. G1 is now gated on upstream conflict resolution in addition to merge + runtime rollout + receipt proof. G2 requires external scanner tooling and clean output. G3 requires explicit operator approval separated from execution. Until all three gates are GO, `#75` must remain open.

### Seoseo Evidence Collection Checklist (updated for conflict gate)

Seoseo is responsible for collecting and linking the following evidence before requesting `#75` closeout. Items marked **(new)** are added for the CONFLICTING/DIRTY preflight state.

1. **G1 evidence (upstream gate):**
   - [ ] **(new)** Confirm `openclaw/openclaw#78261` shows `mergeable=MERGEABLE` and `mergeStateStatus=CLEAN` (conflict resolved upstream).
   - [ ] **(new)** Link to the upstream commit or force-push that resolved the conflict (the PR must show a clean diff against its base).
   - [ ] Link to merged `openclaw/openclaw#78261`.
   - [ ] Link to the OpenClaw runtime build/release tag that includes the merged change.
   - [ ] Link to a follow-up proof (issue/PR comment or CI log) showing **current-session-visible receipt** for the Terminal Brief route. Provider acceptance or `messageId` alone is insufficient.
   - [ ] Confirmation that the proof was produced with the rolled-out runtime, not a pre-merge snapshot.

2. **G2 evidence:**
   - [ ] Install `gitleaks` and/or `trufflehog` in the operator environment.
   - [ ] Run `npm run scan:external-secrets` and link the output (redacted).
   - [ ] If findings exist, document operator disposition for each finding class.
   - [ ] Confirm the scanner evidence postdates the last commit touching secrets-adjacent paths.

3. **G3 evidence:**
   - [ ] Link to an explicit operator (진원님) approval comment in the `#75` issue or a linked decision issue.
   - [ ] The approval text must reference repository visibility/publication explicitly (not just "docs look good" or "checks passed").
   - [ ] Approval must be separate from any automation that would execute the visibility change.

4. **Cross-check evidence (all lanes):**
   - [ ] All sibling cross-repo lanes remain merged and unregressed (`openclaw-plugin-a2a#235`, `a2a-broker#433`, `a2a-broker#434`).
   - [ ] `npm run check` passes on the tip of the candidate branch.
   - [ ] `npm run test:release-gate` passes `3/3`.
   - [ ] `npm run scan:public-readiness` reports no new findings.
   - [ ] Runtime/bootstrap hygiene confirmed: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, and `.openclaw/**` are not entering the branch or evidence.
   - [ ] Repository visibility remains private up to the decision point.

Seoseo must link each piece of evidence in a comment on `#75`. Only when all checkboxes in this checklist are satisfied and the three GO/NO-GO gates are all GO may `#75` be considered for closeout.

This preflight refresh performed redacted documentation evidence updates and local validation only. It did **not** perform any repository visibility change, release, deploy, Gateway/broker/worker restart, production database mutation, live provider/Telegram send, terminal-outbox ACK, secret rotation, secret disclosure, history rewrite, force-push, or upstream maintainer action.

---

## R8 Operator Decision Packet: Public-Readiness GO/NO-GO Matrix (Bangtong lane) [SUPERSEDED by R9 above]

Parent: [#75](https://github.com/jinwon-int/a2a-plane/issues/75).
Roadmap: [#294](https://github.com/jinwon-int/a2a-broker/issues/294).

This packet is the Team1 next-round operator decision surface for `bangtong`. It distills the three remaining public-readiness gates into a single GO/NO-GO matrix and defines exactly what evidence `seoseo` must collect before closing `#75`. All sibling cross-repo lanes are merged (`openclaw-plugin-a2a#235`, `a2a-broker#433`, `a2a-broker#434`). Do **not** mark `#75` complete unless all three gates in this matrix are met.

### GO/NO-GO Decision Matrix

| Gate | Current State | Required for GO | NO-GO Trigger |
|---|---|---|---|
| **G1: Upstream `openclaw/openclaw#78261` merge / runtime rollout** | **NO-GO / Waiting.** PR [#78261](https://github.com/openclaw/openclaw/pull/78261) is open and unmerged. `providerAccepted` alone is insufficient; current-session-visible receipt proof is required per `docs/r6-terminal-brief-openclaw-routing-synthesis.md`. | `openclaw/openclaw#78261` is merged, released or pinned to an exact OpenClaw runtime build, and rolled out. A follow-up proof shows current-session-visible receipt for the Terminal Brief route. | Claiming GO before merge + rollout + fresh receipt proof. Treating `providerAccepted`, `accepted`, `sent`, or Telegram `messageId` as terminal ACK evidence. |
| **G2: Final external scanner evidence** | **NO-GO / Blocked.** `npm run scan:external-secrets` exits non-zero because neither `gitleaks` nor `trufflehog` is installed in the runner environment. See `docs/security/r4-external-scan-and-freeze.md`. | `npm run scan:external-secrets` exits zero with clean findings (or findings dispositioned by operator with redacted evidence). At least one supported scanner (`gitleaks` or `trufflehog`) produces a clean report. | Claiming GO without scanner output. Running a local-only substitute (`npm run scan:public-readiness`, `node scripts/redacted-readiness-inventory.mjs`) and treating it as external scanner evidence. |
| **G3: Explicit operator approval for repository visibility/publication** | **NO-GO / Waiting.** Repository remains private. No operator has issued an explicit visibility-change approval. `docs/public-transition-smoke-plan.md` defines the post-approval checklist but does not authorize the transition itself. | 진원님 explicitly approves a repository visibility change in a linked issue/PR comment. Approval is separate from any execution step. | Claiming GO because "docs are ready" or "all checks passed." Executing a visibility change without explicit operator approval. |

### Aggregate Decision

**NO-GO / Waiting.** All three gates are NO-GO. G1 requires upstream merge + runtime rollout + receipt proof. G2 requires external scanner tooling and clean output. G3 requires explicit operator approval separated from execution. Until all three gates are GO, `#75` must remain open.

### Seoseo Evidence Collection Checklist (must complete before closing `#75`)

Seoseo is responsible for collecting and linking the following evidence before requesting `#75` closeout:

1. **G1 evidence:**
   - [ ] Link to merged `openclaw/openclaw#78261`.
   - [ ] Link to the OpenClaw runtime build/release tag that includes the merged change.
   - [ ] Link to a follow-up proof (issue/PR comment or CI log) showing **current-session-visible receipt** for the Terminal Brief route. Provider acceptance or `messageId` alone is insufficient.
   - [ ] Confirmation that the proof was produced with the rolled-out runtime, not a pre-merge snapshot.

2. **G2 evidence:**
   - [ ] Install `gitleaks` and/or `trufflehog` in the operator environment.
   - [ ] Run `npm run scan:external-secrets` and link the output (redacted).
   - [ ] If findings exist, document operator disposition for each finding class.
   - [ ] Confirm the scanner evidence postdates the last commit touching secrets-adjacent paths.

3. **G3 evidence:**
   - [ ] Link to an explicit operator (진원님) approval comment in the `#75` issue or a linked decision issue.
   - [ ] The approval text must reference repository visibility/publication explicitly (not just "docs look good" or "checks passed").
   - [ ] Approval must be separate from any automation that would execute the visibility change.

4. **Cross-check evidence (all lanes):**
   - [ ] All sibling cross-repo lanes remain merged and unregressed (`openclaw-plugin-a2a#235`, `a2a-broker#433`, `a2a-broker#434`).
   - [ ] `npm run check` passes on the tip of the candidate branch.
   - [ ] `npm run test:release-gate` passes `3/3`.
   - [ ] `npm run scan:public-readiness` reports no new findings.
   - [ ] Runtime/bootstrap hygiene confirmed: `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, and `.openclaw/**` are not entering the branch or evidence.
   - [ ] Repository visibility remains private up to the decision point.

Seoseo must link each piece of evidence in a comment on `#75`. Only when all checkboxes in this checklist are satisfied and the three GO/NO-GO gates are all GO may `#75` be considered for closeout.

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

## Approval-gated transition plan

See [Approval-Gated Public Transition Smoke Plan](./public-transition-smoke-plan.md) for the exact post-approval checklist. The plan is documentation only: keep the repository private unless 진원님 explicitly approves a later visibility transition, use redacted evidence, and do not publish npm/Docker artifacts, create a public release, deploy, restart services, mutate production data, send provider/Telegram messages, ACK terminal outbox records, rotate/disclose secrets, rewrite history, or force-push.

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
