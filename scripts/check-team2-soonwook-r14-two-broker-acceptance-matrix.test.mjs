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
  'team2-soonwook-r14-two-broker-acceptance-matrix.md',
);

async function doc() {
  return readFile(docPath, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('R14 matrix binds the current issue, parent, run, lane, and two-broker scope', async () => {
  const content = await doc();

  for (const reference of [
    'a2a-plane#309',
    'a2a-broker#615',
    'a2a-r14-live-hardening-20260514T060000Z',
    'Lane: Team2 / `soonwook` / `5/7`',
    'Team1 broker of record: `seoseo`',
    'Team2 broker of record: `gwakga`',
    'Overall finalizer: `seoseo`',
    'repository and GitHub issue evidence only',
    'Provider accepted/message-id evidence is non-ACK evidence only',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(reference)));
  }

  for (const forbiddenClaim of [
    /production readiness is approved/i,
    /parent R14 closeout is approved/i,
    /approval executed/i,
    /deploy completed/i,
    /restart completed/i,
    /live provider send completed/i,
    /terminal ACK completed/i,
    /secret rotation completed/i,
  ]) {
    assert.doesNotMatch(content, forbiddenClaim);
  }
});

test('R14 dispatch snapshot covers all seven Team1 and Team2 lanes and terminal evidence boundaries', async () => {
  const content = await doc();

  for (const reference of [
    'a2a-broker#616',
    'openclaw-plugin-a2a#309',
    'a2a-broker#617',
    'a2a-docker-runner#253',
    'a2a-plane#309',
    'a2a-broker#618',
    'a2a-broker#619',
    'a2a-r14-live-hardening-20260514T060000Z-01-bangtong',
    'a2a-r14-live-hardening-20260514T060000Z-02-sogyo',
    'a2a-r14-live-hardening-20260514T060000Z-03-nosuk',
    'a2a-r14-live-hardening-20260514T060000Z-04-yukson',
    'a2a-r14-live-hardening-20260514T060000Z-05-soonwook',
    'a2a-r14-live-hardening-20260514T060000Z-06-dungae',
    'a2a-r14-live-hardening-20260514T060000Z-07-jingun',
    'issuecomment-4448092508',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(reference)));
  }

  for (const phrase of [
    'Start/running is not terminal evidence',
    'only PR, Done, or Block counts',
    'terminal evidence is this PR/Done/Block only',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase), 'i'));
  }

  assert.doesNotMatch(content, /Start\/running is terminal evidence/i);
});

test('R14 two-broker acceptance matrix covers all requested hardening gates', async () => {
  const content = await doc();

  for (const gate of [
    'Metadata fail-closed',
    'Secret-safe diagnostics',
    'Hot-table health',
    'Deploy-marker semantics',
    'Receipt/ACK boundaries',
    'No live approval-sensitive actions',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(gate)));
  }

  for (const phrase of [
    '`parentRoundId=a2a-r14-live-hardening-20260514T060000Z`',
    '`originBrokerId=seoseo`',
    '`originBrokerId=gwakga`',
    '`parentRoundTotal=7`',
    'bounded handoff/finalizer metadata linking back to Seoseo finalizer closeout',
    'presence/absence, config key names, redacted fingerprints, age/rotation status',
    'bounded/read-only health signals',
    '`.deploy-source-sha`',
    'deploy provenance from uncommitted source changes',
    'provider accepted-send and provider message id as non-ACK evidence only',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase), 'i'));
  }
});

test('R14 fail-closed conditions block unsafe live, secret, DB, and ACK behavior', async () => {
  const content = await doc();

  for (const phrase of [
    'Missing, mismatched, rewritten, truncated, or cross-team-swapped parent metadata is rejected',
    'Any secret/token value, authorization header, provider target, raw session dump, or host-private path',
    'Production DB mutation, prune, migration, replay, ACK-state write, or unbounded table scan without approval is rejected',
    'A deploy marker alone must not trigger a false dirty warning',
    'Any UI, log, comment, matrix, or Terminal Brief that calls provider accepted/message-id an ACK',
    'Unapproved production deploy/restart/reload, live provider send, DB mutation, terminal ACK/replay',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase), 'i'));
  }

  for (const forbiddenClaim of [
    new RegExp('provider accepted(?:-send)? is (?:a )?' + 'terminal ' + 'ACK', 'i'),
    /message-id evidence is (?:a )?read receipt/i,
    /hot-table prune was performed/i,
    /DB migration was performed/i,
    /deploy marker authorizes deploy/i,
  ]) {
    assert.doesNotMatch(content, forbiddenClaim);
  }
});

test('R14 GO/NO-GO semantics keep parent closeout waiting on sibling terminal evidence', async () => {
  const content = await doc();

  for (const phrase of [
    '`GO_CANDIDATE / Acceptance matrix documented`',
    '`NO-GO / Waiting`',
    '`BLOCK`',
    'Parent R14 closeout remains **`NO-GO / Waiting`**',
    'all seven lanes publish terminal PR, Done, or Block evidence',
    'Team1/Team2 parity',
    'broker-specific runtime behavior',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase), 'i'));
  }

  assert.doesNotMatch(content, /R14 live hardening is complete/i);
});

test('R14 runtime bootstrap hygiene and verification commands are explicit', async () => {
  const content = await doc();

  for (const denyPath of [
    'AGENTS.md',
    'SOUL.md',
    'USER.md',
    'TOOLS.md',
    'HEARTBEAT.md',
    'IDENTITY.md',
    '.openclaw/**',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(denyPath)));
  }

  for (const phrase of [
    'npm run check:team2-soonwook-r14-two-broker-acceptance-matrix',
    'npm run check:message-id-ack-boundary',
    'npm run check:layout',
    'git diff --name-only',
    'Offending paths must be reported exactly',
  ]) {
    assert.match(content, new RegExp(escapeRegExp(phrase), 'i'));
  }

  const sensitiveEvidencePattern = new RegExp(
    [
      'gh' + 'p_',
      'github' + '_pat_',
      'Authorization:\\s*Bearer\\s+[A-Za-z0-9_\\-]+',
      'OPENCLAW' + '_CACHE_BOUNDARY',
      'chat' + '_id\\s*[:=]',
    ].join('|'),
    'i',
  );
  assert.doesNotMatch(content, sensitiveEvidencePattern);
});
