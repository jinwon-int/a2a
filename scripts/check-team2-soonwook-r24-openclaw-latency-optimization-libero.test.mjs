import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(
  repoRoot,
  'docs',
  'validation',
  'team2-soonwook-r24-openclaw-latency-optimization-libero.md',
);

async function doc() {
  return readFile(docPath, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIncludesAll(content, references, flags = '') {
  for (const reference of references) {
    assert.match(content, new RegExp(escapeRegExp(reference), flags));
  }
}

test('R24 libero validation binds issue, parent, run, lane, and safe no-live scope', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'a2a-plane#346',
    'a2a-plane#343',
    'a2a-r24-openclaw-latency-optimization-20260515T0655Z',
    'Lane: `soonwook` / Team2 libero validation',
    'repository and GitHub evidence review',
    'does not deploy, restart Gateway/broker/worker services, reload runtime config',
    'mutate/prune/migrate production databases',
  ]);

  for (const forbiddenClaim of [
    /R24 closeout is `GO`/i,
    /production activation is approved/i,
    /operator approval executed/i,
    /live provider send completed/i,
    /terminal ACK completed/i,
    /operator-visible receipt completed/i,
  ]) {
    assert.doesNotMatch(content, forbiddenClaim);
  }
});

test('R24 validation matrix covers node inspection, OpenClaw runtime, latency causes, and cross-team snapshot', async () => {
  const content = await doc();

  // Domain 1 — Node inspection and system profile
  assertIncludesAll(content, [
    'Node inspection scope',
    'soonwook/vps6',
    'OpenClaw',
    '2026.5.12',
    'deepseek/deepseek-v4-flash',
    '8 processors',
    '24 GB',
    'v22.22.2',
  ]);

  // Domain 2 — Gateway health
  assertIncludesAll(content, [
    'Gateway reachable',
    'gateway token missing',
    'unauthorized',
    'gateway probe',
  ]);

  // Domain 3 — Session store analysis
  assertIncludesAll(content, [
    'Session-store residue',
    'trajectory',
    'checkpoint',
    'Session log',
  ]);

  // Domain 4 — A2A backlog
  assertIncludesAll(content, [
    'A2A worker / broker backlog',
    'a2a-plane#345',
    'a2a-plane#344',
    'a2a-broker#651',
    'openclaw-plugin-a2a#322',
  ]);

  // Domain 5 — Plugin/provider drift
  assertIncludesAll(content, [
    'Plugin / provider discovery drift',
    'gh-issues',
    'browser-automation',
    'openai-codex/gpt-5.5',
    'doctor --fix',
  ]);

  // Domain 6 — Latency cause summary
  assertIncludesAll(content, [
    'Latency cause summary',
    'Gateway unreachable',
    'Legacy model ref',
    'Missing wiki-cache',
  ]);
});

test('R24 lane snapshot lists the validation lane and treats start-only evidence as waiting', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'a2a-plane#346',
    'soonwook',
    'Start evidence + this validation document',
    'Start, queued, running, provider accepted-send, GitHub comment creation, and PR creation are not terminal lane evidence',
    'PR, Done, or Block marker',
  ]);
});

test('R24 risk list covers Gateway auth, legacy model ref, remote listener, session retention, and cross-node diagnostics', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'Risk list and runtime activation blockers',
    'Gateway auth gap',
    'Legacy model ref resolution overhead',
    'No remote Gateway listener',
    'Session store growth without retention policy',
    'Cross-node diagnostic consistency',
  ]);
});

test('R24 runtime activation blockers include all domain-specific requirements and operator separation', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'Runtime activation blockers',
    'Gateway token has been generated and configured',
    'openclaw doctor --fix',
    'source-only GO/NO-GO',
    'No sibling lane relies on Start-only evidence for final closeout',
    'Runtime bootstrap hygiene is confirmed',
    'Operator approval is a separate downstream action',
  ]);
});

test('R24 source-only GO/NO-GO semantics separate GO from runtime activation', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'Source-only GO/NO-GO decision',
    'NO-GO / Waiting',
    '`GO` is a source-only decision',
    'does not authorize runtime activation',
    'production deploy',
    'Terminal Brief ACK',
    'separate explicit operator approval',
    'Source execution remains `NO_GO`',
  ]);
});

test('R24 required checks include Gateway reachability, model refs, sibling evidence, and bootstrap hygiene', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'openclaw gateway probe',
    'openclaw doctor',
    'npm run check',
    'check-team2-soonwook-r24-openclaw-latency-optimization-libero.test.mjs',
    'adds documentation/test evidence only and does not create runtime/bootstrap files',
    'No production deploy/restart/reload, live provider/Telegram send, DB mutation/prune/migration',
  ]);
});

test('R24 bootstrap hygiene fails closed and does not include obvious secret/session leaks', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'OpenClaw runtime/bootstrap context files',
    'AGENTS.md',
    'SOUL.md',
    'USER.md',
    'TOOLS.md',
    'HEARTBEAT.md',
    'IDENTITY.md',
    '.openclaw/**',
    'BOOTSTRAP.md',
    'MEMORY.md',
    'memory/**',
    'offending paths',
  ]);

  assert.doesNotMatch(content, /ghp_|github_pat_|Authorization:\s*Bearer|OPENCLAW_CACHE_BOUNDARY|raw session dump/i);
});

test('R24 verification performed section lists all inspected references', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'a2a-plane#346',
    'a2a-plane#343',
    'a2a-plane#344',
    'a2a-plane#345',
    'a2a-broker#651',
    'openclaw-plugin-a2a#322',
    'openclaw --version',
    '2026.5.12',
    'deepseek/deepseek-v4-flash',
    'v22.22.2',
    'openclaw gateway probe',
    'openclaw doctor',
  ]);
});

test('R24 actions performed section documents safe read-only inspection', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'Actions performed (safe, read-only)',
    'Inspected OpenClaw version, model route, and provider configuration',
    'Collected system profile',
    'Checked Gateway health and event-loop status',
    'Analyzed session store size, trajectory residue, and checkpoint state',
    'Reviewed A2A worker/broker backlog across all sibling lanes',
    'Audited plugin/provider discovery drift and skill configuration',
    'Verified no runtime/bootstrap context files exist in the repository checkout',
    'Created this validation document and companion test script',
  ]);
});

test('R24 operator-required actions are separated from safe actions', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'Actions requiring operator approval',
    'Gateway restart with token',
    'openclaw gateway token rotate',
    'openclaw gateway start',
    'Legacy model ref migration',
    'openclaw doctor --dry-run',
  ]);
});
