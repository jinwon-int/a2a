import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const contractPath = join(repoRoot, 'contracts', 'a2a', 'terminal-brief-progress-semantics.md');
const fixturePath = join(repoRoot, 'fixtures', 'contract', 'terminal-brief-progress.json');
const docPath = join(
  repoRoot,
  'docs',
  'validation',
  'team1-yukson-r28-terminal-brief-progress-semantics-libero.md',
);

async function readText(p) {
  return readFile(p, 'utf8');
}

async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIncludesAll(content, references, flags = '') {
  for (const reference of references) {
    assert.match(content, new RegExp(escapeRegExp(reference), flags));
  }
}

test('R28 libero validation binds issue, run, lane, and safe no-live scope', async () => {
  const content = await readText(docPath);

  assertIncludesAll(content, [
    'a2a-plane#370',
    'a2a-r28-terminal-brief-progress-semantics-yukson-20260516',
    'Lane: `yukson` / Team1 libero validation (Terminal Brief progress semantics contract and validation)',
    'no production deploy, Gateway/broker/worker restart or reload, live provider or Telegram canary',
    'production DB mutation/prune/migration',
    'manual Terminal Brief ACK/replay',
    'secret movement/rotation/value disclosure',
    'release/tag publish',
    'repo visibility change',
    'Provider accepted/message-id evidence is send-acceptance only, not read/visibility/Terminal ACK',
  ]);

  for (const forbiddenClaim of [
    /R28 Terminal Brief progress semantics.*`GO`/i,
    /production activation is approved/i,
    /operator approval executed/i,
    /live provider send completed/i,
    /terminal ACK completed/i,
    /operator-visible receipt completed/i,
    /live canary dispatched/i,
  ]) {
    assert.doesNotMatch(content, forbiddenClaim);
  }
});

test('R28 progress semantics contract document covers all required sections', async () => {
  const content = await readText(contractPath);

  // Section headers
  assertIncludesAll(content, [
    '# Terminal Brief Progress Semantics Contract',
    '## 1. Progress vs Terminal Boundary',
    '## 2. Progress Report Types',
    '### 2.1 Progress',
    '### 2.2 ProgressCheckpoint',
    '### 2.3 ProgressAccept',
    '## 3. Progress Evidence Requirements',
    '### 3.1 Redaction',
    '### 3.2 Idempotency',
    '### 3.3 Bounded size',
    '### 3.4 Sequence gaps',
    '## 4. Progress Safety Gates',
    '## 5. Progress in the Parent Aggregation Context',
    '## 6. Evidence Examples',
    '## 7. Safety Confirmations',
  ]);

  // Boundary rules
  assertIncludesAll(content, [
    'Progress is not terminal evidence',
    '`isProgress: true`',
    '`isTerminal: false`',
    '`terminalAck: false`',
    '`readReceipt: false`',
    '`isApproval: false`',
    '`isTerminalAck: false`',
  ]);

  // Progress report types
  assertIncludesAll(content, [
    '"kind": "progress"',
    '"kind": "progress-checkpoint"',
    '"kind": "progress-accept"',
    'sequence',
    'checkpointId',
    'providerMessageId',
  ]);

  // Safety gates
  assertIncludesAll(content, [
    'No terminal outbox ACK',
    'No provider notification',
    'No aggregate title advancement',
    'No terminal confusion',
    'No cursor advancement',
    'Sequence integrity',
  ]);

  // Parent aggregation
  assertIncludesAll(content, [
    'non-terminal entries',
    'Must not change the parent-round `projectionState`',
    'Must not trigger a parent-round aggregate Terminal Brief notification',
    'parentRoundId',
    'originBrokerId',
    'handoffBrokerId',
    'ignored when rendering the aggregate Terminal Brief title',
  ]);

  // Safety confirmations
  assertIncludesAll(content, [
    'noPublicVisibilityChange',
    'noProductionDeployOrRestart',
    'noProductionDatabaseMutation',
    'noLiveProviderSend',
    'noTerminalOutboxAckMutation',
    'noSecretRotationOrDisclosure',
    'noRawSessionDump',
  ]);
});

test('R28 progress semantics fixture has required top-level blocks and correct values', async () => {
  const fixture = await readJson(fixturePath);

  // Top-level structure
  assert.equal(typeof fixture.v0Freeze, 'object');
  assert.equal(typeof fixture.progressReportTypes, 'object');
  assert.equal(typeof fixture.safetyGates, 'object');
  assert.equal(typeof fixture.boundaryRules, 'object');
  assert.equal(typeof fixture.parentAggregationRules, 'object');
  assert.equal(typeof fixture.boundedConstraints, 'object');
  assert.ok(Array.isArray(fixture.validExamples));
  assert.ok(Array.isArray(fixture.invalidExamples));
  assert.equal(typeof fixture.redactionRules, 'object');
  assert.equal(typeof fixture.safetyConfirmations, 'object');

  // v0Freeze
  assert.equal(fixture.v0Freeze.frozenAt, '2026-05-16');

  // Progress report types
  assert.ok(fixture.progressReportTypes.progress);
  assert.ok(fixture.progressReportTypes.progressCheckpoint);
  assert.ok(fixture.progressReportTypes.progressAccept);
  assert.equal(fixture.progressReportTypes.progress.kindLiteral, 'progress');
  assert.equal(fixture.progressReportTypes.progressCheckpoint.kindLiteral, 'progress-checkpoint');
  assert.equal(fixture.progressReportTypes.progressAccept.kindLiteral, 'progress-accept');
  assert.equal(fixture.progressReportTypes.progress.isTerminal, false);
  assert.equal(fixture.progressReportTypes.progressCheckpoint.isTerminal, false);
  assert.equal(fixture.progressReportTypes.progressAccept.isTerminal, false);

  // Safety gates
  assert.ok(fixture.safetyGates.noTerminalOutboxAckMutation);
  assert.ok(fixture.safetyGates.noProviderNotification);
  assert.ok(fixture.safetyGates.noAggregateTitleAdvancement);
  assert.ok(fixture.safetyGates.noTerminalKindOverlap);
  assert.ok(fixture.safetyGates.noCursorAdvancement);
  assert.ok(fixture.safetyGates.sequenceIntegrity);

  // Boundary rules
  assert.equal(fixture.boundaryRules.progressIsNotTerminalEvidence, true);
  assert.equal(fixture.boundaryRules.terminalAckFalse, true);
  assert.equal(fixture.boundaryRules.readReceiptFalse, true);
  assert.equal(fixture.boundaryRules.isApprovalFalse, true);
  assert.equal(fixture.boundaryRules.isTerminalAckFalse, true);

  // Parent aggregation rules
  assert.equal(fixture.parentAggregationRules.relayAsNonTerminalEntry, true);
  assert.equal(fixture.parentAggregationRules.mustNotChangeProjectionStateToProjected, true);
  assert.equal(fixture.parentAggregationRules.mustNotTriggerAggregateNotification, true);
  assert.equal(fixture.parentAggregationRules.mustCarryParentMetadata, true);
  assert.equal(fixture.parentAggregationRules.mustBeIgnoredForAggregateTitle, true);

  // Bounded constraints
  assert.equal(fixture.boundedConstraints.summaryMaxChars, 280);
  assert.equal(fixture.boundedConstraints.changedFilesMaxEntries, 20);
  assert.equal(fixture.boundedConstraints.checksRunMaxEntries, 10);
  assert.equal(fixture.boundedConstraints.sequenceMonotonicallyIncreasing, true);
  assert.equal(fixture.boundedConstraints.sequenceGapDetection, true);

  // Valid examples
  assert.ok(fixture.validExamples.length >= 3);
  const progressExample = fixture.validExamples.find((e) => e.kind === 'progress');
  const checkpointExample = fixture.validExamples.find((e) => e.kind === 'progress-checkpoint');
  const acceptExample = fixture.validExamples.find((e) => e.kind === 'progress-accept');
  assert.ok(progressExample);
  assert.ok(checkpointExample);
  assert.ok(acceptExample);
  assert.equal(progressExample.isProgress, true);
  assert.equal(progressExample.isTerminal, false);
  assert.equal(checkpointExample.isProgress, true);
  assert.equal(checkpointExample.isTerminal, false);
  assert.equal(acceptExample.isProgress, true);
  assert.equal(acceptExample.isTerminal, false);

  // Invalid examples
  assert.ok(fixture.invalidExamples.length >= 3);
  const invalidOverlap = fixture.invalidExamples.find((e) => e.kind === 'done');
  assert.ok(invalidOverlap, 'invalidExamples must include kind overlap with terminal');
  const invalidTerminal = fixture.invalidExamples.find((e) => e.isTerminal === true);
  assert.ok(invalidTerminal, 'invalidExamples must include progress marked as terminal');

  // Redaction rules
  assert.equal(fixture.redactionRules.noSecrets, true);
  assert.equal(fixture.redactionRules.noPrivateEndpoints, true);
  assert.equal(fixture.redactionRules.noRawSessionDumps, true);
  assert.equal(fixture.redactionRules.noHostSpecificPaths, true);
  assert.equal(fixture.redactionRules.noRuntimeBootstrapContextFiles, true);
  assert.equal(fixture.redactionRules.changedFilesMustBeRepoSafe, true);
  assert.equal(fixture.redactionRules.checkCommandsMustBeSafeToDisplay, true);

  // Safety confirmations
  assert.equal(fixture.safetyConfirmations.noPublicVisibilityChange, true);
  assert.equal(fixture.safetyConfirmations.noProductionDeployOrRestart, true);
  assert.equal(fixture.safetyConfirmations.noProductionDatabaseMutation, true);
  assert.equal(fixture.safetyConfirmations.noLiveProviderSend, true);
  assert.equal(fixture.safetyConfirmations.noTerminalOutboxAckMutation, true);
  assert.equal(fixture.safetyConfirmations.noSecretRotationOrDisclosure, true);
  assert.equal(fixture.safetyConfirmations.noRawSessionDump, true);
});

test('R28 validation matrix covers all four domains', async () => {
  const content = await readText(docPath);

  // Domain 1 — Progress semantics contract integrity
  assertIncludesAll(content, [
    'Domain 1 — Progress semantics contract integrity',
    'Progress vs Terminal boundary',
    'Progress report types',
    'Progress evidence requirements',
    'Safety gates',
    'Parent aggregation context',
  ]);

  // Domain 2 — Contract fixture conformance
  assertIncludesAll(content, [
    'Domain 2 — Contract fixture conformance',
    'Fixture frozen at v0',
    'Valid examples exist and match schema',
    'Invalid examples exist and are properly rejected',
    'Redaction rules declared',
    'Safety confirmations declared',
  ]);

  // Domain 3 — Libero validation test coverage
  assertIncludesAll(content, [
    'Domain 3 — Libero validation test coverage',
    'Test binds issue, run, lane, and safe no-live scope',
    'Test validates contract document existence and structure',
    'Test validates fixture structure and boundary rules',
    'Test validates no OpenClaw runtime/bootstrap files in evidence',
    'Test validates safety gates, boundaries, and forbidden claims',
  ]);

  // Domain 4 — No-live/no-ACK approval gates
  assertIncludesAll(content, [
    'Domain 4 — No-live/no-ACK approval gates',
    'No live provider send without operator approval',
    'No terminal-outbox ACK without ACK-safe proof',
    'No DB mutation for terminal evidence',
    'Progress is not terminal evidence',
    'No runtime/bootstrap context files in evidence',
  ]);
});

test('R28 lane snapshot lists the validation lane and source-only PR semantics', async () => {
  const content = await readText(docPath);

  assertIncludesAll(content, [
    'a2a-plane#370',
    'yukson',
    'Terminal Brief progress semantics contract and libero validation',
    'PR with contract document, fixture, validation doc, and validation test',
    'Source-only PR semantics',
    'Current: `PR`',
    'does not authorize',
    'Runtime activation, production deploy, broker restart, Gateway restart, DB mutation',
    'Live provider send, Terminal Brief ACK, cross-broker relay window opening',
    'Source execution remains `NO_GO`',
    'separate explicit operator approval',
  ]);
});

test('R28 risk list covers all identified progress-semantics risks', async () => {
  const content = await readText(docPath);

  assertIncludesAll(content, [
    'Risk list',
    'Progress-notification gap',
    'Sequence integrity enforcement',
    'Parent aggregation optionality',
    'Progress-checkpoint state drift',
    'Runtime/bootstrap hygiene',
  ]);
});

test('R28 required checks include gate integrity and bootstrap hygiene', async () => {
  const content = await readText(docPath);

  assertIncludesAll(content, [
    'terminal-brief-progress-semantics.md',
    'terminal-brief-progress.json',
    'check-team1-yukson-r28-terminal-brief-progress-semantics-libero.test.mjs',
    'npm run check:message-id-ack-boundary',
    'npm run test:release-gate',
    'No production deploy/restart/reload, live provider/Telegram send, DB mutation/prune/migration',
  ]);
});

test('R28 bootstrap hygiene fails closed and does not include obvious secret/session leaks', async () => {
  const content = await readText(docPath);

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

  assert.doesNotMatch(content, /ghp_|github_pat_|Authorization:\s*Bearer|OPENCLAW_CACHE_BOUNDARY/);  assert.doesNotMatch(content, /raw session dump[^s]/);
});

test('R28 verification performed section lists all inspected references', async () => {
  const content = await readText(docPath);

  assertIncludesAll(content, [
    'a2a-plane#370',
    'terminal-semantics.md',
    'task-lifecycle.md',
    'checkpoint-interrupt.md',
    'parent-terminal-brief-aggregation.md',
    'team1-yukson-r25-team2-terminal-brief-ops-readiness-libero.md',
    'team1-yukson-terminal-brief-activation-libero.md',
  ]);
});

test('R28 contract fixture valid examples match expected field structure', async () => {
  const fixture = await readJson(fixturePath);

  for (const example of fixture.validExamples) {
    assert.equal(example.isProgress, true, `valid example kind=${example.kind} must have isProgress=true`);
    assert.equal(example.isTerminal, false, `valid example kind=${example.kind} must have isTerminal=false`);
    if (example.kind !== 'progress-accept') {
      assert.equal(example.redacted, true, `valid example kind=${example.kind} must have redacted=true`);
    }
  }

  // Check progress example has sequence
  const progressExample = fixture.validExamples.find((e) => e.kind === 'progress');
  assert.equal(typeof progressExample.sequence, 'number');
  assert.equal(typeof progressExample.taskId, 'string');
  assert.equal(typeof progressExample.summary, 'string');
  assert.ok(progressExample.summary.length <= 280);

  // Check progress-checkpoint example has checkpoint fields
  const checkpointExample = fixture.validExamples.find((e) => e.kind === 'progress-checkpoint');
  assert.equal(typeof checkpointExample.checkpointId, 'string');
  assert.ok(['paused', 'awaiting_operator'].includes(checkpointExample.checkpointState));
  assert.equal(typeof checkpointExample.summary, 'string');
  assert.ok(checkpointExample.summary.length <= 280);

  // Check progress-accept has acceptance fields
  const acceptExample = fixture.validExamples.find((e) => e.kind === 'progress-accept');
  assert.equal(acceptExample.isAcceptance, true);
  assert.equal(acceptExample.isReadReceipt, false);
  assert.equal(acceptExample.isTerminalAck, false);
  assert.equal(typeof acceptExample.providerMessageId, 'string');
});

test('R28 contract fixture invalid examples properly violate boundary rules', async () => {
  const fixture = await readJson(fixturePath);

  for (const example of fixture.invalidExamples) {
    const isTerminalKindOverlap = ['done', 'pr', 'blocked', 'cancelled'].includes(example.kind);
    const isProgressMarkedTerminal = example.isTerminal === true;
    const hasMissingRequired = example.sequence === undefined && example.checkpointId === undefined;

    assert.ok(
      isTerminalKindOverlap || isProgressMarkedTerminal || hasMissingRequired,
      `invalid example kind=${example.kind} reason=${example.reason} must violate a boundary rule`,
    );
  }
});

test('R28 contract fixture redaction rules enforce bootstrap hygiene', async () => {
  const fixture = await readJson(fixturePath);

  assert.equal(fixture.redactionRules.noRuntimeBootstrapContextFiles, true);
  assert.equal(fixture.redactionRules.noSecrets, true);
  assert.equal(fixture.redactionRules.noPrivateEndpoints, true);
  assert.equal(fixture.redactionRules.noRawSessionDumps, true);

  // Verify no forbidden runtime paths appear in the fixture text
  const fixtureText = JSON.stringify(fixture);
  const forbiddenPaths = [
    'AGENTS.md',
    'SOUL.md',
    'USER.md',
    'TOOLS.md',
    'HEARTBEAT.md',
    'IDENTITY.md',
    '.openclaw/',
    'BOOTSTRAP.md',
    'MEMORY.md',
    'memory/',
  ];
  for (const path of forbiddenPaths) {
    assert.ok(
      !fixtureText.includes(path),
      `fixture must not contain forbidden runtime/bootstrap path ${path}`,
    );
  }
});
