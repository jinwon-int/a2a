import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(repoRoot, 'docs', 'validation', 'team1-yukson-terminal-brief-pre-activation-go-nogo-r8.md');

async function doc() {
  return readFile(docPath, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Team1/yukson R8 pre-activation matrix binds issue, parent, and run', async () => {
  const content = await doc();

  for (const reference of [
    'a2a-plane#285',
    'a2a-broker#553',
    'a2a-r8-ops-dashboard-20260513T111122Z',
    'Decision: `NO-GO / Waiting`',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(reference)));
  }
});

test('Team1/yukson R8 pre-activation matrix covers all five target outcomes', async () => {
  const content = await doc();

  for (const phrase of [
    'Bounded two-broker dashboard/read model',
    'Stale worker/task clarity',
    'PR-less validation evidence',
    'Receipt-safe operator UX',
    'Cross-team parity',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase)));
  }
});

test('Team1/yukson R8 pre-activation matrix defines pre-activation gates', async () => {
  const content = await doc();

  for (const phrase of [
    'G1. Two-broker dashboard/read model',
    'G2. Stale worker/task clarity',
    'G3. PR-less validation evidence',
    'G4. Receipt-safe operator UX',
    'G5. Cross-team parity',
    'G6. Pre-activation rollback definition',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase)));
  }
});

test('Team1/yukson R8 pre-activation matrix is no-live and fail-closed', async () => {
  const content = await doc();

  assert.match(content, /Decision: `NO-GO \/ Waiting` for pre-activation release/);
  assert.match(content, /not advance to `GO for pre-activation rehearsal`/);
  assert.match(content, /does not deploy a broker/);
  assert.match(content, /do not include live Terminal Brief activation/);

  const prohibitedActions = [
    'restart Gateway',
    'perform a live provider send',
    'record Terminal Brief ACK',
    'mutate production data',
    'change secrets',
    'rewrite history',
    'force-push',
    'release',
    'change repository visibility',
  ];
  for (const action of prohibitedActions) {
    assert.match(content, new RegExp(escapeRegExp(action)));
  }

  assert.doesNotMatch(content, /Decision: `GO` for pre-activation rehearsal|GO.` is authorized|live activation is approved/i);
});

test('Team1/yukson R8 pre-activation matrix preserves receipt and ACK boundaries', async () => {
  const content = await doc();

  for (const phrase of [
    'provider accepted-send ≠ operator-visible receipt ≠ terminal-outbox ACK ≠ read-receipt ≠ approval',
    'provider accepted-send is not operator-visible receipt',
    'operator-visible receipt is not terminal-outbox ACK',
    'ACK is not read-receipt or approval',
    'Do not ACK terminal-outbox rows from provider accepted-send',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase)));
  }
});

test('Team1/yukson R8 pre-activation matrix documents two-broker and stale/task surfaces', async () => {
  const content = await doc();

  for (const phrase of [
    'operatorSnapshot',
    'two-broker',
    'stale workers',
    'stale tasks',
    'whyStuck',
    'whoClaimed',
    'whatNext',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase)));
  }
});

test('Team1/yukson R8 pre-activation matrix includes rollback and residual risk sections', async () => {
  const content = await doc();

  assert.match(content, /Rollback \/ abort procedure/);
  assert.match(content, /R8 residual risk matrix/);

  for (const risk of [
    'Two-broker dashboard leaks worker identity',
    'Stale worker/task clarity conflates triage',
    'PR-less evidence lane merged as release',
    'Receipt boundary weakened by dashboard',
    'Parity is assumed without evidence',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(risk)));
  }
});

test('Team1/yukson R8 pre-activation matrix documents runtime context and redaction hygiene', async () => {
  const content = await doc();

  for (const denyPath of ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'IDENTITY.md', '.openclaw/**']) {
    assert.match(content, new RegExp(denyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(content, /fail closed if any OpenClaw runtime\/bootstrap context file would enter/);
  assert.match(content, /avoid secrets, provider targets, chat IDs, raw session dumps, private host paths/);
  assert.doesNotMatch(content, /ghp_|github_pat_|Authorization:\s*Bearer|OPENCLAW_CACHE_BOUNDARY|Session ID:|chat_id\s*[:=]/i);
});

test('Team1/yukson R8 pre-activation matrix references sibling and parent broker issues', async () => {
  const content = await doc();

  for (const ref of [
    'a2a-broker#410',
    'a2a-broker#411',
    'a2a-broker#412',
    'a2a-broker#413',
    'a2a-broker#414',
    'a2a-broker#415',
    'a2a-plane#243',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(ref)));
  }
});

test('Team1/yukson R8 pre-activation matrix GO/NO-GO decision states are complete', async () => {
  const content = await doc();

  for (const state of [
    '`GO for pre-activation rehearsal`',
    '`GO_CANDIDATE / Needs operator approval`',
    '`NO-GO / Waiting`',
    '`BLOCK`',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(state)));
  }
});
