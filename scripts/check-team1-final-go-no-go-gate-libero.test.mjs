import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(repoRoot, 'docs', 'validation', 'team1-final-go-no-go-gate-libero.md');

async function doc() {
  return readFile(docPath, 'utf8');
}

test('Team1 final go/no-go libero validation covers current run and lanes', async () => {
  const content = await doc();

  assert.match(content, /a2a-source-public-go-nogo-gate-20260511T052500Z/);
  assert.match(content, /a2a-plane#225/);
  assert.match(content, /a2a-plane#227/);
  for (const issue of [
    'a2a-plane#226',
    'openclaw-plugin-a2a#265',
    'a2a-docker-runner#195',
    'a2a-broker#488',
    'a2a-docker-runner#196',
    'a2a-plane#228',
  ]) {
    assert.match(content, new RegExp(issue.replace('#', '#')));
  }
});

test('Team1 final go/no-go libero validation fails closed on Start-only evidence', async () => {
  const content = await doc();

  assert.match(content, /Decision: `NO-GO \/ Waiting`/);
  assert.match(content, /Start markers prove that work began; they are not proof/);
  assert.match(content, /Start marker only/);
  assert.match(content, /No terminal evidence observed/);
  assert.match(content, /PR, Done, or Block evidence/);
  assert.doesNotMatch(content, /Decision: `GO`|aggregate final source-public assessment is \*\*`GO`|source-public execution remains \*\*`GO`/i);
});

test('Team1 final go/no-go libero validation keeps operator approval and execution separate', async () => {
  const content = await doc();

  assert.match(content, /Source-public execution remains \*\*`NO_GO`\*\*/);
  assert.match(content, /Explicit operator approval must be a separate gate/);
  assert.match(content, /cannot be inferred from Start, PR, Done, Block, tests, scanners, provider IDs, or Terminal Brief messages/);
  assert.match(content, /would still not execute approval or publication/);
  assert.doesNotMatch(content, /approval executed|release published|visibility change performed|live provider send completed|Terminal Brief ACK completed/i);
});

test('Team1 final go/no-go libero validation preserves no-live safety gates', async () => {
  const content = await doc();

  for (const phrase of [
    'does not execute approval',
    'repository visibility change',
    'live provider or Telegram send',
    'Terminal Brief ACK',
    'production deploy/restart',
    'database mutation',
    'force-push',
    'automatic merge',
  ]) {
    assert.match(content, new RegExp(phrase.replace('/', '\\/')));
  }
});

test('Team1 final go/no-go libero validation excludes runtime context and raw private evidence', async () => {
  const content = await doc();

  for (const denyPath of ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'IDENTITY.md', '.openclaw/**']) {
    assert.match(content, new RegExp(denyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(content, /fail closed before PR creation if any deny path enters branch or evidence/);
  assert.match(content, /avoid secrets, host-private paths, raw session dumps, provider targets, chat IDs/);
  assert.doesNotMatch(content, /ghp_|github_pat_|Authorization:\s*Bearer|OPENCLAW_CACHE_BOUNDARY|Session ID:|chat_id\s*[:=]/i);
});
