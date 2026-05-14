#!/usr/bin/env node
/**
 * A2A Spec-First TaskFlow runtime rehearsal.
 *
 * Dry-run/assisted by design: consumes a spec-first packet and produces a
 * deterministic managed TaskFlow draft with stateJson, optional waitJson, child
 * evidence lane plans, and finalizer closeout expectations.
 *
 * This command never deploys, restarts Gateway/brokers/workers, sends providers,
 * mutates DB/outbox state, ACKs or replays Terminal Brief records, releases/tags,
 * moves secrets, or enables automatic runtime execution.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    spec: { type: 'string', default: 'docs/taskflow/a2a-spec-first-runtime-schema.json' },
    input: { type: 'string' },
    format: { type: 'string', default: 'json' },
    mode: { type: 'string', default: 'dry-run' },
  },
});

const allowedModes = new Set(['dry-run', 'simulate']);
const decisionOutputs = new Set(['NO_GO', 'TASKFLOW_DRY_RUN_READY', 'NEEDS_OPERATOR_APPROVAL']);
const allowedBoundaryStatuses = new Set(['not-approved', 'blocked']);
const sensitiveActions = [
  'deploy',
  'restart',
  'liveCanary',
  'providerSend',
  'dbMutation',
  'terminalAckReplay',
  'releaseTag',
  'secretMovement',
  'forcePushHistoryRewrite',
];
const terminalStates = new Set(['blocked', 'closed']);
const stateTransitions = {
  spec_draft: ['plan_ready', 'blocked'],
  plan_ready: ['tasks_ready', 'blocked'],
  tasks_ready: ['dispatching', 'awaiting_approval', 'blocked'],
  dispatching: ['collecting_evidence', 'blocked'],
  collecting_evidence: ['ready_for_closeout', 'awaiting_approval', 'blocked'],
  awaiting_approval: ['collecting_evidence', 'ready_for_closeout', 'blocked'],
  ready_for_closeout: ['closed', 'blocked'],
  blocked: [],
  closed: [],
};

const forbiddenRuntimePaths = [
  'AGENTS.md',
  'SOUL.md',
  'USER.md',
  'TOOLS.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  '.openclaw/',
];

const unsafeStringRules = [
  { kind: 'github-token-shape', re: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  {
    kind: 'secret-assignment',
    re: /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY)[A-Z0-9_]*\s*=\s*['"]?(?!<|\$\{|YOUR_|redacted|REDACTED)[^'"\s#]{12,}/i,
  },
  { kind: 'private-key', re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { kind: 'private-path', re: /\/(?:home|Users)\/[^\s'")`]+|\/root\/(?:private|\.ssh|\.config)\/[^\s'")`]+/ },
  { kind: 'raw-session-dump', re: /(?:^|\n)\s*(?:system|developer|assistant|user|tool)\s*<\|/i },
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read JSON ${file}: ${error.message}`);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function redactHash(hash) {
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

function slug(value) {
  return String(value || 'a2a-flow')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'a2a-flow';
}

function walkStrings(value, visit, trail = []) {
  if (typeof value === 'string') {
    visit(value, trail);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, visit, [...trail, index]));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      walkStrings(item, visit, [...trail, key]);
    }
  }
}

function validateSpec(spec) {
  const failures = [];
  if (spec.failClosed !== true) failures.push('spec.failClosed must be true');
  if (spec.runtimeAutomationEnabled !== false) failures.push('spec.runtimeAutomationEnabled must be false');
  if (spec.defaultDecision !== 'NO_GO') failures.push('spec.defaultDecision must be NO_GO');
  if (!Array.isArray(spec.decisionOutputs) || spec.decisionOutputs.length === 0) {
    failures.push('spec.decisionOutputs must be non-empty');
  } else {
    for (const decision of decisionOutputs) {
      if (!spec.decisionOutputs.includes(decision)) failures.push(`spec.decisionOutputs missing ${decision}`);
    }
  }
  if (!Array.isArray(spec.executionModes) || !spec.executionModes.includes('dry-run') || !spec.executionModes.includes('simulate')) {
    failures.push('spec.executionModes must include dry-run and simulate');
  }
  if (spec.executionModes?.includes('execute')) failures.push('spec.executionModes must not include execute');
  if (!Array.isArray(spec.lifecycleStates) || spec.lifecycleStates.length < 8) {
    failures.push('spec.lifecycleStates must list the TaskFlow bridge states');
  }
  for (const state of Object.keys(stateTransitions)) {
    if (!spec.lifecycleStates?.includes(state)) failures.push(`spec.lifecycleStates missing ${state}`);
  }
  if (!Array.isArray(spec.approvalSensitiveActions)) {
    failures.push('spec.approvalSensitiveActions must be an array');
  } else {
    for (const action of sensitiveActions) {
      if (!spec.approvalSensitiveActions.includes(action)) failures.push(`spec.approvalSensitiveActions missing ${action}`);
    }
  }
  for (const field of ['protocol', 'source', 'classification', 'ownership', 'affectedRepos', 'approvalBoundaries', 'evidence', 'closeout']) {
    if (!spec.requiredStateFields?.includes(field)) failures.push(`spec.requiredStateFields missing ${field}`);
  }
  return failures;
}

function validateSource(source, blockers) {
  if (!source || typeof source !== 'object') {
    blockers.push({ gate: 'source', status: 'MISSING', reason: 'source object is required' });
    return;
  }
  for (const field of ['issueUrl', 'specPath', 'planPath', 'tasksPath']) {
    if (!hasText(source[field])) blockers.push({ gate: 'source', status: 'MISSING', reason: `source.${field} is required` });
  }
  for (const [field, expected] of Object.entries({ specPath: '/spec.md', planPath: '/plan.md', tasksPath: '/tasks.md' })) {
    if (hasText(source[field]) && !source[field].endsWith(expected)) {
      blockers.push({ gate: 'source', status: 'INVALID', reason: `source.${field} must end with ${expected}` });
    }
  }
  if (hasText(source.issueUrl) && !/^https:\/\/github\.com\/jinwon-int\/[A-Za-z0-9_.-]+\/issues\/\d+$/.test(source.issueUrl)) {
    blockers.push({ gate: 'source', status: 'INVALID', reason: 'source.issueUrl must be a jinwon-int GitHub issue URL' });
  }
}

function validateApprovalBoundaries(boundaries, blockers) {
  if (!boundaries || typeof boundaries !== 'object') {
    blockers.push({ gate: 'approvalBoundaries', status: 'MISSING', reason: 'approvalBoundaries object is required' });
    return;
  }
  for (const action of sensitiveActions) {
    const status = boundaries[action];
    if (!allowedBoundaryStatuses.has(status)) {
      blockers.push({
        gate: 'approvalBoundaries',
        status: 'INVALID',
        reason: `${action} must be not-approved or blocked in dry-run runtime state`,
      });
    }
  }
}

function validateLanes(input, blockers) {
  const lanes = asArray(input.lanes);
  if (lanes.length === 0) {
    blockers.push({ gate: 'lanes', status: 'MISSING', reason: 'at least one child evidence lane is required' });
    return;
  }
  const affectedRepos = new Set(asArray(input.affectedRepos));
  for (const [index, lane] of lanes.entries()) {
    const gate = `lanes.${index}`;
    if (!hasText(lane?.id) || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(lane.id)) {
      blockers.push({ gate, status: 'INVALID', reason: 'lane.id must be a safe kebab-case id' });
    }
    if (!hasText(lane?.repo)) blockers.push({ gate, status: 'MISSING', reason: 'lane.repo is required' });
    if (hasText(lane?.repo) && affectedRepos.size > 0 && !affectedRepos.has(lane.repo)) {
      blockers.push({ gate, status: 'INVALID', reason: `lane.repo ${lane.repo} must be listed in affectedRepos` });
    }
    if (!hasText(lane?.task)) blockers.push({ gate, status: 'MISSING', reason: 'lane.task is required' });
    if (!Array.isArray(lane?.expectedEvidence) || lane.expectedEvidence.length === 0) {
      blockers.push({ gate, status: 'MISSING', reason: 'lane.expectedEvidence must be non-empty' });
    }
    if (lane?.executes === true || lane?.mutatesRuntime === true) {
      blockers.push({ gate, status: 'BLOCKED', reason: 'lane must not execute or mutate runtime in dry-run bridge' });
    }
    if (sensitiveActions.includes(lane?.actionKind)) {
      blockers.push({ gate, status: 'BLOCKED', reason: `lane.actionKind ${lane.actionKind} is approval-sensitive` });
    }
  }
}

function validateApprovalRequest(request, blockers) {
  if (request == null) return;
  if (!request || typeof request !== 'object') {
    blockers.push({ gate: 'approvalRequest', status: 'INVALID', reason: 'approvalRequest must be an object when present' });
    return;
  }
  if (request.kind !== 'operator_approval') {
    blockers.push({ gate: 'approvalRequest', status: 'INVALID', reason: 'approvalRequest.kind must be operator_approval' });
  }
  if (!hasText(request.approvalType)) blockers.push({ gate: 'approvalRequest', status: 'MISSING', reason: 'approvalType is required' });
  if (!hasText(request.requestedScope)) blockers.push({ gate: 'approvalRequest', status: 'MISSING', reason: 'requestedScope is required' });
  const blockedActions = asArray(request.blockedActions);
  if (blockedActions.length === 0) {
    blockers.push({ gate: 'approvalRequest', status: 'MISSING', reason: 'blockedActions must be non-empty' });
  }
  for (const action of blockedActions) {
    if (!sensitiveActions.includes(action)) {
      blockers.push({ gate: 'approvalRequest', status: 'INVALID', reason: `unknown blocked action ${action}` });
    }
  }
}

function scanUnsafeStrings(input, blockers) {
  walkStrings(input, (text, trail) => {
    for (const forbiddenPath of forbiddenRuntimePaths) {
      if (text.includes(forbiddenPath)) {
        blockers.push({ gate: 'redactedState', status: 'BLOCKED', reason: `state must not reference runtime/bootstrap path ${forbiddenPath}`, path: trail.join('.') });
      }
    }
    for (const rule of unsafeStringRules) {
      if (rule.re.test(text)) {
        blockers.push({ gate: 'redactedState', status: 'BLOCKED', reason: `state contains unsafe string (${rule.kind})`, path: trail.join('.') });
      }
    }
  });
}

function validateInput(input) {
  const blockers = [];
  if (!input || typeof input !== 'object') {
    return [{ gate: 'input', status: 'MISSING', reason: 'input JSON object is required' }];
  }
  if (input.runtimeAutomationEnabled === true) {
    blockers.push({ gate: 'runtimeAutomation', status: 'BLOCKED', reason: 'runtimeAutomationEnabled must remain false for this bridge' });
  }
  if (input.requestedAction && ['execute', 'enable-runtime', 'launch-live', 'deploy', 'restart', 'canary'].includes(input.requestedAction)) {
    blockers.push({ gate: 'requestedAction', status: 'BLOCKED', reason: `requestedAction ${input.requestedAction} is out of scope` });
  }
  if (input.protocol !== 'a2a-spec-first') blockers.push({ gate: 'protocol', status: 'INVALID', reason: 'protocol must be a2a-spec-first' });
  if (!hasText(input.controllerId)) blockers.push({ gate: 'controllerId', status: 'MISSING', reason: 'controllerId is required' });
  if (hasText(input.controllerId) && input.controllerId !== 'a2a-plane/spec-first-taskflow-bridge') {
    blockers.push({ gate: 'controllerId', status: 'INVALID', reason: 'controllerId must be a2a-plane/spec-first-taskflow-bridge' });
  }
  if (!hasText(input.goal)) blockers.push({ gate: 'goal', status: 'MISSING', reason: 'goal is required' });
  validateSource(input.source, blockers);
  const size = input.classification?.size;
  if (!['medium', 'large'].includes(size)) blockers.push({ gate: 'classification', status: 'INVALID', reason: 'classification.size must be medium or large' });
  if (!hasText(input.classification?.reason)) blockers.push({ gate: 'classification', status: 'MISSING', reason: 'classification.reason is required' });
  if (!hasText(input.ownership?.brokerOfRecord)) blockers.push({ gate: 'ownership', status: 'MISSING', reason: 'ownership.brokerOfRecord is required' });
  if (!hasText(input.ownership?.finalizer)) blockers.push({ gate: 'ownership', status: 'MISSING', reason: 'ownership.finalizer is required' });
  if (!hasText(input.ownership?.humanApprovalOwner)) blockers.push({ gate: 'ownership', status: 'MISSING', reason: 'ownership.humanApprovalOwner is required' });
  if (!Array.isArray(input.affectedRepos) || input.affectedRepos.length === 0) {
    blockers.push({ gate: 'affectedRepos', status: 'MISSING', reason: 'affectedRepos must be non-empty' });
  }
  validateApprovalBoundaries(input.approvalBoundaries, blockers);
  validateLanes(input, blockers);
  validateApprovalRequest(input.approvalRequest, blockers);
  scanUnsafeStrings(input, blockers);
  return blockers;
}

function makeStateJson(input, mode) {
  return {
    protocol: 'a2a-spec-first',
    version: 1,
    source: input.source,
    classification: input.classification,
    ownership: input.ownership,
    affectedRepos: input.affectedRepos,
    approvalBoundaries: input.approvalBoundaries,
    evidence: input.evidence || { prs: [], tests: [], ci: [], wiki: [], blockers: [] },
    runtime: {
      mode,
      runtimeAutomationEnabled: false,
      sourcePublicExecution: 'NO_GO',
      managedFlowDraftOnly: true,
    },
    closeout: input.closeout || {
      decision: null,
      summary: null,
      closedBy: null,
      closedAt: null,
    },
  };
}

function buildFlowDraft(input, mode) {
  const waitJson = input.approvalRequest
    ? {
        kind: 'operator_approval',
        approvalType: input.approvalRequest.approvalType,
        requestedScope: input.approvalRequest.requestedScope,
        blockedActions: input.approvalRequest.blockedActions,
      }
    : null;
  const currentStep = waitJson ? 'awaiting_approval' : 'tasks_ready';
  const stateJson = makeStateJson(input, mode);
  const flowHash = stableHash({ source: input.source, lanes: input.lanes, goal: input.goal });
  const childTasks = asArray(input.lanes).map((lane, index) => ({
    laneId: lane.id,
    runtime: 'taskflow-child-draft',
    runId: `${slug(input.goal)}-${lane.id}-${index + 1}`,
    childSessionKey: null,
    targetRepo: lane.repo,
    task: lane.task,
    status: 'planned',
    dryRunSafe: true,
    mutatesRuntime: false,
    expectedEvidence: lane.expectedEvidence,
    timeoutExpectation: lane.timeoutExpectation || 'checkpoint-required',
  }));
  return {
    controllerId: input.controllerId,
    goal: input.goal,
    flowIdPreview: `draft-${redactHash(flowHash)}`,
    currentStep,
    status: waitJson ? 'waiting' : 'running',
    stateJson,
    waitJson,
    childTasks,
    closeout: {
      finalizer: input.ownership.finalizer,
      requiredDecision: 'GO_OR_NO_GO',
      exactlyOneFinalizer: true,
    },
    revisionPolicy: {
      required: true,
      carryForwardLatestRevision: true,
    },
    managedMutations: ['createManaged', 'runTask', waitJson ? 'setWaiting' : 'resume-or-finish-when-ready'].filter(Boolean),
  };
}

function specOnlyOutput(spec, mode) {
  return {
    decision: 'NO_GO',
    sourcePublicExecution: 'NO_GO',
    taskFlowRuntime: 'DRY_RUN_ONLY',
    runtimeAutomationEnabled: false,
    mode,
    requiredStateFields: spec.requiredStateFields || [],
    lifecycleStates: spec.lifecycleStates || [],
    approvalSensitiveActions: spec.approvalSensitiveActions || sensitiveActions,
    blockers: [{ gate: 'input', status: 'MISSING', reason: 'no input packet supplied' }],
  };
}

function outputMarkdown(result) {
  const lines = [];
  lines.push(`# A2A Spec-First TaskFlow Runtime Rehearsal`);
  lines.push('');
  lines.push(`- Decision: ${result.decision}`);
  lines.push(`- TaskFlow runtime: ${result.taskFlowRuntime}`);
  lines.push(`- Source-public execution: ${result.sourcePublicExecution}`);
  lines.push(`- Runtime automation enabled: ${result.runtimeAutomationEnabled}`);
  lines.push(`- Mode: ${result.mode}`);
  if (result.flowDraft) {
    lines.push(`- Current step: ${result.flowDraft.currentStep}`);
    lines.push(`- Child lanes: ${result.flowDraft.childTasks.length}`);
    lines.push(`- Finalizer: ${result.flowDraft.closeout.finalizer}`);
  }
  lines.push('');
  lines.push('## Blockers');
  if (!result.blockers?.length) {
    lines.push('- none');
  } else {
    for (const blocker of result.blockers) {
      lines.push(`- ${blocker.gate}: ${blocker.status} — ${blocker.reason}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const mode = values.mode || 'dry-run';
  if (!allowedModes.has(mode)) {
    const error = { decision: 'NO_GO', sourcePublicExecution: 'NO_GO', error: `unsupported mode ${mode}`, allowedModes: [...allowedModes] };
    console.error(JSON.stringify(error, null, 2));
    process.exit(1);
  }

  const spec = readJson(values.spec);
  const specFailures = validateSpec(spec);
  if (specFailures.length > 0) {
    console.error(JSON.stringify({ decision: 'NO_GO', sourcePublicExecution: 'NO_GO', specFailures }, null, 2));
    process.exit(1);
  }

  if (!values.input) {
    const result = specOnlyOutput(spec, mode);
    if (values.format === 'markdown') process.stdout.write(outputMarkdown(result));
    else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const input = readJson(values.input);
  const blockers = validateInput(input);
  const hasBlockingErrors = blockers.length > 0;
  const decision = hasBlockingErrors ? 'NO_GO' : input.approvalRequest ? 'NEEDS_OPERATOR_APPROVAL' : 'TASKFLOW_DRY_RUN_READY';
  const result = {
    decision,
    sourcePublicExecution: 'NO_GO',
    taskFlowRuntime: 'DRY_RUN_ONLY',
    runtimeAutomationEnabled: false,
    mode,
    blockers,
    flowDraft: hasBlockingErrors ? null : buildFlowDraft(input, mode),
    safety: {
      noDeploy: true,
      noRestart: true,
      noLiveCanary: true,
      noProviderSend: true,
      noDbMutation: true,
      noTerminalAckReplay: true,
      noReleaseTag: true,
      noSecretMovement: true,
      approvalIsNotInferred: true,
    },
  };

  const serialized = values.format === 'markdown' ? outputMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`;
  if (hasBlockingErrors) {
    process.stderr.write(serialized);
    process.exit(1);
  }
  process.stdout.write(serialized);
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ decision: 'NO_GO', sourcePublicExecution: 'NO_GO', error: error.message }, null, 2));
  process.exit(1);
}
