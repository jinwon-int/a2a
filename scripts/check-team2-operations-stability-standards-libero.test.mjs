import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(repoRoot, 'docs', 'validation', 'team2-operations-stability-standards-libero.md');

async function doc() {
  return readFile(docPath, 'utf8');
}

test('Team2 operations/standards libero matrix covers parent and required sibling lanes', async () => {
  const content = await doc();

  assert.match(content, /a2a-ops-stability-and-standards-20260511T063530Z/);
  assert.match(content, /a2a-plane#232/);
  assert.match(content, /a2a-plane#234/);
  for (const issue of [
    'a2a-docker-runner#199',
    'a2a-docker-runner#159',
    'a2a-plane#93',
    'a2a-broker#431',
    'a2a-broker#432',
    'openclaw-plugin-a2a#234',
  ]) {
    assert.match(content, new RegExp(issue.replace('#', '#')));
  }
});

test('Team2 operations/standards libero matrix fails closed while runner false-failure lane is Start-only', async () => {
  const content = await doc();

  assert.match(content, /Round decision: `NO-GO \/ Waiting`/);
  assert.match(content, /Start marker only: https:\/\/github\.com\/jinwon-int\/a2a-docker-runner\/issues\/199#issuecomment-4418161724/);
  assert.match(content, /Start-only evidence/);
  assert.match(content, /A PR marker is not enough/);
  assert.match(content, /aggregate remains `NO-GO \/ Waiting`/);
  assert.doesNotMatch(content, /Round decision: `GO`|aggregate remains `GO`|source-public execution.*`GO`/i);
});

test('Team2 operations/standards libero matrix records merged evidence without treating it as live approval', async () => {
  const content = await doc();

  for (const pr of [
    'a2a-docker-runner/pull/165',
    'a2a-plane/pull/180',
    'a2a-broker/pull/434',
    'a2a-broker/pull/433',
    'openclaw-plugin-a2a/pull/235',
  ]) {
    assert.match(content, new RegExp(pr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(content, /Operator approval remains separate/);
  assert.match(content, /source-public execution, release, visibility change, live sends, deploys\/restarts, and production mutations require a later explicit operator approval/);
  assert.doesNotMatch(content, /approval executed|release published|visibility change performed|live provider send completed|terminal ACK completed/i);
});

test('Team2 operations/standards libero matrix preserves no-live and terminal ACK boundaries', async () => {
  const content = await doc();

  for (const phrase of [
    'does not execute source-public approval',
    'live provider or Telegram send',
    'Terminal Brief ACK',
    'production deploy/restart',
    'Gateway/broker/worker restart',
    'database mutation',
    'force-push',
    'automatic merge',
    'No-live stays no-live',
    'terminal-outbox ACK',
  ]) {
    assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Team2 operations/standards libero matrix documents runtime/bootstrap fail-closed hygiene', async () => {
  const content = await doc();

  for (const denyPath of ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'IDENTITY.md', '.openclaw/**']) {
    assert.match(content, new RegExp(denyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(content, /report the exact repo-relative offending paths and block/);
  assert.doesNotMatch(content, /raw session dump|host-private path disclosure|provider target disclosure/i);
});
