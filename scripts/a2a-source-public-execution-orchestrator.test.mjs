import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const spec = 'docs/execution-orchestrator/source-public-final-approval-packet-schema.json';
const script = 'scripts/a2a-source-public-execution-orchestrator.mjs';

const gateIds = [
  'brokerReadiness',
  'pluginReadiness',
  'runnerReadiness',
  'publicPrivateBoundary',
  'terminalEvidence',
  'replaySafety',
  'externalScannerEvidence',
  'runtimeBootstrapHygiene',
  'goNoGoMatrix',
  'redactedEvidencePolicy',
  'operatorApproval',
  'approvalPacketIntegrity',
  'rehearsalIdempotencyProof',
  'rollbackAbortPath',
];

function inputPath(input) {
  const dir = mkdtempSync(join(tmpdir(), 'a2a-execution-orchestrator-'));
  const file = join(dir, 'input.json');
  writeFileSync(file, JSON.stringify(input, null, 2));
  return file;
}

function run(input, args = []) {
  return spawnSync(process.execPath, [script, '--spec', spec, '--input', inputPath(input), ...args], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
}

function validInput(overrides = {}) {
  const base = {
    approvalPacket: {
      packetId: 'approval-packet-220-yukson-001',
      decision: 'GO_CANDIDATE',
      sourcePublicExecution: 'NO_GO',
      blockers: [],
      requiredGates: gateIds,
      gates: Object.fromEntries(gateIds.map((id, index) => [
        id,
        {
          status: 'GO',
          evidence: [`https://github.com/jinwon-int/a2a-plane/issues/220#gate-${index + 1}`],
        },
      ])),
    },
    finalApproval: {
      requestedMode: 'simulate',
      idempotencyKey: 'source-public-final-approval-220-yukson-001',
      operatorGate: {
        status: 'GO',
        evidence: ['https://github.com/jinwon-int/a2a-plane/issues/220#operator-final-approval'],
      },
    },
    scannerHistoryBinding: {
      sourceCommit: 'abcdef1234567890',
      scannerRunId: 'scanner-20260511T023207Z',
      scannerDigest: `sha256:${'a'.repeat(64)}`,
      historyRef: 'history/a2a-source-public-execution-orchestrator-20260511T023207Z',
      artifactManifestDigest: `sha256:${'b'.repeat(64)}`,
    },
    runtimeBootstrapHygiene: {
      checked: true,
      offendingPaths: [],
      changedPaths: ['docs/execution-orchestrator/source-public-final-approval-packet-schema.json'],
    },
    rollbackAbortRunbook: {
      abortConditions: ['Abort if scanner digest or history ref changes before operator review.'],
      rollbackSteps: ['Stop before live action and keep source-public execution NO_GO.'],
      verificationSteps: ['Re-run dry-run/simulate report and verify replay guard remains unused.'],
    },
    replayHistory: {
      idempotencyKeys: [],
      planIds: [],
    },
  };
  return {
    ...base,
    ...overrides,
    approvalPacket: { ...base.approvalPacket, ...overrides.approvalPacket },
    finalApproval: { ...base.finalApproval, ...overrides.finalApproval },
    scannerHistoryBinding: { ...base.scannerHistoryBinding, ...overrides.scannerHistoryBinding },
    runtimeBootstrapHygiene: { ...base.runtimeBootstrapHygiene, ...overrides.runtimeBootstrapHygiene },
    rollbackAbortRunbook: { ...base.rollbackAbortRunbook, ...overrides.rollbackAbortRunbook },
    replayHistory: { ...base.replayHistory, ...overrides.replayHistory },
  };
}

test('spec-only mode declares fail-closed NO_GO dry-run/simulate semantics', () => {
  const result = spawnSync(process.execPath, [script, '--spec', spec], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, 'NO_GO');
  assert.equal(parsed.sourcePublicExecution, 'NO_GO');
  assert.deepEqual(parsed.allowedModes, ['dry-run', 'simulate']);
  assert.ok(parsed.preflightChecks.includes('operatorExecutionGate'));
  assert.ok(parsed.preflightChecks.includes('idempotencyReplayProtection'));
});

test('approved packet becomes deterministic operator-gated simulate plan without execution', () => {
  const first = run(validInput());
  const second = run(validInput());
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const a = JSON.parse(first.stdout);
  const b = JSON.parse(second.stdout);
  assert.equal(a.decision, 'PLAN_READY_FOR_OPERATOR_REVIEW');
  assert.equal(a.sourcePublicExecution, 'NO_GO');
  assert.equal(a.executionState, 'NOT_EXECUTED');
  assert.equal(a.operatorGated, true);
  assert.equal(a.safety.executed, false);
  assert.deepEqual(a.safety.prohibitedActionsPerformed, []);
  assert.equal(a.planId, b.planId);
  assert.ok(a.planId.startsWith('sha256:'));
  assert.ok(a.plannedSteps.length > 0);
  assert.ok(a.plannedSteps.every((step) => step.execute === false && step.requiresOperatorApproval === true));
});

test('missing final operator gate is NEEDS_OPERATOR_APPROVAL but still no execution', () => {
  const result = run(validInput({ finalApproval: { operatorGate: { status: 'MISSING', evidence: [] } } }));
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, 'NEEDS_OPERATOR_APPROVAL');
  assert.equal(parsed.sourcePublicExecution, 'NO_GO');
  assert.ok(parsed.blockers.some((blocker) => blocker.gate === 'operatorExecutionGate'));
});

test('execute mode fails closed and emits no planned steps', () => {
  const result = run(validInput(), ['--mode', 'execute']);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  assert.equal(parsed.plannedSteps.length, 0);
  assert.ok(parsed.blockers.some((blocker) => blocker.gate === 'modeSafety' && /dry-run or simulate/.test(blocker.reason)));
});

test('scanner/history binding is mandatory and digest-bound', () => {
  const result = run(validInput({ scannerHistoryBinding: { scannerDigest: 'not-a-digest' } }));
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  assert.ok(parsed.blockers.some((blocker) => blocker.gate === 'scannerHistoryBinding' && /scannerDigest/.test(blocker.reason)));
});

test('runtime bootstrap context paths fail closed with exact offending paths', () => {
  const result = run(validInput({ runtimeBootstrapHygiene: { offendingPaths: ['AGENTS.md', '.openclaw/workspace-state.json'] } }));
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  const reason = parsed.blockers.find((blocker) => blocker.gate === 'runtimeBootstrapHygiene').reason;
  assert.match(reason, /AGENTS\.md/);
  assert.match(reason, /\.openclaw\/workspace-state\.json/);
});

test('idempotency key and plan id replay both fail closed', () => {
  const ok = run(validInput());
  assert.equal(ok.status, 0, ok.stderr);
  const planId = JSON.parse(ok.stdout).planId;

  const result = run(validInput({
    replayHistory: {
      idempotencyKeys: ['source-public-final-approval-220-yukson-001'],
      planIds: [planId],
    },
  }));
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  assert.ok(parsed.blockers.some((blocker) => blocker.gate === 'idempotencyReplayProtection' && /idempotency key/.test(blocker.reason)));
  assert.ok(parsed.blockers.some((blocker) => blocker.gate === 'idempotencyReplayProtection' && /plan id/.test(blocker.reason)));
});

test('rollback/abort runbook is required for plan-ready output', () => {
  const result = run(validInput({ rollbackAbortRunbook: { abortConditions: [], rollbackSteps: [], verificationSteps: [] } }));
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  assert.ok(parsed.blockers.some((blocker) => blocker.gate === 'rollbackAbortRunbook'));
});

test('markdown report states approval-ready artifact only and no prohibited execution', () => {
  const result = run(validInput(), ['--format', 'markdown']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PLAN_READY_FOR_OPERATOR_REVIEW/);
  assert.match(result.stdout, /Source-public execution: NO_GO/);
  assert.match(result.stdout, /performed no approval, release, visibility, provider, deploy\/restart, DB, terminal ACK, community, merge, or force-push action/);
  assert.doesNotMatch(result.stdout, /source-public execution GO|visibility change was performed|terminal ACK completed|live provider send completed/i);
});
