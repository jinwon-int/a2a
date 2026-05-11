import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const spec = 'docs/final-approval/source-public-execution-orchestrator-schema.json';
const script = 'scripts/a2a-source-public-execution-orchestrator.mjs';
const runId = 'a2a-source-public-execution-orchestrator-20260511T023207Z';
const manifestDigest = 'sha256:111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000';
const requiredGateIds = [
  'finalApprovalPacket',
  'deterministicExecutionPlan',
  'scannerHistoryBinding',
  'idempotencyReplayProtection',
  'preflightFailureSemantics',
  'rollbackAbortRunbook',
  'runtimeBootstrapHygiene',
  'redactedEvidencePolicy',
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function sha256Digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function canonicalExecutionPlan(input) {
  const packet = input.approvalPacket || {};
  const plan = input.executionPlan || {};
  const steps = Array.isArray(plan.steps)
    ? plan.steps
        .map((step) => ({
          order: Number(step.order),
          repo: String(step.repo || ''),
          action: String(step.action || ''),
          scope: String(step.scope || ''),
        }))
        .sort((a, b) => a.order - b.order || a.repo.localeCompare(b.repo) || a.action.localeCompare(b.action))
    : [];
  return {
    run: input.run || undefined,
    approvalPacketId: plan.approvalPacketId,
    approvedManifestDigest: plan.approvedManifestDigest,
    packetManifestDigest: packet.manifestDigest,
    scannerHistoryDigest: plan.scannerHistoryDigest,
    idempotencyKey: plan.idempotencyKey,
    mode: plan.mode,
    dryRun: plan.dryRun,
    simulate: plan.simulate,
    sourcePublicExecution: plan.sourcePublicExecution || 'NOT_PERFORMED',
    steps,
  };
}

function inputPath(input) {
  const dir = mkdtempSync(join(tmpdir(), 'a2a-execution-orchestrator-'));
  const file = join(dir, 'evidence.json');
  writeFileSync(file, JSON.stringify(input, null, 2));
  return file;
}

function run(input, extraArgs = []) {
  return spawnSync(process.execPath, [script, '--spec', spec, '--input', inputPath(input), ...extraArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function allCandidateInput(overrides = {}) {
  const gates = Object.fromEntries(
    requiredGateIds.map((id, index) => [
      id,
      {
        status: 'GO',
        evidence: [`https://github.com/jinwon-int/a2a-plane/issues/221#${id}-${index + 1}`],
        ...overrides.gates?.[id],
      },
    ]),
  );

  const input = {
    run: runId,
    gates: {
      ...gates,
      ...overrides.gates,
    },
    approvalPacket: {
      packetId: `final-approval:${runId}`,
      manifestDigest,
      deterministic: true,
      idempotencyKey: `source-public-final:${runId}`,
      approvalExecution: false,
      sourcePublicExecution: false,
      evidence: ['https://github.com/jinwon-int/a2a-plane/issues/221#final-approval-packet'],
      ...overrides.approvalPacket,
    },
    executionPlan: {
      approvalPacketId: `final-approval:${runId}`,
      approvedManifestDigest: manifestDigest,
      scannerHistoryDigest: manifestDigest,
      idempotencyKey: `source-public-final:${runId}`,
      mode: 'simulate',
      dryRun: true,
      simulate: true,
      sourcePublicExecution: 'NOT_PERFORMED',
      steps: [
        {
          order: 1,
          repo: 'jinwon-int/a2a-plane',
          action: 'repository-visibility-change',
          scope: 'source-public-if-separately-approved-later',
        },
      ],
      ...overrides.executionPlan,
    },
    scannerHistoryBinding: {
      status: 'GO',
      scannerDigest: 'sha256:aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999',
      historyDigest: 'sha256:9999888877776666555544443333222211110000ffffeeeeddddccccbbbbaaaa',
      manifestDigest,
      findings: 'clean',
      ...overrides.scannerHistoryBinding,
    },
    idempotencyReplay: {
      idempotencyKey: `source-public-final:${runId}`,
      replayAttemptCount: 2,
      duplicateExecutionPlans: 0,
      duplicateLiveActions: 0,
      duplicateTerminalMarkers: 0,
      manifestMismatchDecision: 'NO_GO',
      ...overrides.idempotencyReplay,
    },
    preflight: {
      status: 'GO',
      failureDecision: 'NO_GO',
      sideEffectsBeforePreflight: false,
      ...overrides.preflight,
    },
    rollbackAbortRunbook: {
      abortBeforeSideEffects: true,
      abortPath: 'Stop before approval execution and post Block evidence.',
      rollbackPath: 'Use separately approved manual rollback if a later execution is approved and fails.',
      rollbackSteps: ['Confirm no source-public execution ran before applying any rollback.'],
      ...overrides.rollbackAbortRunbook,
    },
    ...overrides.root,
  };
  input.executionPlan.executionPlanDigest = overrides.executionPlan?.executionPlanDigest ?? sha256Digest(canonicalExecutionPlan(input));
  return input;
}

function withOperatorApproval(input) {
  return {
    ...input,
    gates: {
      ...input.gates,
      operatorApproval: {
        status: 'GO',
        evidence: ['https://github.com/jinwon-int/a2a-plane/issues/218#separate-operator-approval-placeholder'],
      },
    },
  };
}

test('spec-only mode advertises simulate-only fail-closed execution semantics', () => {
  const result = spawnSync(process.execPath, [script, '--spec', spec], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, 'NO_GO');
  assert.equal(parsed.planMode, 'SIMULATE_ONLY');
  assert.equal(parsed.sourcePublicExecution, 'NOT_PERFORMED');
  assert.equal(parsed.approvalExecution, 'NOT_PERFORMED');
  assert.ok(parsed.decisionStates.includes('GO_CANDIDATE'));
  assert.ok(parsed.requiredGates.includes('idempotencyReplayProtection'));
});

test('complete plan without separate approval needs operator approval and does not execute', () => {
  const result = run(allCandidateInput());
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, 'NEEDS_OPERATOR_APPROVAL');
  assert.equal(parsed.planMode, 'SIMULATE_ONLY');
  assert.equal(parsed.sourcePublicExecution, 'NOT_PERFORMED');
  assert.equal(parsed.approvalExecution, 'NOT_PERFORMED');
  assert.equal(parsed.operatorApprovalReady, false);
});

test('separate approval evidence can produce GO_CANDIDATE but never execution GO', () => {
  const input = withOperatorApproval(allCandidateInput());
  const result = run(input);
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, 'GO_CANDIDATE');
  assert.equal(parsed.operatorApprovalReady, true);
  assert.equal(parsed.sourcePublicExecution, 'NOT_PERFORMED');
  assert.equal(parsed.approvalExecution, 'NOT_PERFORMED');
  assert.equal(parsed.declaredExecutionPlanDigest, sha256Digest(canonicalExecutionPlan(input)));
});

test('execution plan must exactly match the approved packet manifest and canonical digest', () => {
  const input = allCandidateInput({
    executionPlan: {
      approvedManifestDigest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      executionPlanDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    },
  });
  const result = run(input);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('approvedManifestDigest does not match')));
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('digest does not match canonical')));
});

test('replay/idempotency proof rejects duplicate live actions and terminal markers', () => {
  const input = allCandidateInput({
    idempotencyReplay: {
      replayAttemptCount: 2,
      duplicateLiveActions: 1,
      duplicateTerminalMarkers: 1,
    },
  });
  const result = run(input);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('duplicate live actions')));
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('duplicate terminal markers')));
});

test('preflight failures fail closed before side effects', () => {
  const input = allCandidateInput({
    preflight: {
      status: 'BLOCKED',
      failureDecision: 'GO',
      sideEffectsBeforePreflight: true,
    },
  });
  const result = run(input);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('preflight status is BLOCKED')));
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('failureDecision must be NO_GO')));
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('no side effects')));
});

test('forbidden live execution flags are rejected even with valid plan evidence', () => {
  const input = allCandidateInput({ root: { liveProviderSend: true, repositoryVisibilityChange: true, terminalAck: true } });
  const result = run(input);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.decision, 'NO_GO');
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('liveProviderSend is forbidden')));
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('repositoryVisibilityChange is forbidden')));
  assert.ok(parsed.blockers.some((blocker) => blocker.reason.includes('terminalAck is forbidden')));
});

test('runtime/bootstrap files fail closed and report exact offending repo-relative paths', () => {
  const input = allCandidateInput({ root: { offendingPaths: ['AGENTS.md', '.openclaw/workspace-state.json'] } });
  const result = run(input);
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stderr);
  assert.deepEqual(parsed.offendingPaths, ['.openclaw/workspace-state.json', 'AGENTS.md']);
  assert.ok(parsed.blockers.some((blocker) => blocker.path === 'AGENTS.md'));
  assert.ok(parsed.blockers.some((blocker) => blocker.path === '.openclaw/workspace-state.json'));
});

test('markdown output states GO_CANDIDATE is approval-ready only', () => {
  const result = run(withOperatorApproval(allCandidateInput()), ['--format', 'markdown']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Decision: GO_CANDIDATE/);
  assert.match(result.stdout, /Plan mode: SIMULATE_ONLY/);
  assert.match(result.stdout, /Source-public execution: NOT_PERFORMED/);
  assert.match(result.stdout, /GO_CANDIDATE means the final packet and deterministic plan are approval-ready only/);
});
