import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(repoRoot, 'docs', 'validation', 'a2a-allhands-stability-closeout-gates.md');

async function doc() {
  return readFile(docPath, 'utf8');
}

test('all-hands closeout gates bind the parent round and required trackers', async () => {
  const content = await doc();

  assert.match(content, /a2a-allhands-stability-parent-soonwook-20260513T030320Z/);
  for (const reference of [
    'a2a-broker#532',
    'a2a-plane#272',
    'a2a-plane#240',
    'a2a-plane#267',
    'a2a-plane#268',
    'a2a-broker#497',
    'a2a-broker#294',
  ]) {
    assert.match(content, new RegExp(reference.replace('#', '#')));
  }
});

test('all-hands closeout gates require safe #240 merge validation', async () => {
  const content = await doc();

  assert.match(content, /docs\/ecosystem-guide\.md/);
  assert.match(content, /docs\/monorepo-migration-checklist\.md/);
  assert.match(content, /README\.md/);
  assert.match(content, /issues\/239/);
  assert.match(content, /issues\/240/);
  assert.match(content, /merge preflight|Shared file conflict/);
  assert.match(content, /npm run check:layout/);
  assert.match(content, /npm run check:no-diff-closeout-guidance/);
  assert.doesNotMatch(content, /a2a-plane#240.*clean closeout.*without.*267.*268/i);
});

test('all-hands closeout gates keep #497 and #294 as approval-gated residual trackers', async () => {
  const content = await doc();

  for (const phrase of [
    'process memory',
    'terminal outbox total/acked/unacked',
    'dry-run first',
    'provider accepted-send',
    'non-ACK',
    'isApproval: false',
    'isTerminalAck: false',
    'isReadReceipt: false',
    'one-shot allowlist',
    'queue hygiene',
  ]) {
    assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(content, /remain open residual-risk trackers/);
  assert.doesNotMatch(content, /a2a-broker#497.*closed/i);
  assert.doesNotMatch(content, /a2a-broker#294.*closed/i);
});

test('all-hands closeout gates define cross-broker Team1 Terminal Brief watch rules', async () => {
  const content = await doc();

  for (const metadata of [
    'originBrokerId=gwakga',
    'parentBrokerId=gwakga',
    'handoffBrokerId=seoseo',
    'Waiting for projection',
  ]) {
    assert.match(content, new RegExp(metadata.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(content, /stable projection key|idempotency marker/);
  assert.match(content, /child issue or PR\/Done\/Block evidence URL/);
  assert.match(content, /no provider send/);
  assert.match(content, /no terminal-outbox ACK/);
  assert.match(content, /no read receipt/);
  assert.match(content, /no approval/);
});

test('all-hands closeout gates preserve runtime bootstrap and no-live boundaries', async () => {
  const content = await doc();

  for (const denyPath of ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'IDENTITY.md', '.openclaw/**']) {
    assert.match(content, new RegExp(denyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const boundary of [
    'does not deploy',
    'restart',
    'mutate production databases',
    'terminal-outbox rows',
    'send provider or Telegram messages',
    'force-push',
    'report the exact repo-relative offending paths',
  ]) {
    assert.match(content, new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }

  assert.doesNotMatch(content, /approval executed|terminal ACK completed|live provider send completed|repository visibility changed/i);
});
