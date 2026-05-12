import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(repoRoot, 'docs', 'validation', 'team1-bangtong-rca-config-schema-skew.md');

async function doc() {
  return readFile(docPath, 'utf8');
}

test('Team1 bangtong RCA covers incident anchor, lane, and failure chain timeline', async () => {
  const content = await doc();

  assert.match(content, /a2a-config-schema-skew-prevention-20260511T120400Z/);
  assert.match(content, /a2a-plane#249/);
  assert.match(content, /a2a-plane#250/);
  assert.match(content, /operatorEvents\.crossBrokers/);
  assert.match(content, /openclaw\.json/);
  assert.match(content, /openclaw\.plugin\.json/);
  assert.match(content, /must NOT have additional properties/);
  assert.match(content, /20:13/);
  assert.match(content, /20:44/);
  assert.match(content, /Fail(ure|ed) chain/);
});

test('Team1 bangtong RCA documents all three root causes', async () => {
  const content = await doc();

  assert.match(content, /Why the schema lacked `crossBrokers`/);
  assert.match(content, /schema parity gate/);
  assert.match(content, /additive-only by convention/);

  assert.match(content, /Why Gateway restarts failed silently/);
  assert.match(content, /restart-failure notification/);
  assert.match(content, /Restart retry masking/);

  assert.match(content, /Why `openclaw status` didn.t catch/);
  assert.match(content, /config-schema drift check/);
  assert.match(content, /pre-restart gate/);
});

test('Team1 bangtong RCA documents recurrence prevention across immediate, short-term, and long-term hardening', async () => {
  const content = await doc();

  assert.match(content, /Recurrence prevention/);
  assert.match(content, /Schema type hardening/);
  assert.match(content, /Libero validation matrix/);
  assert.match(content, /CI test that injects a config fixture/);
  assert.match(content, /schema parity command/);
  assert.match(content, /structured operator alerting/);
  assert.match(content, /pre-restart schema parity dry-run/);
  assert.match(content, /release-gate invariant/);
});

test('Team1 bangtong RCA cross-references sibling PRs and preserves evidence-only boundary', async () => {
  const content = await doc();

  assert.match(content, /a2a-plane#255/);
  assert.match(content, /a2a-plane#253/);
  assert.match(content, /a2a-plane#254/);

  assert.match(content, /NO-GO \/ Waiting/);
  assert.match(content, /evidence-only/);
  assert.match(content, /does not deploy code/);
  assert.match(content, /restart Gateway\/broker\/worker/);
});

test('Team1 bangtong RCA excludes secrets, host-private paths, and runtime/bootstrap context', async () => {
  const content = await doc();

  assert.doesNotMatch(content, /ghp_|github_pat_|BROKER_EDGE_SECRET/i);
  assert.doesNotMatch(content, /Authorization:\s*Bearer/i);
  assert.doesNotMatch(content, /OPENCLAW_CACHE_BOUNDARY/i);
  assert.doesNotMatch(content, /Session ID:/i);
  assert.doesNotMatch(content, /chat_id\s*[:=]/i);
  // Document's own disclaimer about host-private paths is allowed; actual paths would be /home/ or similar
  assert.doesNotMatch(content, /\/home\/|\/Users\/|\/var\/lib\/openclaw/i);
});
