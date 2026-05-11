#!/usr/bin/env node
/**
 * A2A Plane source-public execution orchestrator (simulate-only).
 *
 * Converts a reviewed final approval packet into a deterministic execution plan
 * for operator review. It never performs approval, release, repository
 * visibility, provider-send, deploy/restart, terminal ACK, DB, merge, or
 * community-post actions.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    spec: { type: 'string', default: 'docs/final-approval/source-public-execution-orchestrator-schema.json' },
    input: { type: 'string' },
    format: { type: 'string', default: 'json' },
  },
});

const decisionStates = new Set(['GO_CANDIDATE', 'NEEDS_OPERATOR_APPROVAL', 'NO_GO']);

const unredactedEvidenceRules = [
  {
    kind: 'secret-assignment',
    re: /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY)[A-Z0-9_]*\s*=\s*['"]?(?!<|\$\{|YOUR_|redacted|REDACTED)[^'"\s#]{12,}/i,
  },
  { kind: 'github-token-shape', re: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { kind: 'aws-access-key-shape', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'absolute-private-path', re: /\/(?:home|Users)\/[^\s'")`]+|\/root\/private\/[^\s'")`]+/ },
  { kind: 'raw-session-dump', re: /(?:^|\n)\s*(?:system|developer|assistant|user|tool)\s*<\|/i },
  { kind: 'openclaw-cache-boundary', re: /OPENCLAW_CACHE_BOUNDARY/ },
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read JSON ${file}: ${error.message}`);
  }
}

function asStatus(value) {
  return String(value || 'MISSING').trim().toUpperCase().replace(/-/g, '_');
}

function hasEvidence(value) {
  return Array.isArray(value?.evidence) && value.evidence.some((entry) => typeof entry === 'string' && entry.trim());
}

function evidenceEntries(input) {
  const gates = input.gates && typeof input.gates === 'object' ? input.gates : {};
  const namedEvidence = Object.entries(gates).flatMap(([gateId, gate]) => evidenceForGate(gate).map((entry) => ({ gateId, entry })));
  const directEvidence = [
    ...(Array.isArray(input.operatorApproval?.evidence) ? input.operatorApproval.evidence : []),
    ...(Array.isArray(input.approvalPacket?.evidence) ? input.approvalPacket.evidence : []),
  ]
    .filter((entry) => typeof entry === 'string' && entry.trim())
    .map((entry) => ({ gateId: 'directEvidence', entry }));
  return [...namedEvidence, ...directEvidence];
}

function evidenceForGate(gate) {
  return Array.isArray(gate?.evidence) ? gate.evidence.filter((entry) => typeof entry === 'string' && entry.trim()) : [];
}

function denyPathMatcher(denyPath) {
  if (denyPath.endsWith('/**')) {
    const prefix = denyPath.slice(0, -3);
    return (value) => value === prefix || value.startsWith(`${prefix}/`);
  }
  return (value) => value === denyPath;
}

function findDenyPathReferences(spec, input) {
  const matchers = (spec.runtimeBootstrapDenyPaths || []).map((denyPath) => [denyPath, denyPathMatcher(denyPath)]);
  const candidates = [
    ...(Array.isArray(input.offendingPaths) ? input.offendingPaths : []),
    ...(Array.isArray(input.artifactPaths) ? input.artifactPaths : []),
    ...evidenceEntries(input).map(({ entry }) => entry),
  ].filter((value) => typeof value === 'string');

  const found = new Set();
  for (const candidate of candidates) {
    for (const token of candidate.split(/[\s,;:()<>[\]{}"'`]+/).filter(Boolean)) {
      const normalized = token.replace(/^\.\//, '').replace(/[#?].*$/, '');
      for (const [, matches] of matchers) {
        if (matches(normalized)) found.add(normalized);
      }
    }
  }
  return [...found].sort();
}

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

function normalizeStep(step) {
  return {
    order: Number(step.order),
    repo: String(step.repo || ''),
    action: String(step.action || ''),
    scope: String(step.scope || ''),
  };
}

function canonicalExecutionPlan(input) {
  const packet = input.approvalPacket || {};
  const plan = input.executionPlan || {};
  const steps = Array.isArray(plan.steps) ? plan.steps.map(normalizeStep).sort((a, b) => a.order - b.order || a.repo.localeCompare(b.repo) || a.action.localeCompare(b.action)) : [];
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

function validateSpec(spec) {
  const failures = [];
  if (spec.failClosed !== true) failures.push('spec.failClosed must be true');
  if (spec.defaultDecision !== 'NO_GO') failures.push('spec.defaultDecision must be NO_GO');
  if (spec.planMode !== 'SIMULATE_ONLY') failures.push('spec.planMode must be SIMULATE_ONLY');
  if (spec.sourcePublicExecution !== 'NOT_PERFORMED') failures.push('spec.sourcePublicExecution must be NOT_PERFORMED');
  if (spec.approvalExecution !== 'NOT_PERFORMED') failures.push('spec.approvalExecution must be NOT_PERFORMED');
  for (const state of decisionStates) {
    if (!Array.isArray(spec.decisionStates) || !spec.decisionStates.includes(state)) failures.push(`spec.decisionStates missing ${state}`);
  }

  const gates = new Map((spec.gates || []).map((gate) => [gate.id, gate]));
  for (const id of spec.requiredGates || []) {
    const gate = gates.get(id);
    if (!gate) failures.push(`required gate missing from spec.gates: ${id}`);
    if (gate && gate.failClosed !== true) failures.push(`${id}: failClosed must be true`);
    if (gate && gate.requiredForCandidate !== true) failures.push(`${id}: requiredForCandidate must be true`);
    if (gate && !gate.blockedWhenMissing) failures.push(`${id}: blockedWhenMissing is required`);
    if (gate && !hasEvidence(gate)) failures.push(`${id}: evidence requirements must be documented`);
  }
  if (!gates.has(spec.operatorApprovalGate)) failures.push('operatorApproval gate must be present but not required for candidate validity');
  for (const requiredPath of ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'IDENTITY.md', '.openclaw/**']) {
    if (!spec.runtimeBootstrapDenyPaths?.includes(requiredPath)) failures.push(`runtimeBootstrapDenyPaths missing ${requiredPath}`);
  }
  return failures;
}

function validateApprovalPacket(input) {
  const packet = input.approvalPacket || {};
  const blockers = [];
  if (!packet.packetId) blockers.push('final approval packet missing packetId');
  if (!packet.manifestDigest) blockers.push('final approval packet missing manifestDigest');
  if (packet.deterministic !== true) blockers.push('final approval packet must be deterministic=true');
  if (packet.approvalExecution === true || packet.sourcePublicExecution === true) blockers.push('final approval packet must not execute approval or source-public actions');
  return blockers;
}

function validateExecutionPlan(input) {
  const packet = input.approvalPacket || {};
  const plan = input.executionPlan || {};
  const blockers = [];
  if (!plan.approvalPacketId) blockers.push('execution plan missing approvalPacketId');
  if (plan.approvalPacketId && packet.packetId && plan.approvalPacketId !== packet.packetId) blockers.push('execution plan approvalPacketId does not match final approval packet');
  if (!plan.approvedManifestDigest) blockers.push('execution plan missing approvedManifestDigest');
  if (plan.approvedManifestDigest && packet.manifestDigest && plan.approvedManifestDigest !== packet.manifestDigest) blockers.push('execution plan approvedManifestDigest does not match final approval packet manifestDigest');
  if (plan.mode !== 'simulate') blockers.push('execution plan mode must be simulate');
  if (plan.dryRun !== true || plan.simulate !== true) blockers.push('execution plan must set dryRun=true and simulate=true');
  if ((plan.sourcePublicExecution || 'NOT_PERFORMED') !== 'NOT_PERFORMED') blockers.push('execution plan sourcePublicExecution must be NOT_PERFORMED');
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) blockers.push('execution plan must list at least one future operator-approved step');
  if (Array.isArray(plan.steps)) {
    const seenOrders = new Set();
    plan.steps.forEach((step, index) => {
      const normalized = normalizeStep(step);
      if (!Number.isInteger(normalized.order) || normalized.order < 1) blockers.push(`execution plan step ${index + 1} has invalid order`);
      if (seenOrders.has(normalized.order)) blockers.push(`execution plan step order ${normalized.order} is duplicated`);
      seenOrders.add(normalized.order);
      if (!normalized.repo || !normalized.action || !normalized.scope) blockers.push(`execution plan step ${index + 1} must include repo, action, and scope`);
    });
  }
  const computedDigest = sha256Digest(canonicalExecutionPlan(input));
  if (!plan.executionPlanDigest) blockers.push('execution plan missing executionPlanDigest');
  if (plan.executionPlanDigest && plan.executionPlanDigest !== computedDigest) blockers.push('execution plan digest does not match canonical plan content');
  return { blockers, computedDigest };
}

function validateScannerHistoryBinding(input) {
  const packet = input.approvalPacket || {};
  const plan = input.executionPlan || {};
  const binding = input.scannerHistoryBinding || {};
  const blockers = [];
  if (asStatus(binding.status) !== 'GO') blockers.push(`scanner/history binding status is ${asStatus(binding.status)}`);
  for (const field of ['scannerDigest', 'historyDigest', 'manifestDigest']) {
    if (!binding[field]) blockers.push(`scanner/history binding missing ${field}`);
  }
  if (binding.manifestDigest && packet.manifestDigest && binding.manifestDigest !== packet.manifestDigest) blockers.push('scanner/history manifestDigest does not match final approval packet');
  if (plan.scannerHistoryDigest && binding.manifestDigest && plan.scannerHistoryDigest !== binding.manifestDigest) blockers.push('execution plan scannerHistoryDigest does not match scanner/history binding manifestDigest');
  if (!['clean', 'dispositioned'].includes(String(binding.findings || '').toLowerCase())) blockers.push('scanner/history findings must be clean or dispositioned');
  return blockers;
}

function validateIdempotency(input) {
  const packet = input.approvalPacket || {};
  const plan = input.executionPlan || {};
  const replay = input.idempotencyReplay || {};
  const blockers = [];
  const key = plan.idempotencyKey || packet.idempotencyKey;
  if (!key) blockers.push('execution plan missing idempotencyKey');
  if (packet.idempotencyKey && plan.idempotencyKey && packet.idempotencyKey !== plan.idempotencyKey) blockers.push('packet and execution plan idempotency keys differ');
  if (replay.idempotencyKey && key && replay.idempotencyKey !== key) blockers.push('replay proof idempotencyKey does not match execution plan');
  if (Number(replay.replayAttemptCount || 0) < 2) blockers.push('replay proof must include at least two attempts');
  for (const [field, label] of [
    ['duplicateExecutionPlans', 'duplicate execution plans'],
    ['duplicateLiveActions', 'duplicate live actions'],
    ['duplicateTerminalMarkers', 'duplicate terminal markers'],
  ]) {
    if (Number(replay[field] ?? 0) !== 0) blockers.push(`replay proof created ${label}`);
  }
  if (replay.manifestMismatchDecision !== 'NO_GO') blockers.push('manifest mismatch must resolve to NO_GO');
  return blockers;
}

function validatePreflight(input) {
  const preflight = input.preflight || {};
  const blockers = [];
  if (asStatus(preflight.status) !== 'GO') blockers.push(`preflight status is ${asStatus(preflight.status)}`);
  if (preflight.failureDecision !== 'NO_GO') blockers.push('preflight failureDecision must be NO_GO');
  if (preflight.sideEffectsBeforePreflight !== false) blockers.push('preflight must prove no side effects before completion');
  return blockers;
}

function validateRollbackAbort(input) {
  const runbook = input.rollbackAbortRunbook || {};
  const blockers = [];
  if (runbook.abortBeforeSideEffects !== true) blockers.push('rollback/abort runbook must set abortBeforeSideEffects=true');
  if (!runbook.abortPath) blockers.push('rollback/abort runbook missing abortPath');
  if (!runbook.rollbackPath) blockers.push('rollback/abort runbook missing rollbackPath');
  if (!Array.isArray(runbook.rollbackSteps) || runbook.rollbackSteps.length === 0) blockers.push('rollback/abort runbook missing rollbackSteps');
  return blockers;
}

function validateInput(spec, input) {
  const blockers = [];
  const gateStatuses = input.gates && typeof input.gates === 'object' ? input.gates : {};

  const operatorGate = gateStatuses[spec.operatorApprovalGate] || input.operatorApproval;
  const operatorApprovalReady = asStatus(operatorGate?.status) === 'GO' && hasEvidence(operatorGate);

  for (const gateId of spec.requiredGates || []) {
    const gate = gateStatuses[gateId];
    const status = asStatus(gate?.status);
    if (status !== 'GO') blockers.push({ gate: gateId, status, reason: `status is ${status}` });
    if (!hasEvidence(gate)) blockers.push({ gate: gateId, status, reason: 'redacted evidence link is missing' });
  }

  for (const reason of validateApprovalPacket(input)) blockers.push({ gate: 'finalApprovalPacket', status: asStatus(gateStatuses.finalApprovalPacket?.status), reason });
  const planResult = validateExecutionPlan(input);
  for (const reason of planResult.blockers) blockers.push({ gate: 'deterministicExecutionPlan', status: asStatus(gateStatuses.deterministicExecutionPlan?.status), reason });
  for (const reason of validateScannerHistoryBinding(input)) blockers.push({ gate: 'scannerHistoryBinding', status: asStatus(gateStatuses.scannerHistoryBinding?.status), reason });
  for (const reason of validateIdempotency(input)) blockers.push({ gate: 'idempotencyReplayProtection', status: asStatus(gateStatuses.idempotencyReplayProtection?.status), reason });
  for (const reason of validatePreflight(input)) blockers.push({ gate: 'preflightFailureSemantics', status: asStatus(gateStatuses.preflightFailureSemantics?.status), reason });
  for (const reason of validateRollbackAbort(input)) blockers.push({ gate: 'rollbackAbortRunbook', status: asStatus(gateStatuses.rollbackAbortRunbook?.status), reason });

  for (const { gateId, entry } of evidenceEntries(input)) {
    for (const rule of unredactedEvidenceRules) {
      if (rule.re.test(entry)) blockers.push({ gate: gateId, status: asStatus(gateStatuses[gateId]?.status), reason: `evidence is not redacted (${rule.kind})` });
    }
  }

  const offendingPaths = findDenyPathReferences(spec, input);
  for (const offendingPath of offendingPaths) {
    blockers.push({ gate: 'runtimeBootstrapHygiene', status: asStatus(gateStatuses.runtimeBootstrapHygiene?.status), reason: `runtime/bootstrap path would enter evidence: ${offendingPath}`, path: offendingPath });
  }

  for (const flag of spec.forbiddenLiveFlags || []) {
    if (input[flag] === true) blockers.push({ gate: 'safety', status: 'NO_GO', reason: `${flag} is forbidden in simulate-only final approval orchestration` });
  }

  const operatorEvidence = new Set(evidenceForGate(operatorGate).map((entry) => entry.trim()));
  if (operatorApprovalReady) {
    for (const { gateId, entry } of evidenceEntries(input)) {
      if (gateId !== spec.operatorApprovalGate && gateId !== 'directEvidence' && operatorEvidence.has(entry.trim())) {
        blockers.push({ gate: gateId, status: asStatus(gateStatuses[gateId]?.status), reason: `operator approval evidence must be separate from ${gateId}` });
      }
    }
  }

  const decision = blockers.length > 0 ? 'NO_GO' : operatorApprovalReady ? 'GO_CANDIDATE' : 'NEEDS_OPERATOR_APPROVAL';
  return {
    ok: blockers.length === 0,
    decision,
    planMode: 'SIMULATE_ONLY',
    sourcePublicExecution: 'NOT_PERFORMED',
    approvalExecution: 'NOT_PERFORMED',
    operatorApprovalReady,
    computedExecutionPlanDigest: planResult.computedDigest,
    blockers: blockers.sort((a, b) => `${a.gate}:${a.reason}`.localeCompare(`${b.gate}:${b.reason}`)),
    offendingPaths,
  };
}

export function buildExecutionOrchestratorReport(spec, input) {
  const result = validateInput(spec, input);
  return {
    kind: 'a2a.source-public-execution-orchestrator-report',
    run: spec.run,
    lane: spec.lane,
    issue: spec.issue,
    parentIssue: spec.parentIssue,
    failClosed: spec.failClosed,
    defaultDecision: spec.defaultDecision,
    decision: result.decision,
    planMode: result.planMode,
    sourcePublicExecution: result.sourcePublicExecution,
    approvalExecution: result.approvalExecution,
    ok: result.ok,
    operatorApprovalReady: result.operatorApprovalReady,
    approvalPacketId: input.approvalPacket?.packetId || null,
    approvedManifestDigest: input.approvalPacket?.manifestDigest || null,
    idempotencyKey: input.executionPlan?.idempotencyKey || input.approvalPacket?.idempotencyKey || null,
    computedExecutionPlanDigest: result.computedExecutionPlanDigest,
    declaredExecutionPlanDigest: input.executionPlan?.executionPlanDigest || null,
    canonicalExecutionPlan: canonicalExecutionPlan(input),
    blockers: result.blockers,
    offendingPaths: result.offendingPaths,
  };
}

export function renderExecutionOrchestratorMarkdown(report) {
  const title = report.decision === 'NO_GO' ? 'Block' : 'Done';
  const lines = [
    `${title}: A2A Plane source-public execution orchestrator`,
    '',
    `Run: ${report.run}`,
    `Lane: ${report.lane}`,
    `Issue: ${report.issue}`,
    `Parent: ${report.parentIssue}`,
    `Decision: ${report.decision}`,
    `Plan mode: ${report.planMode}`,
    `Source-public execution: ${report.sourcePublicExecution}`,
    `Approval execution: ${report.approvalExecution}`,
    `Approval packet: ${report.approvalPacketId || 'missing'}`,
    `Manifest digest: ${report.approvedManifestDigest || 'missing'}`,
    `Execution plan digest: ${report.declaredExecutionPlanDigest || 'missing'}`,
    `Idempotency key: ${report.idempotencyKey || 'missing'}`,
    '',
  ];

  if (report.blockers.length > 0) {
    lines.push('## Blockers', '');
    for (const blocker of report.blockers) {
      const pathSuffix = blocker.path ? ` (${blocker.path})` : '';
      lines.push(`- **${blocker.gate}**: ${blocker.reason}${pathSuffix}`);
    }
    lines.push('');
  }

  lines.push(
    '## Safety',
    '',
    'GO_CANDIDATE means the final packet and deterministic plan are approval-ready only; it is not approval execution and not source-public execution.',
    'This command is simulate-only: no approval, release, repository visibility change, provider send, deploy/restart, terminal ACK, DB mutation, automatic merge, force-push, or community post is performed.',
    'Replays must reuse the same idempotency key and canonical execution-plan digest; mismatch or duplicate side-effect evidence resolves to NO_GO.',
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
      decisionStates: [...decisionStates],
      planMode: 'SIMULATE_ONLY',
      sourcePublicExecution: 'NOT_PERFORMED',
      approvalExecution: 'NOT_PERFORMED',
      requiredGates: spec.requiredGates,
    }, null, 2));
    process.exit(0);
  }

  const report = buildExecutionOrchestratorReport(spec, readJson(path.resolve(values.input)));
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
