/**
 * Test for provider-message-id-as-ACK wording boundary scan.
 *
 * Verifies the check-message-id-ack-boundary script catches prohibited
 * "provider-message-id-as-ACK" equivocation wording and passes on
 * correctly negated non-ACK phrasing.
 *
 * Safety: read-only unit tests. No deploy, no restart, no live send.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { execSync } from 'node:child_process';

const root = process.cwd();
const script = join(root, 'scripts', 'check-message-id-ack-boundary.mjs');

function runInTmp(files) {
  const dir = mkdtempSync(join(tmpdir(), 'a2a-msgid-ack-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  // init a git repo so trackedFiles works
  try {
    execSync('git init', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.email test@test', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.name test', { cwd: dir, stdio: 'ignore' });
    execSync(`git add ${Object.keys(files).join(' ')}`, { cwd: dir, stdio: 'ignore' });
  } catch {
    // git fallback; trackedFiles will use filesystem walk
  }
  const result = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test('passes on clean non-ACK wording', () => {
  const result = runInTmp({
    'doc.md': `# Terminal Evidence\n\nprovider message id is not ACK evidence.\nprovider send success is not terminal receipt.\nmessageId alone is insufficient.\nproviderAccepted is accepted-only, not an ACK.\n`,
  });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status} stderr: ${result.stderr}`);
  assert.match(result.stdout, /"ok":true/);
});

test('fails closed on provider-message-id-as-ACK claim', () => {
  const result = runInTmp({
    'bad-doc.md': `# Terminal Evidence\n\nThe provider message id serves as terminal ACK evidence.\n`,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /provider-message-id-as-ACK/);
});

test('fails closed on send-success-is-ACK claim', () => {
  const result = runInTmp({
    'bad-doc.md': `# Terminal Evidence\n\nprovider message send success confirms terminal receipt.\n`,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /send-success-is-ACK/);
});

test('fails closed on providerAccepted-is-receipt claim', () => {
  const result = runInTmp({
    'bad-doc.md': `# Terminal Evidence\n\nproviderAccepted confirms operator receipt.\n`,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /providerAccepted-is-receipt/);
});

test('fails closed on accepted-equals-acknowledged claim', () => {
  const result = runInTmp({
    'bad-doc.md': `# Terminal Evidence\n\nThe provider accepted means it is acknowledged as terminal receipt.\n`,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /accepted-equals-acknowledged/);
});

test('passes on negated send-success wording', () => {
  const result = runInTmp({
    'safe-doc.md': `# Safety\n\nProvider send success is not terminal ACK evidence.\nProviders must not treat accepted as acknowledged.\nMessage id alone is insufficient for receipt proof.\n`,
  });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status} stderr: ${result.stderr}`);
});

test('passes on non-text files (skipped)', () => {
  const result = runInTmp({
    'image.png': Buffer.alloc(100).toString('base64'),
  });
  assert.equal(result.status, 0);
});
