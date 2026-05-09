import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(repoRoot, 'scripts', 'round-merge-preflight.mjs');

test('round merge preflight help documents local-only safety boundary', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /temporary local-only git worktree/i);
  assert.match(result.stdout, /never pushes/i);
  assert.match(result.stdout, /never changes main/i);
  assert.match(result.stdout, /deploys/i);
  assert.match(result.stdout, /terminal ACK/i);
});

test('round merge preflight refuses to run without PR numbers', () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: npm run round:merge-preflight/);
});

test('release checklist requires merge-train preflight for multi-PR rounds', async () => {
  const checklist = await readFile(join(repoRoot, 'docs', 'release-checklist.md'), 'utf8');
  assert.match(checklist, /round:merge-preflight/);
  assert.match(checklist, /multi-PR/i);
});
