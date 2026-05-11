#!/usr/bin/env node
/**
 * A2A Plane source-public execution orchestrator / final approval packet builder.
 *
 * Read-only by design. This command converts approved approval-rehearsal evidence
 * into a deterministic operator-gated dry-run/simulate plan. It never executes
 * approval, release, repository visibility, provider delivery, deploy/restart,
 * DB mutation, terminal ACK, community-post, merge, or force-push actions.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    spec: { type: 'string', default: 'docs/execution-orchestrator/source-public-final-approval-packet-schema.json' },
    input: { type: 'string' },
    mode: { type: 'string' },
    format: { type: 'string', default: 'json' },
  },
});

const requiredPreflightIds = [
  'runtimeBootstrapHygiene',
  'approvalPacketIntegrity',
  'scannerHistoryBinding',
  'idempotencyReplayProtection',
  'operatorExecutionGate',
  'modeSafety',
  'rollbackAbortRunbook',
];

const fixedPlanSteps = [
  {
    id: 'bind-scanner-history',
    title: 'Bind source commit, scanner digest, history ref, and artifact manifest before any operator action',
    type: 'preflight',
  },
  {
    id: 'render-final-approval-packet',
    title: 'Render redacted final approval packet for operator review',
    type: 'artifact',
  },
  {
    id: 'operator-review-checkpoint',
    title: 'Stop for explicit operator approval outside this automation before any source-public execution',
    type: 'operator-gate',
  },
  {
    id: 'simulate-source-public-transition',
    title: 'Simulate the source-public transition plan without changing visibility, releases, providers, deploys, DB, or ACK state',
    type: 'simulation',
  },
  {
    id: 'verify-post-simulate-evidence',
    title: 'Verify simulated outputs are redacted and bound to the same scanner/history tuple',
    type: 'verification',
  },
  {
    id: 'abort-or-rollback-if-any-preflight-changes',
    title: 'Abort and follow rollback runbook if any preflight changes or replay guard trips',
    type: 'abort-runbook',
  },
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read JSON ${file}: ${error.message}`);
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasEvidence(value) {
  return Array.isArray(value?.evidence) && value.evidence.some(hasText);
}

function looksDigest(value) {
  return hasText(value) && (/^sha256:[a-f0-9]{64}$/i.test(value.trim()) || /^[a-f0-9]{64}$/i.test(value.trim()));
}

function normalizeRepoPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function isDeniedRuntimePath(value) {
  const normalized = normalizeRepoPath(value);
  return [
    'AGENTS.md',
    'SOUL.md',
    'USER.md',
    'TOOLS.md',
    'HEARTBEAT.md',
    'IDENTITY.md',
  ].includes(normalized) || normalized === '.openclaw' || normalized.startsWith('.openclaw/');
}

function collectPacketEvidence(packet) {
  const entries = [];
  const gates = packet?.gates && typeof packet.gates === 'object' ? packet.gates : {};
  for (const gate of Object.values(gates)) {
    if (Array.isArray(gate?.evidence)) entries.push(...gate.evidence.filter(hasText).map((entry) => entry.trim()));
  }
  if (Array.isArray(packet?.evidence)) entries.push(...packet.evidence.filter(hasText).map((entry) => entry.trim()));
  return entries;
}

function validateSpec(spec) {
  const failures = [];
  if (spec.failClosed !== true) failures.push('spec.failClosed must be true');
  if (spec.defaultDecision !== 'NO_GO') failures.push('spec.defaultDecision must be NO_GO');
  if (spec.sourcePublicExecution !== 'NO_GO') failures.push('spec.sourcePublicExecution must be NO_GO');
  const modes = new Set(spec.allowedModes || []);
  for (const mode of ['dry-run', 'simulate']) {
    if (!modes.has(mode)) failures.push(`spec.allowedModes missing ${mode}`);
  }
  for (const forbidden of ['execute', 'apply', 'live']) {
    if (modes.has(forbidden)) failures.push(`spec.allowedModes must not include ${forbidden}`);
  }
  const decisions = new Set(spec.decisionOutputs || []);
  for (const decision of ['PLAN_READY_FOR_OPERATOR_REVIEW', 'NEEDS_OPERATOR_APPROVAL', 'NO_GO']) {
    if (!decisions.has(decision)) failures.push(`spec.decisionOutputs missing ${decision}`);
  }
  const preflights = new Map((spec.preflightChecks || []).map((check) => [check.id, check]));
  for (const id of requiredPreflightIds) {
    const check = preflights.get(id);
    if (!check) {
      failures.push(`spec.preflightChecks missing ${id}`);
      continue;
    }
    if (check.failClosed !== true) failures.push(`${id}: failClosed must be true`);
    if (!hasText(check.blockedWhenMissing)) failures.push(`${id}: blockedWhenMissing is required`);
  }
  const hygiene = preflights.get('runtimeBootstrapHygiene');
  if (hygiene) {
    const denyPaths = new Set(hygiene.denyPaths || []);
    for (const requiredPath of ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'IDENTITY.md', '.openclaw/**']) {
      if (!denyPaths.has(requiredPath)) failures.push(`runtimeBootstrapHygiene.denyPaths missing ${requiredPath}`);
    }
  }
  const prohibited = new Set(spec.prohibitedActions || []);
  for (const action of ['approval execution', 'release publication', 'repository visibility change', 'live provider send', 'terminal ACK', 'production DB mutation', 'force-push']) {
    if (!prohibited.has(action)) failures.push(`spec.prohibitedActions missing ${action}`);
  }
  return failures;
}

function buildPreflightResults(blockers) {
  return requiredPreflightIds.map((id) => {
    const reasons = blockers.filter((blocker) => blocker.gate === id).map((blocker) => blocker.reason);
    return { id, ok: reasons.length === 0, reasons };
  });
}

function validateApprovalPacket(packet, addBlocker) {
  if (!packet || typeof packet !== 'object') {
    addBlocker('approvalPacketIntegrity', 'approvalPacket is required');
    return;
  }
  if (!hasText(packet.packetId)) addBlocker('approvalPacketIntegrity', 'approvalPacket.packetId is required for deterministic plan binding');
  if (packet.decision !== 'GO_CANDIDATE') {
    addBlocker('approvalPacketIntegrity', `approvalPacket.decision must be GO_CANDIDATE, got ${packet.decision || 'MISSING'}`);
  }
  if (packet.sourcePublicExecution !== 'NO_GO') {
    addBlocker('approvalPacketIntegrity', 'approvalPacket.sourcePublicExecution must remain NO_GO');
  }
  if (Array.isArray(packet.blockers) && packet.blockers.length > 0) {
    addBlocker('approvalPacketIntegrity', 'approvalPacket.blockers must be empty');
  }
  const requiredGates = Array.isArray(packet.requiredGates) ? packet.requiredGates : [];
  if (requiredGates.length === 0) addBlocker('approvalPacketIntegrity', 'approvalPacket.requiredGates must be non-empty');

  if (Array.isArray(packet.gateResults) && packet.gateResults.length > 0) {
    const gateResultIds = new Set(packet.gateResults.map((gate) => gate.gate).filter(hasText));
    for (const id of requiredGates) {
      if (!gateResultIds.has(id)) addBlocker('approvalPacketIntegrity', `gateResult ${id} is missing`);
    }
    for (const gate of packet.gateResults) {
      if (gate.ok !== true || String(gate.status || '').toUpperCase() !== 'GO' || Number(gate.evidenceCount || 0) <= 0) {
        addBlocker('approvalPacketIntegrity', `gateResult ${gate.gate || gate.title || 'unknown'} is not GO with evidence`);
      }
    }
  } else if (packet.gates && typeof packet.gates === 'object') {
    for (const id of requiredGates) {
      const gate = packet.gates[id];
      if (String(gate?.status || 'MISSING').toUpperCase() !== 'GO' || !hasEvidence(gate)) {
        addBlocker('approvalPacketIntegrity', `gate ${id} is not GO with redacted evidence`);
      }
    }
  } else {
    addBlocker('approvalPacketIntegrity', 'approvalPacket must include gateResults or gates with redacted evidence');
  }
}

function validateRuntimeBootstrapHygiene(input, addBlocker) {
  const hygiene = input.runtimeBootstrapHygiene || input.preflight?.runtimeBootstrapHygiene;
  if (!hygiene || hygiene.checked !== true) {
    addBlocker('runtimeBootstrapHygiene', 'runtime/bootstrap hygiene check must be explicitly recorded');
    return;
  }
  const paths = [...(hygiene.offendingPaths || []), ...(hygiene.changedPaths || [])].filter(isDeniedRuntimePath);
  if (paths.length > 0) {
    addBlocker('runtimeBootstrapHygiene', `runtime/bootstrap context paths would enter evidence or branch: ${[...new Set(paths)].sort().join(', ')}`);
  }
}

function validateScannerHistoryBinding(binding, addBlocker) {
  if (!binding || typeof binding !== 'object') {
    addBlocker('scannerHistoryBinding', 'scannerHistoryBinding is required');
    return;
  }
  for (const field of ['sourceCommit', 'scannerRunId', 'historyRef']) {
    if (!hasText(binding[field])) addBlocker('scannerHistoryBinding', `${field} is required`);
  }
  for (const field of ['scannerDigest', 'artifactManifestDigest']) {
    if (!looksDigest(binding[field])) addBlocker('scannerHistoryBinding', `${field} must be a sha256 digest`);
  }
}

function validateRunbook(runbook, addBlocker) {
  if (!runbook || typeof runbook !== 'object') {
    addBlocker('rollbackAbortRunbook', 'rollbackAbortRunbook is required');
    return;
  }
  for (const field of ['abortConditions', 'rollbackSteps', 'verificationSteps']) {
    if (!Array.isArray(runbook[field]) || runbook[field].filter(hasText).length === 0) {
      addBlocker('rollbackAbortRunbook', `${field} must contain at least one redacted operator-safe step`);
    }
  }
}

function validateProposedActions(input, addBlocker) {
  const proposedActions = Array.isArray(input.proposedActions) ? input.proposedActions : [];
  const forbidden = /approval execution|release|visibility|provider|telegram|deploy|restart|terminal ack|db mutation|community post|force-push|merge/i;
  for (const action of proposedActions) {
    const label = `${action?.id || ''} ${action?.kind || ''} ${action?.title || ''}`;
    if (action?.execute === true) addBlocker('modeSafety', `proposed action ${action.id || 'unknown'} sets execute=true`);
    if (forbidden.test(label)) addBlocker('modeSafety', `proposed action is prohibited in this lane: ${label.trim() || 'unknown'}`);
  }
}

function makePlanId({ spec, input, mode }) {
  const packet = input.approvalPacket || {};
  const finalApproval = input.finalApproval || {};
  return sha256(stableStringify({
    run: spec.run,
    packetId: packet.packetId,
    idempotencyKey: finalApproval.idempotencyKey,
    mode,
    scannerHistoryBinding: input.scannerHistoryBinding,
    plannedStepIds: fixedPlanSteps.map((step) => step.id),
  }));
}

function validateReplayProtection(input, planId, addBlocker) {
  const key = input.finalApproval?.idempotencyKey;
  if (!hasText(key)) {
    addBlocker('idempotencyReplayProtection', 'finalApproval.idempotencyKey is required');
    return;
  }
  const history = input.replayHistory || {};
  if (Array.isArray(history.idempotencyKeys) && history.idempotencyKeys.includes(key)) {
    addBlocker('idempotencyReplayProtection', 'idempotency key has already been used');
  }
  if (Array.isArray(history.planIds) && history.planIds.includes(planId)) {
    addBlocker('idempotencyReplayProtection', 'deterministic plan id has already been used');
  }
}

function validateOperatorGate(input, addBlocker) {
  const gate = input.finalApproval?.operatorGate;
  if (!gate || String(gate.status || 'MISSING').toUpperCase() !== 'GO') {
    addBlocker('operatorExecutionGate', 'separate explicit operator gate is required before the plan is ready');
    return;
  }
  if (!hasEvidence(gate)) {
    addBlocker('operatorExecutionGate', 'operator gate evidence is required and must be separate from packet evidence');
  }
  const packetEvidence = new Set(collectPacketEvidence(input.approvalPacket));
  for (const evidence of gate.evidence || []) {
    if (packetEvidence.has(String(evidence).trim())) {
      addBlocker('operatorExecutionGate', 'operator gate evidence must not reuse approval packet gate evidence');
    }
  }
}

function decorateSteps(mode) {
  return fixedPlanSteps.map((step, index) => ({
    order: index + 1,
    ...step,
    mode,
    executionState: 'NOT_EXECUTED',
    execute: false,
    requiresOperatorApproval: true,
  }));
}

export function buildExecutionOrchestratorReport(spec, input, requestedMode) {
  const mode = String(requestedMode || input.finalApproval?.requestedMode || 'simulate').toLowerCase();
  const blockers = [];
  const addBlocker = (gate, reason) => blockers.push({ gate, reason });

  if (!Array.isArray(spec.allowedModes) || !spec.allowedModes.includes(mode)) {
    addBlocker('modeSafety', `mode must be dry-run or simulate, got ${mode || 'MISSING'}`);
  }
  validateProposedActions(input, addBlocker);
  validateRuntimeBootstrapHygiene(input, addBlocker);
  validateApprovalPacket(input.approvalPacket, addBlocker);
  validateScannerHistoryBinding(input.scannerHistoryBinding, addBlocker);
  validateRunbook(input.rollbackAbortRunbook, addBlocker);

  const planId = makePlanId({ spec, input, mode });
  validateReplayProtection(input, planId, addBlocker);
  validateOperatorGate(input, addBlocker);

  const onlyOperatorBlockers = blockers.length > 0 && blockers.every((blocker) => blocker.gate === 'operatorExecutionGate');
  const decision = blockers.length === 0
    ? 'PLAN_READY_FOR_OPERATOR_REVIEW'
    : onlyOperatorBlockers
      ? 'NEEDS_OPERATOR_APPROVAL'
      : 'NO_GO';

  return {
    kind: 'a2a.source-public-execution-orchestrator-report',
    run: spec.run,
    lane: spec.lane,
    issue: spec.issue,
    parentIssue: spec.parentIssue,
    mode,
    failClosed: spec.failClosed,
    decision,
    ok: decision !== 'NO_GO',
    sourcePublicExecution: 'NO_GO',
    executionState: 'NOT_EXECUTED',
    operatorGated: true,
    planId,
    replayGuard: {
      idempotencyKey: input.finalApproval?.idempotencyKey || null,
      planId,
      replayProtected: blockers.every((blocker) => blocker.gate !== 'idempotencyReplayProtection'),
    },
    scannerHistoryBinding: input.scannerHistoryBinding || null,
    preflightResults: buildPreflightResults(blockers),
    blockers,
    plannedSteps: decision === 'NO_GO' ? [] : decorateSteps(mode),
    rollbackAbortRunbook: input.rollbackAbortRunbook || null,
    safety: {
      executed: false,
      prohibitedActionsPerformed: [],
      note: 'This report is approval-ready evidence only; it does not execute approval, release, visibility, provider, deploy/restart, DB, terminal ACK, community, merge, or force-push actions.',
    },
    timestamp: new Date().toISOString(),
  };
}

export function renderExecutionOrchestratorMarkdown(report) {
  const lines = [
    '# A2A Plane source-public execution orchestrator report',
    '',
    `Decision: **${report.decision}**`,
    `Run: ${report.run}`,
    `Lane: ${report.lane}`,
    `Issue: ${report.issue}`,
    `Parent: ${report.parentIssue}`,
    `Mode: ${report.mode}`,
    `Source-public execution: ${report.sourcePublicExecution}`,
    `Execution state: ${report.executionState}`,
    `Operator gated: ${report.operatorGated}`,
    `Plan id: ${report.planId}`,
    '',
    '## Preflight results',
    '',
    '| Preflight | Status | Reason |',
    '|-----------|--------|--------|',
    ...report.preflightResults.map((check) => `| ${check.id} | ${check.ok ? '✅ OK' : '❌ FAIL'} | ${check.reasons.join('; ') || '—'} |`),
    '',
  ];

  if (report.blockers.length > 0) {
    lines.push('## Blockers', '');
    for (const blocker of report.blockers) lines.push(`- **${blocker.gate}**: ${blocker.reason}`);
    lines.push('');
  }

  lines.push('## Planned steps', '');
  if (report.plannedSteps.length === 0) {
    lines.push('No planned steps are emitted because a fail-closed preflight failed.', '');
  } else {
    for (const step of report.plannedSteps) {
      lines.push(`${step.order}. **${step.id}** — ${step.title} _(execute=false, ${step.mode})_`);
    }
    lines.push('');
  }

  lines.push(
    '## Rollback / abort runbook',
    '',
    '- Abort on any preflight drift, replay guard hit, scanner/history mismatch, or missing operator gate.',
    '- Rollback steps are operator-owned and must be verified before any later live execution attempt.',
    '- This command performed no approval, release, visibility, provider, deploy/restart, DB, terminal ACK, community, merge, or force-push action.',
    '',
    `Generated: ${report.timestamp}`,
    '',
  );
  return lines.join('\n');
}

try {
  const spec = readJson(path.resolve(values.spec));
  const specFailures = validateSpec(spec);
  if (specFailures.length) {
    console.error(JSON.stringify({ ok: false, phase: 'spec', failures: specFailures }, null, 2));
    process.exit(1);
  }

  if (!values.input) {
    console.log(JSON.stringify({
      ok: true,
      phase: 'spec',
      decision: spec.defaultDecision,
      decisionOutputs: spec.decisionOutputs,
      sourcePublicExecution: spec.sourcePublicExecution,
      allowedModes: spec.allowedModes,
      preflightChecks: requiredPreflightIds,
    }, null, 2));
    process.exit(0);
  }

  const input = readJson(path.resolve(values.input));
  const report = buildExecutionOrchestratorReport(spec, input, values.mode);

  if (values.format === 'markdown') {
    (report.ok ? console.log : console.error)(renderExecutionOrchestratorMarkdown(report));
  } else {
    (report.ok ? console.log : console.error)(JSON.stringify(report, null, 2));
  }

  process.exit(report.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
