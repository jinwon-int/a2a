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
  'team2-soonwook-r28-allhands-validation-progress-capacity.md',
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

test('R28 libero validation binds issue, parent, run, lane, and safe no-live scope', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'a2a-plane#372',
    'a2a-plane#370',
    'a2a-r28-terminal-brief-progress-ack-allhands-20260516T134401Z',
    'Lane: `soonwook` / Team2 libero validation (all-hands validation matrix for progress and capacity assignment)',
    'Seoseo',
    'Gwakga',
    'repository and GitHub evidence review only',
    'does not deploy, restart Gateway/broker/worker services',
    'does not deploy, restart Gateway/broker/worker services, reload runtime config, send a live provider or Telegram canary',
  ]);

  for (const forbiddenClaim of [
    /R28 closeout is `GO`/i,
    /production activation is approved/i,
    /operator approval executed/i,
    /live provider send completed/i,
    /terminal ACK completed/i,
    /operator-visible receipt completed/i,
  ]) {
    assert.doesNotMatch(content, forbiddenClaim);
  }
});

test('R28 validation matrix covers progress semantics, ACK boundary, sessionKey, capacity, and cross-broker domains', async () => {
  const content = await doc();

  // Domain 1 — Terminal Brief progress semantics
  assertIncludesAll(content, [
    'Domain 1 — Terminal Brief progress semantics',
    'parentRoundProgress',
    'parentRoundOrder',
    'parentRoundIndex',
    'completed canonical lanes count',
    'lane order',
    'a2a-broker#656',
    'terminal-event-outbox.ts',
    'Retry/supersede exclusion',
    'Unknown progress safety',
    'Test coverage for progress semantics',
  ]);

  // Domain 2 — ACK boundary hardening
  assertIncludesAll(content, [
    'Domain 2 — ACK boundary hardening',
    'terminal-evidence-ack-boundary.md',
    'check:message-id-ack-boundary',
    'Four-level receipt model',
    'providerAccepted',
    'manual_operator_receipt',
    'Cross-broker projection semantics',
    'broker-handoff-protocol.md',
  ]);

  // Domain 3 — Explicit sessionKey contract
  assertIncludesAll(content, [
    'Domain 3 — Explicit sessionKey contract',
    'sessionKey',
    'visible monitor error',
    'explicit-sessionKey contract',
    'poller state',
  ]);

  // Domain 4 — Worker capacity profile
  assertIncludesAll(content, [
    'Domain 4 — Worker capacity profile',
    'a2a-plane#369',
    'Worker capacity schema',
    'CPU count',
    'memory total',
    'Read-only probe',
    'Assignment planning',
  ]);

  // Domain 5 — Cross-broker compatibility
  assertIncludesAll(content, [
    'Domain 5 — Cross-broker compatibility',
    'parentRoundId',
    'originBrokerId',
    'parentBrokerId',
    'handoffBrokerId',
    'brokerOfRecord',
    'parent-terminal-brief-aggregation.md',
    'terminal-brief-parent-origin-routing.json',
    'terminal-brief-routing-contract.ts',
    'Parent-only notification ownership',
  ]);
});

test('R28 lane snapshot lists the validation lane and treats start-only evidence as waiting', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'a2a-plane#372',
    'soonwook',
    'Start evidence plus this validation document and test',
    'Start, queued, running, provider accepted-send, GitHub comment creation, and PR creation are not terminal lane evidence',
    'PR, Done, or Block marker',
  ]);
});

test('R28 risk list covers all five risk domains', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'Risk list and runtime activation blockers',
    'Terminal Brief n/N progress semantic ambiguity persists',
    'Retry/supersede inflation edge case',
    'Missing sessionKey silent failure',
    'Worker capacity profile design incomplete',
    'Cross-broker progress projection consistency',
    'Runtime bootstrap hygiene drift',
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
  ]);
});

test('R28 runtime activation blockers include all domain requirements and operator separation', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'Runtime activation blockers',
    'Terminal Brief n/N progress fix',
    'a2a-broker#656',
    'parentRoundProgress',
    'four-level receipt model',
    'Missing `sessionKey` produces a visible monitor error',
    'Worker capacity profile schema is documented',
    'No sibling lane relies on Start-only evidence for final closeout',
    'Runtime bootstrap hygiene is confirmed',
    'Operator approval is a separate downstream action',
    'source-only GO/NO-GO',
  ]);
});

test('R28 source-only GO/NO-GO semantics separate GO from runtime activation', async () => {
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

test('R28 required checks include progress fix, ACK boundary, sessionKey, capacity profile, and bootstrap hygiene', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'a2a-broker#656',
    'parentRoundProgress',
    'parentRoundOrder',
    'npm run check:message-id-ack-boundary',
    'Missing sessionKey contract',
    'worker capacity profile schema',
    'contracts/workforce/worker-capacity-schema.md',
    'npm run check:team2-final-go-no-go-semantics-libero',
    'npm run check',
    'check-team2-soonwook-r28-allhands-validation-progress-capacity.test.mjs',
    'adds documentation/test evidence only and does not create runtime/bootstrap files',
    'No production deploy/restart/reload, live provider/Telegram send, DB mutation/prune/migration',
  ]);
});

test('R28 bootstrap hygiene fails closed and does not include obvious secret/session leaks', async () => {
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

test('R28 verification performed section lists all inspected references', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'a2a-plane#372',
    'a2a-plane#370',
    'a2a-plane#369',
    'a2a-broker#656',
    'a2a-plane#364',
    'parent-terminal-brief-aggregation.md',
    'terminal-brief-parent-origin-routing.json',
    'terminal-brief-routing-contract.ts',
    'broker-handoff-protocol.md',
    'terminal-evidence-ack-boundary.md',
    'check:message-id-ack-boundary',
    'team2-final-go-no-go-semantics-libero',
  ]);
});

test('R28 parent-round metadata invariants are confirmed in validation document', async () => {
  const content = await doc();

  assertIncludesAll(content, [
    'parentRoundId',
    'originBrokerId',
    'parentBrokerId',
    'parentRoundTotal',
    'parentRoundOrder',
    'handoffBrokerId',
    'brokerOfRecord',
    'projectionKey',
    'Seoseo',
    'Gwakga',
    'no-live validation artifact',
  ]);
});
