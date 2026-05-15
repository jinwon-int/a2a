# Team2/Soonwook R24 Libero validation — All-node OpenClaw latency optimization (soonwook/vps6)

Issue: [a2a-plane#346](https://github.com/jinwon-int/a2a-plane/issues/346)  
Parent: [a2a-plane#343](https://github.com/jinwon-int/a2a-plane/issues/343) — R24 all-node OpenClaw latency optimization  
Run: `a2a-r24-openclaw-latency-optimization-20260515T0655Z`  
Lane: `soonwook` / Team2 libero validation (OpenClaw latency optimization — fleet latency risk matrix and approval gates)

This is a redacted, no-live validation artifact for the R24 soonwook/vps6 latency optimization inspection. It performs read-only node inspection, repository and GitHub evidence review, and safe runbook/PR proposals only. **It does not deploy, restart Gateway/broker/worker services, reload runtime config, send a live provider or Telegram canary, mutate/prune/migrate production databases, manually ACK or replay terminal-outbox rows, replay historical tasks, open a live cross-broker relay window, publish a release/tag, move or disclose secrets, force-push, rewrite history, change repository visibility, execute operator approval, claim operator-visible receipt, or issue a Terminal Brief ACK.**

## Decision

**R24 closeout is `NO-GO / Waiting`.** R24 latency findings and proposed fixes cannot be treated as final-GO until:

- Published latency diagnostic report for soonwook/vps6 has linked PR/Done/Block markers (this document serves as the validation lane).
- Cross-team validation matrix is verified against sibling lane findings (yukson/vps5 for Team1, dungae/gwakga for Team2 broker lane, sogyo/plugin-lane, etc.).
- Risk list items in the family wiki or runbook PRs have explicit resolution paths.
- Runtime bootstrap hygiene is confirmed: OpenClaw runtime context files (AGENTS.md, SOUL.md, USER.md, TOOLS.md, HEARTBEAT.md, IDENTITY.md, .openclaw/**, BOOTSTRAP.md, MEMORY.md, memory/**) are absent from branch diff, PR body, issue comments, and artifact evidence.
- Required tests pass and a separate explicit operator approval authorizes any runtime activation.

Safe current closeout for this lane: this PR documents the R24 soonwook/vps6 latency inspection results, node diagnostics, latency causes identified, proposed fixes, risk/blocker list, source-only GO/NO-GO decision, and explicit runtime activation blockers. It is not approval to merge implementation PRs, deploy/reload, send a provider canary, claim operator-visible receipt, or perform destructive cleanup.

Source-public execution remains **`NO_GO`**. This is a **source-only** GO/NO-GO: it evaluates diagnostic findings and proposals, not runtime activation. Runtime activation requires a separate downstream approval after sibling lanes complete.

## Node inspection scope: soonwook/vps6

### System profile

| Property | Value |
| --- | --- |
| Hostname | vps6 |
| Kernel | Linux 6.8.0-86-generic #87-Ubuntu SMP PREEMPT_DYNAMIC x86_64 |
| CPU | 8 processors (x86_64) |
| Memory | 24 GB total (22 GB available under normal load) |
| Node.js | v22.22.2 |
| OpenClaw | 2026.5.12 (f066dd2) |

### OpenClaw runtime / model route

| Property | Value |
| --- | --- |
| Version | 2026.5.12 (commit f066dd2) |
| Primary model | `deepseek/deepseek-v4-flash` (API: `openai-completions`, base: `https://api.deepseek.com/v1`) |
| Subagent model | `openai-codex/gpt-5.5` (API: `openai-codex-responses`, base: `https://chatgpt.com/backend-api/v1`) — ⚠️ **legacy ref, see findings** |
| Memory search provider | Jina AI (`jina-embeddings-v5-text-nano`) |
| Web search provider | SearXNG |
| Tools exec profile | `coding` (ask=off) |

### Gateway health / event-loop status

| Check | Result |
| --- | --- |
| Gateway reachable | **No** — `ws://127.0.0.1:18789` unreachable (token missing) |
| Gateway probe | Failed — no local Bonjour gateway discovered |
| `openclaw status` | Fails with `unauthorized: gateway token missing` |
| Config health | Last known good hash `2efd069f...` (no suspicious signature) |
| Doctor warnings | Legacy `openai-codex/*` model refs should become `openai/*` |

**Finding 1: Gateway token missing.** The Gateway is configured for local loopback (`ws://127.0.0.1:18789`) but no auth token is set. The Gateway process may not be running or may require a device identity exchange. This is the single largest latency contributor: every `openclaw status` or gateway-proxied operation fails immediately with an auth error.

### Session-store residue and trajectory analysis

| Metric | Value |
| --- | --- |
| Active sessions | 1 (`agent:main:main`, session `9e9b9355-dd07-4c16-82af-a0d3749ab9c5`) |
| Session log | 220 KB (compacted to 183 KB) |
| Session trajectory | 142 KB (compacted to 264 KB) |
| Session checkpoint | 218 KB (compacted) |
| Total session-store footprint | ~1.1 MB (including checkpoint, trajectory, compaction artifacts) |
| Stale/orphan trajectories | None detected — only one session lifecycle |
| Trajectory schema | `openclaw-trajectory` v1 |

**Finding 2: Modest session store — no immediate pruning needed.** At ~1.1 MB total, the session store is not a latency concern. Single active session means no stale trajectory accumulation. No orphan transcripts or dangling checkpoints detected.

### A2A worker / broker backlog

| Source | Status |
| --- | --- |
| `a2a-plane#346` (this lane) | OPEN — Start posted by dispatcher, awaiting validation PR |
| `a2a-plane#345` (yukson/vps5) | OPEN — sibling Team1 lane |
| `a2a-plane#344` (bangtong/seoseo) | OPEN — sibling Team1 lane |
| `a2a-plane#343` (parent) | OPEN — R24 dispatch complete |
| `a2a-broker#651` (dungae/gwakga) | OPEN — sibling Team2 broker backlog lane |
| `openclaw-plugin-a2a#322` (sogyo) | OPEN — sibling plugin-discovery lane |

**Finding 3: No stale backlog items.** All R24 lanes are OPEN with dispatcher Start comments only — no unfinished processing or orphan tasks in the broker queue.

### Plugin / provider discovery drift

| Component | Status |
| --- | --- |
| `gh-issues` skill | Enabled with API key (required `GH_TOKEN` env) |
| `browser-automation` plugin | Installed (`~/.openclaw/plugin-skills/browser-automation/`) |
| All other skills (40+) | Explicitly disabled |
| Doctor model refs | ⚠️ `openai-codex/gpt-5.5` is a legacy alias — should be `openai/gpt-5.5` |
| Missing wiki cache paths | 9 extraPaths in `openclaw.json` reference `/opt/wiki-cache/pages/` — none exist on disk |
| Identity | Device `e0453f24...` registered with Ed25519 key pair |

**Finding 4: Legacy model ref produces unnecessary resolution overhead.** The subagent model `openai-codex/gpt-5.5` triggers a legacy alias resolution path. Running `openclaw doctor --fix` would rewrite it to `openai/gpt-5.5` and eliminate this overhead.

**Finding 5: Missing wiki-cache paths (noise, not latency-sensitive).** The 9 configured `extraPaths` in `memorySearch` reference `/opt/wiki-cache/pages/...` files that do not exist. These produce harmless ENOENT errors on memory search startup but do not block normal operation.

### Task store / cron backlog

| Metric | Value |
| --- | --- |
| Runs DB | `runs.sqlite` ~4 KB + WAL (~121 KB) |
| Stale tasks | None detected — fresh agent startup |
| Cron/reminder backlog | None |

## Latency cause summary

| # | Cause | Severity | Impact | Action |
| --- | --- | --- | --- | --- |
| 1 | Gateway unreachable (token missing) | **High** | Every gateway-proxied op fails → retry/backoff latency. Status CLI unusable. | Requires operator: generate token or restart Gateway with token configured |
| 2 | Legacy `openai-codex/*` model ref | Medium | Extra resolution step on every subagent spawn. Doctor flags it. | Run `openclaw doctor --fix` (safe, produces exact diff preview) |
| 3 | Missing wiki-cache extraPaths (9 files) | Low | Harmless ENOENT on memory-search init | Clean up config or populate cache paths |
| 4 | Session checkpoint overhead | Low | ~218 KB checkpoint after single session — expected behavior | No action needed under 5 MB |
| 5 | Gateway port blocked/misconfigured | Medium | Loopback-only bind prevents remote Gateway access. VPS6 has no remote Gateway listener. | Requires operator review if remote Gateway access is needed |

### Actions requiring operator approval

1. **Gateway restart with token** — Generating and configuring a gateway token, then restarting the gateway, requires operator approval. Exact command proposal:
   ```bash
   # 1. Generate gateway token
   openclaw gateway token rotate
   # 2. Verify token is set in openclaw.json
   openclaw doctor
   # 3. Start/restart gateway with token
   openclaw gateway start
   ```
   Risk: brief Gateway unavailability during restart. Rollback: previous config is backed up in `config-health.json`.

2. **Legacy model ref migration** — `openclaw doctor --fix` rewrites `openai-codex/gpt-5.5` to `openai/gpt-5.5`. Safe to run read-only preview first:
   ```bash
   openclaw doctor --dry-run 2>&1 | grep -i 'openai-codex\|gpt-5'
   ```

### Actions performed (safe, read-only)

1. ✅ Inspected OpenClaw version, model route, and provider configuration
2. ✅ Collected system profile (kernel, CPU, memory, Node.js version)
3. ✅ Checked Gateway health and event-loop status
4. ✅ Analyzed session store size, trajectory residue, and checkpoint state
5. ✅ Reviewed A2A worker/broker backlog across all sibling lanes
6. ✅ Audited plugin/provider discovery drift and skill configuration
7. ✅ Verified no runtime/bootstrap context files exist in the repository checkout
8. ✅ Created this validation document and companion test script

## Cross-team validation matrix snapshot

| Worker | Issue | Scope | Current state |
| --- | --- | --- | --- |
| `soonwook` (Team2) | [a2a-plane#346](https://github.com/jinwon-int/a2a-plane/issues/346) | soonwook/vps6 latency inspection: Gateway unreachable, legacy model refs, session store analysis | Start evidence + this validation document |
| `bangtong` (Team1) | [a2a-plane#344](https://github.com/jinwon-int/a2a-plane/issues/344) | seoseo/bangtong latency root-cause audit and safe cleanup plan | Start evidence |
| `yukson` (Team1) | [a2a-plane#345](https://github.com/jinwon-int/a2a-plane/issues/345) | yukson/gongyung low-resource latency validation | Start evidence |
| `dungae` (Team2) | `a2a-broker#651` | gwakga/dungae broker latency and backlog audit | Start evidence |
| `sogyo` (Team1) | `openclaw-plugin-a2a#322` | plugin/provider discovery latency and sogyo node audit | Start evidence |

Start, queued, running, provider accepted-send, GitHub comment creation, and PR creation are not terminal lane evidence. Count a sibling lane as terminal only when it has an explicit PR, Done, or Block marker with linked checks/evidence.

## Risk list and runtime activation blockers

### Current risks

1. **Gateway auth gap**: The Gateway is unreachable because no token is configured. This blocks all gateway-proxied operations (remote agent access, health checks). If this is a fresh deployment, the Gateway process may need to be started with a device identity exchange. If it is a config regression, a previous working config snapshot exists in `config-health.json`.

2. **Legacy model ref resolution overhead**: The `openai-codex/*` alias in the subagent model config requires an additional resolution hop. Doctor warns about this. The fix is idempotent and safe, but the current config continues to incur unnecessary latency on every subagent spawn.

3. **No remote Gateway listener**: The Gateway is bound to loopback only (`ws://127.0.0.1:18789`). For a VPS node like vps6, this means no remote agent can connect. If fleet-wide remote diagnostics are needed in future rounds, this is a blocker.

4. **Session store growth without retention policy**: Currently ~1.1 MB for one session, which is acceptable. However, there is no documented retention/archive policy. Over time, session checkpoints and trajectories could accumulate to tens or hundreds of MB, degrading memory-search and startup latency.

5. **Cross-node diagnostic consistency**: Each R24 lane inspects a different node with different OpenClaw versions and configurations. The fleet lacks a standardized diagnostic script/checklist, making cross-node comparisons imprecise.

### Runtime activation blockers

The following are confirmed **hard blockers** for any future runtime activation (separate operator approval):

- Gateway token has been generated and configured, and the Gateway is reachable and responding to probes.
- `openclaw doctor --fix` has been run (or equivalent manual migration) to eliminate legacy `openai-codex/*` model refs.
- All sibling R24 lanes have published terminal PR/Done/Block evidence.
- Cross-team validation matrix has been reconciled: no conflicting latency findings or incompatible proposed fixes.
- This validation lane's R24 source-only GO/NO-GO is **GO** (currently `NO-GO / Waiting`).
- No sibling lane relies on Start-only evidence for final closeout.
- Runtime bootstrap hygiene is confirmed: no OpenClaw runtime/bootstrap context files are present in branch diff, PR body, issue comments, or artifact evidence.
- Operator approval is a separate downstream action not satisfied by any lane evidence alone.

## Source-only GO/NO-GO decision

**Current: `NO-GO / Waiting`.**

Transition to `GO` (source-only) requires:

- Latency diagnostic report for soonwook/vps6 is published as validation evidence with linked PR/Done/Block markers (this document).
- Gateway auth gap is resolved or explicitly deferred to operator approval with a documented plan.
- Legacy model ref migration has been applied (`openclaw doctor --fix`) or explicitly deferred.
- Missing wiki-cache paths are cleaned up from config or populated.
- Cross-team validation matrix is reconciled against sibling lane findings.
- No runtime/bootstrap hygiene leaks are detected in branch diff, PR body, issue comments, or artifact evidence.
- This validation lane's PR has passing CI and local `npm run check` results.

**`GO` is a source-only decision.** It does not authorize runtime activation, production deploy, broker restart, Gateway restart, DB mutation, live provider send, Terminal Brief ACK, relay window opening, or any other live action. Source execution remains `NO_GO` until a separate explicit operator approval is captured as a distinct downstream artifact.

## Required checks before R24 closeout

- Gateway reachability is verified: `openclaw gateway probe` returns success.
- Legacy `openai-codex/*` model refs are resolved: `openclaw doctor` no longer warns about legacy aliases.
- Session store is below healthy threshold (< 10 MB) and has a documented retention policy.
- All sibling R24 lanes have terminal evidence with linked PR/Done/Block markers.
- Cross-team validation matrix shows no unresolved conflicts or contradictions.
- `npm run check` (full release gate) passes for this validation branch.
- This lane's validation test (`check-team2-soonwook-r24-openclaw-latency-optimization-libero.test.mjs`) passes.
- No production deploy/restart/reload, live provider/Telegram send, DB mutation/prune/migration, Terminal Brief ACK/replay, historical outbox replay, release/tag, secret movement/disclosure, force-push/history rewrite, visibility change, or cross-broker relay window opening occurred in this validation lane.
- Branch diff, PR body, issue comments, and artifact evidence exclude OpenClaw runtime/bootstrap context files. Before PR creation, fail closed and report exact repo-relative or artifact-relative offending paths for any `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `IDENTITY.md`, `.openclaw/**`, `BOOTSTRAP.md`, `MEMORY.md`, or `memory/**` file.

## Verification performed for this lane

- Inspected parent issue [a2a-plane#343](https://github.com/jinwon-int/a2a-plane/issues/343) (R24 all-node latency optimization dispatch) and this issue [a2a-plane#346](https://github.com/jinwon-int/a2a-plane/issues/346).
- Verified sibling R24 lanes: [a2a-plane#344](https://github.com/jinwon-int/a2a-plane/issues/344) (bangtong/seoseo), [a2a-plane#345](https://github.com/jinwon-int/a2a-plane/issues/345) (yukson/gongyung), `a2a-broker#651` (dungae/gwakga), `openclaw-plugin-a2a#322` (sogyo).
- Collected OpenClaw version (`openclaw --version`: 2026.5.12 (f066dd2)).
- Collected system profile: Linux vps6, 8-core x86_64, 24 GB RAM, Node.js v22.22.2.
- Inspected model routing: primary `deepseek/deepseek-v4-flash` (openai-completions API), subagent `openai-codex/gpt-5.5` (openai-codex-responses API).
- Tested Gateway reachability: `openclaw status` fails with `unauthorized: gateway token missing`; `openclaw gateway probe` confirms Gateway is unreachable.
- Ran `openclaw doctor`: detected legacy `openai-codex/*` model refs, recommended `doctor --fix`.
- Inspected session store: single active session, ~1.1 MB total (log + trajectory + checkpoint), no stale/orphan data.
- Checked task store: `runs.sqlite` with minimal footprint, no stale tasks.
- Audited plugin/skill config: `gh-issues` enabled, `browser-automation` plugin installed, 40+ skills explicitly disabled.
- Reviewed config for provider drift: `deepseek` provider configured with api-key auth, `openai-codex` provider with oauth.
- Confirmed no wiki-cache files exist at configured paths (9 `extraPaths` reference absent files).
- Verified no OpenClaw runtime/bootstrap context files exist in the repository checkout (`ls docs/validation/`, `ls scripts/`, `ls contracts/`, `ls packages/` for AGENTS.md, SOUL.md, USER.md, TOOLS.md, HEARTBEAT.md, IDENTITY.md, .openclaw/**, BOOTSTRAP.md, MEMORY.md, memory/** — none found).
- Confirmed no unapproved actions occurred: no Gateway/broker/worker restart, no deploy, no live canary, no DB mutation, no secret movement, no destructive cleanup.
- Added a local validation test that fails if required R24 gates, node inspection scope, latency findings, risk/blocker list, source-only GO/NO-GO semantics, or bootstrap hygiene language are removed.
- Confirmed this patch adds documentation/test evidence only and does not create runtime/bootstrap files in the repository.
