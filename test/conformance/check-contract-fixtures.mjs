import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const fixtureDir = path.join(root, 'fixtures', 'contract');

const fixtureFiles = {
  lifecycle: 'task-lifecycle.json',
  workers: 'worker-registration-capabilities.json',
  cancellation: 'cancellation-idempotency.json',
  evidence: 'terminal-evidence.json',
  crossBroker: 'gwakga-cross-broker-handoff.json',
  checkpointInterrupt: 'checkpoint-interrupt.json',
  publicPolicy: 'public-compatibility-policy.json',
  replayTrace: 'second-worker-replay-trace.json',
  liveCanaryApprovalBoundary: 'live-canary-replay-approval-boundary.json',
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

const secretLikePatterns = [
  /ghp_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]+/,
  /xox[baprs]-[A-Za-z0-9-]+/,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\/home\/[A-Za-z0-9._-]+\//,
  /\/Users\/[A-Za-z0-9._-]+\//,
];

function readFixture(fileName) {
  const fullPath = path.join(fixtureDir, fileName);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function walk(value, visit, trail = []) {
  visit(value, trail);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...trail, index]));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      walk(item, visit, [...trail, key]);
    }
  }
}

const fixtures = Object.fromEntries(
  Object.entries(fixtureFiles).map(([name, file]) => [name, readFixture(file)]),
);
const allFixtureText = Object.values(fixtureFiles)
  .map((file) => fs.readFileSync(path.join(fixtureDir, file), 'utf8'))
  .join('\n');

for (const forbiddenPath of forbiddenRuntimePaths) {
  assert.ok(
    !allFixtureText.includes(forbiddenPath),
    `fixture text must not reference OpenClaw runtime/bootstrap path ${forbiddenPath}`,
  );
}
for (const pattern of secretLikePatterns) {
  assert.ok(!pattern.test(allFixtureText), `fixture text matched forbidden pattern ${pattern}`);
}

const {
  lifecycle,
  workers,
  cancellation,
  evidence,
  crossBroker,
  checkpointInterrupt,
  publicPolicy,
  replayTrace,
  liveCanaryApprovalBoundary,
} = fixtures;

assert.deepEqual(lifecycle.terminalStates.sort(), ['blocked', 'cancelled', 'done', 'pr']);
for (const state of lifecycle.terminalStates) {
  assert.deepEqual(lifecycle.allowedTransitions[state], [], `${state} must be terminal`);
}
for (const event of lifecycle.events) {
  assert.ok(lifecycle.states.includes(event.state), `unknown lifecycle state ${event.state}`);
  if (event.from) {
    assert.ok(
      lifecycle.allowedTransitions[event.from]?.includes(event.state),
      `transition ${event.from} -> ${event.state} is not allowed`,
    );
  }
}
assert.equal(lifecycle.task.brokerOfRecord, 'gwakga');
assert.ok(lifecycle.events.some((event) => event.state === 'pr' && event.evidenceRef === 'terminal-pr-evidence'));

// Contract v0: cancellation states must not be terminal (cancelling) and terminal (cancelled)
assert.ok(lifecycle.states.includes('cancelling'), 'cancelling must be in states');
assert.ok(lifecycle.states.includes('cancelled'), 'cancelled must be in states');
assert.ok(!lifecycle.terminalStates.includes('cancelling'), 'cancelling must not be terminal');
assert.ok(lifecycle.terminalStates.includes('cancelled'), 'cancelled must be terminal');

// Cancellation transitions
assert.deepEqual(lifecycle.allowedTransitions.queued.sort(), ['blocked', 'cancelled', 'claimed']);
assert.deepEqual(lifecycle.allowedTransitions.claimed.sort(), ['blocked', 'cancelled', 'running']);
assert.ok(lifecycle.allowedTransitions.running.includes('cancelling'), 'running must allow cancelling');
assert.deepEqual(lifecycle.allowedTransitions.cancelling, ['cancelled']);
assert.deepEqual(lifecycle.allowedTransitions.cancelled, []);

// Cancellation event trace
assert.ok(Array.isArray(lifecycle.cancellationEvents) && lifecycle.cancellationEvents.length >= 2);
const cancelEvents = lifecycle.cancellationEvents;
assert.equal(cancelEvents[0].state, 'queued');
assert.equal(cancelEvents[1].type, 'task.cancel-requested');
assert.equal(cancelEvents[1].from, 'queued');
assert.equal(cancelEvents[1].state, 'cancelled');
assert.equal(cancelEvents[1].source, 'operator');

// All fixtures must carry v0Freeze markers
for (const [name, fixture] of Object.entries(fixtures)) {
  assert.ok(fixture.v0Freeze, `${name} fixture must carry v0Freeze marker`);
  assert.ok(fixture.v0Freeze.frozenAt, `${name} v0Freeze must include frozenAt`);
  assert.ok(fixture.v0Freeze.round, `${name} v0Freeze must include round`);
}

// v0 assertions include cancellation semantics
const v0Assertions = new Set(lifecycle.assertions);
assert.ok(v0Assertions.has('cancelling is a non-terminal transitory state; only cancelled is terminal'));
assert.ok(v0Assertions.has('cancellation from queued or claimed goes directly to cancelled (no cancelling intermediary)'));
assert.ok(v0Assertions.has('all terminal states (done, pr, blocked, cancelled) have empty allowedTransitions'));

const workerNamePattern = /^[a-z0-9][a-z0-9-]{2,63}$/;
for (const worker of workers.workers) {
  assert.match(worker.workerName, workerNamePattern, `unsafe workerName ${worker.workerName}`);
  assert.ok(Array.isArray(worker.capabilities) && worker.capabilities.length > 0);
  for (const capability of worker.capabilities) {
    assert.match(capability, /^[a-z0-9][a-z0-9-]{1,40}$/);
  }
  assert.equal(worker.policyVersion, 'a2a-plane-safety-v1');
  for (const forbiddenField of workers.forbiddenFields) {
    assert.ok(!(forbiddenField in worker), `worker must not include ${forbiddenField}`);
  }
}
assert.equal(workers.readModelExpectations.providerSendIsNotTerminalEvidence, true);
assert.equal(workers.readModelExpectations.secondWorkerProofIsPublicSafe, true);
assert.equal(workers.readModelExpectations.secondReferenceReplayProofIsPublicSafe, true);

const workerNames = new Set(workers.workers.map((worker) => worker.workerName));
const secondWorkerProof = workers.compatibilityProofs?.find(
  (proof) => proof.proofId === 'second-worker-compatibility-jingun-20260510',
);
assert.ok(secondWorkerProof, 'expected jingun second-worker compatibility proof');
assert.equal(secondWorkerProof.issue, 'https://github.com/jinwon-int/a2a-plane/issues/152');
assert.equal(secondWorkerProof.round, 'a2a-vnext-contract-smoke-crossbroker-20260510');
assert.equal(secondWorkerProof.brokerOfRecord, 'gwakga');
assert.ok(workerNames.has(secondWorkerProof.workerName), 'second-worker proof must reference a registered worker');
assert.equal(secondWorkerProof.validationCommand, 'node test/conformance/check-contract-fixtures.mjs');
assert.equal(secondWorkerProof.requiresPrivateTopology, false);
assert.equal(secondWorkerProof.liveProviderSend, false);
assert.equal(secondWorkerProof.terminalAckMutation, false);

const soonwookReplayProof = workers.compatibilityProofs?.find(
  (proof) => proof.proofId === 'second-worker-replay-trace-soonwook-20260509',
);
assert.ok(soonwookReplayProof, 'expected soonwook second-reference replay proof');
assert.equal(soonwookReplayProof.issue, 'https://github.com/jinwon-int/a2a-plane/issues/168');
assert.equal(soonwookReplayProof.parentIssue, 'https://github.com/jinwon-int/a2a-plane/issues/163');
assert.equal(soonwookReplayProof.run, 'a2a-public-readiness-next-20260509T165108Z');
assert.equal(soonwookReplayProof.brokerOfRecord, 'gwakga');
assert.ok(workerNames.has(soonwookReplayProof.workerName), 'replay proof must reference a registered worker');
assert.equal(soonwookReplayProof.validationCommand, 'node test/conformance/check-contract-fixtures.mjs');
assert.equal(soonwookReplayProof.requiresPrivateTopology, false);
assert.equal(soonwookReplayProof.liveProviderSend, false);
assert.equal(soonwookReplayProof.terminalAckMutation, false);

const scenarioByName = new Map(cancellation.scenarios.map((scenario) => [scenario.name, scenario]));
assert.equal(scenarioByName.get('duplicate-create-returns-existing-task')?.then.newTaskCreated, false);
assert.equal(scenarioByName.get('duplicate-create-returns-existing-task')?.then.status, 'deduplicated');
assert.equal(scenarioByName.get('same-key-different-envelope-conflicts')?.then.status, 'conflict');
assert.equal(scenarioByName.get('cancel-before-running-blocks-task')?.then.state, 'blocked');
assert.equal(scenarioByName.get('cancel-before-running-blocks-task')?.then.terminal, true);
assert.equal(scenarioByName.get('cancel-after-terminal-is-idempotent-noop')?.then.changed, false);
assert.equal(scenarioByName.get('cancel-after-terminal-is-idempotent-noop')?.then.state, 'pr');

const evidenceKinds = new Set(evidence.evidence.map((item) => item.kind));
assert.deepEqual([...evidenceKinds].sort(), ['blocked', 'done', 'pr']);
for (const item of evidence.evidence) {
  assert.equal(item.redacted, true, `${item.evidenceId} must be redacted`);
  assert.equal(item.terminalOutboxAckMutated, false, `${item.evidenceId} must not mutate terminal ACK`);
  assert.equal(item.liveProviderSend, false, `${item.evidenceId} must not require live provider send`);
}
for (const [key, value] of Object.entries(evidence.safetyConfirmations)) {
  assert.equal(value, true, `safety confirmation ${key} must be true`);
}

assert.equal(crossBroker.contract, 'contracts/a2a/broker-handoff-protocol.md');
assert.equal(crossBroker.round, 'a2a-vnext-contract-smoke-crossbroker-20260510');
assert.equal(crossBroker.team, 'team2');
assert.equal(crossBroker.worker, 'dungae');
assert.equal(crossBroker.sourceBrokerId, 'seoseo');
assert.equal(crossBroker.destinationBrokerId, 'gwakga');
assert.equal(crossBroker.brokerOfRecord, 'gwakga');
assert.equal(crossBroker.handoffEnvelope.brokerOfRecord, 'gwakga');
assert.equal(crossBroker.handoffEnvelope.destinationBrokerId, 'gwakga');
assert.equal(crossBroker.policyInvariants.sourceBrokerDoesNotDispatchDestinationWorkers, true);
assert.equal(crossBroker.policyInvariants.destinationBrokerOwnsWorkerAssignment, true);
assert.equal(crossBroker.policyInvariants.providerSendIsAcceptedSendOnly, true);

const crossBrokerScenarioByName = new Map(
  crossBroker.scenarios.map((scenario) => [scenario.name, scenario]),
);
const acceptedHandoff = crossBrokerScenarioByName.get('gwakga-accepts-handoff-and-assigns-team2-worker');
assert.equal(acceptedHandoff?.then.state, 'accepted');
assert.equal(acceptedHandoff?.then.brokerOfRecord, 'gwakga');
assert.equal(acceptedHandoff?.then.workerPool, 'team2');
assert.equal(acceptedHandoff?.then.assignedByBroker, 'gwakga');
assert.equal(acceptedHandoff?.then.sourceBrokerDispatchedWorker, false);
assert.equal(acceptedHandoff?.then.terminalOutboxAckMutated, false);
assert.equal(acceptedHandoff?.then.liveProviderSend, false);

const duplicateHandoff = crossBrokerScenarioByName.get('duplicate-handoff-returns-existing-gwakga-task');
assert.equal(duplicateHandoff?.then.status, 'deduplicated');
assert.equal(duplicateHandoff?.then.newTaskCreated, false);
assert.equal(duplicateHandoff?.then.brokerOfRecord, 'gwakga');

const refusedHandoff = crossBrokerScenarioByName.get('missing-create-scope-refuses-before-task-creation');
assert.equal(refusedHandoff?.then.status, 'refused');
assert.equal(refusedHandoff?.then.destinationTaskCreated, false);
assert.equal(refusedHandoff?.then.workerDispatched, false);

const evidenceRelay = crossBrokerScenarioByName.get('terminal-evidence-relay-is-redacted-metadata-only');
assert.equal(evidenceRelay?.given.terminalEvidence.redacted, true);
assert.equal(evidenceRelay?.then.evidenceRelayed, true);
assert.equal(evidenceRelay?.then.providerSendEvidenceClass, 'accepted-send');
assert.equal(evidenceRelay?.then.terminalAckMayBeRecorded, false);
assert.equal(evidenceRelay?.then.terminalOutboxAckMutated, false);
assert.equal(evidenceRelay?.then.liveProviderSend, false);

assert.ok(
  crossBroker.noLiveFixtureCommands.includes('node test/conformance/check-contract-fixtures.mjs'),
);
assert.ok(crossBroker.visibilityGaps.length >= 1);
for (const [key, value] of Object.entries(crossBroker.safetyConfirmations)) {
  assert.equal(value, true, `cross-broker safety confirmation ${key} must be true`);
}


assert.equal(publicPolicy.sourceIssueUrl, 'https://github.com/jinwon-int/a2a-plane/issues/94');
assert.equal(publicPolicy.reviewIssueUrl, 'https://github.com/jinwon-int/a2a-plane/issues/166');
assert.equal(publicPolicy.round, 'a2a-public-readiness-next-20260509T165108Z');
assert.equal(publicPolicy.policyInvariants.referenceIntegrationIsNotExclusive, true);
assert.equal(publicPolicy.policyInvariants.sourceBrokerIdsAreExamplesNotRequirements, true);
assert.equal(publicPolicy.policyInvariants.compatibilityEvidenceUsesPublicContractsOnly, true);
assert.equal(publicPolicy.policyInvariants.providerSendIsAcceptedSendOnly, true);
assert.ok(
  publicPolicy.requiredPublicEvidence.includes('contracts/compatibility/matrix.md'),
  'issue #94 public follow-up proof must reference the compatibility matrix',
);
assert.ok(
  publicPolicy.requiredPublicEvidence.includes('fixtures/contract/gwakga-cross-broker-handoff.json'),
  'issue #94 public follow-up proof must reference Gwakga-owned handoff evidence',
);
const portableBrokerIds = new Set(
  publicPolicy.portableBrokerExamples.map((example) => example.brokerId),
);
assert.ok(portableBrokerIds.has('gwakga'), 'policy proof must include a non-Seoseo broker example');
assert.ok(
  portableBrokerIds.has('generic-public-broker'),
  'policy proof must include a generic public broker example',
);
assert.ok(
  publicPolicy.forbiddenAssumptions.includes('requires-seoseo-as-broker-of-record'),
  'policy proof must forbid Seoseo-only broker-of-record assumptions',
);
assert.ok(
  publicPolicy.forbiddenAssumptions.includes('requires-provider-message-id-as-terminal-ack'),
  'policy proof must forbid provider message ids as terminal ACK evidence',
);
assert.ok(
  publicPolicy.validationCommands.includes('node test/conformance/check-contract-fixtures.mjs'),
);
for (const [key, value] of Object.entries(publicPolicy.safetyConfirmations)) {
  assert.equal(value, true, `public compatibility policy safety confirmation ${key} must be true`);
}

assert.equal(replayTrace.childIssue, 'https://github.com/jinwon-int/a2a-plane/issues/168');
assert.equal(replayTrace.parentIssue, 'https://github.com/jinwon-int/a2a-plane/issues/163');
assert.equal(replayTrace.brokerOfRecord, 'gwakga');
assert.ok(workerNames.has(replayTrace.workerName), 'replay fixture must reference a registered worker');
assert.equal(replayTrace.replayProof.totals.terminalResultsCreated, 1);
assert.equal(replayTrace.replayProof.totals.providerSendsProduced, 0);
assert.equal(replayTrace.replayProof.totals.terminalOutboxAcksProduced, 0);
assert.equal(replayTrace.replayProof.totals.duplicateSendsProduced, 0);
assert.equal(replayTrace.replayProof.totals.duplicateAcksProduced, 0);
assert.equal(replayTrace.replayProof.attempts.length, 2);
assert.equal(replayTrace.replayProof.attempts[0].terminalResultCreated, true);
for (const attempt of replayTrace.replayProof.attempts) {
  assert.equal(attempt.providerSendProduced, false, `attempt ${attempt.attempt} must not produce provider send`);
  assert.equal(attempt.terminalOutboxAckProduced, false, `attempt ${attempt.attempt} must not produce terminal ACK`);
}
assert.equal(replayTrace.replayProof.attempts[1].decision, 'suppress-duplicate-return-existing-result');
assert.equal(replayTrace.replayProof.attempts[1].terminalResultCreated, false);
assert.equal(replayTrace.replayProof.attempts[1].returnedExistingTerminalResult, true);
assert.equal(replayTrace.tracePolicy.status, 'compact-redacted-sufficient');
assert.ok(replayTrace.tracePolicy.sampleTrace.length <= replayTrace.tracePolicy.maxEvents);
for (const traceEvent of replayTrace.tracePolicy.sampleTrace) {
  assert.ok(
    Object.keys(traceEvent).length <= replayTrace.tracePolicy.maxEventKeys,
    'trace event must stay compact',
  );
  for (const forbiddenField of replayTrace.tracePolicy.forbiddenFields) {
    assert.ok(!(forbiddenField in traceEvent), `trace event must not include ${forbiddenField}`);
  }
  assert.equal(traceEvent.safetyFlags.liveProviderSend ?? false, false);
  assert.equal(traceEvent.safetyFlags.terminalOutboxAckMutation ?? false, false);
}
assert.equal(replayTrace.safetyConfirmations.requiresPrivateTopology, false);
for (const [key, value] of Object.entries(replayTrace.safetyConfirmations)) {
  if (key === 'requiresPrivateTopology') continue;
  assert.equal(value, true, `replay trace safety confirmation ${key} must be true`);
}

assert.equal(liveCanaryApprovalBoundary.parentIssue, 'https://github.com/jinwon-int/a2a-plane/issues/174');
assert.equal(liveCanaryApprovalBoundary.childIssue, 'https://github.com/jinwon-int/a2a-plane/issues/177');
assert.equal(liveCanaryApprovalBoundary.v0Freeze.round, 'a2a-live-canary-readiness-20260509T173917Z');
assert.equal(liveCanaryApprovalBoundary.brokerOfRecord, 'gwakga');
assert.ok(workerNames.has(liveCanaryApprovalBoundary.workerName), 'live-canary proof must reference a registered worker');
assert.equal(liveCanaryApprovalBoundary.canaryMode, 'no-live-redacted-replay');
assert.equal(liveCanaryApprovalBoundary.replayNoDuplicateProof.totals.terminalResultsCreated, 1);
assert.equal(liveCanaryApprovalBoundary.replayNoDuplicateProof.totals.liveProviderSendsProduced, 0);
assert.equal(liveCanaryApprovalBoundary.replayNoDuplicateProof.totals.terminalOutboxAckMutations, 0);
assert.equal(liveCanaryApprovalBoundary.replayNoDuplicateProof.totals.duplicateProviderSendsProduced, 0);
assert.equal(liveCanaryApprovalBoundary.replayNoDuplicateProof.totals.duplicateTerminalAckMutations, 0);
assert.equal(liveCanaryApprovalBoundary.replayNoDuplicateProof.attempts.length, 2);
assert.equal(liveCanaryApprovalBoundary.replayNoDuplicateProof.attempts[1].decision, 'suppress-duplicate-return-existing-result');
assert.equal(liveCanaryApprovalBoundary.replayNoDuplicateProof.attempts[1].returnedExistingTerminalResult, true);
for (const attempt of liveCanaryApprovalBoundary.replayNoDuplicateProof.attempts) {
  assert.equal(attempt.liveProviderSendProduced, false, `live-canary attempt ${attempt.attempt} must not produce live sends`);
  assert.equal(attempt.terminalOutboxAckMutated, false, `live-canary attempt ${attempt.attempt} must not mutate terminal outbox ACKs`);
}
assert.equal(liveCanaryApprovalBoundary.scannerApprovalBoundary.scannerSuccessImpliesOperatorApproval, false);
assert.equal(liveCanaryApprovalBoundary.scannerApprovalBoundary.explicitOperatorApprovalPresent, false);
assert.equal(liveCanaryApprovalBoundary.scannerApprovalBoundary.operatorApprovalRequiredForVisibility, true);
assert.equal(liveCanaryApprovalBoundary.scannerApprovalBoundary.approvalEvidenceMustBeSeparate, true);
assert.equal(liveCanaryApprovalBoundary.scannerApprovalBoundary.aggregateDecision, 'NO-GO/Waiting');
const liveCanaryBlockers = new Set(liveCanaryApprovalBoundary.remainingLiveCanaryBlockers.map((blocker) => blocker.gate));
assert.deepEqual(
  [...liveCanaryBlockers].sort(),
  ['externalScannerEvidence', 'operatorApproval', 'terminalEvidence'],
  'remaining live-canary blockers must stay explicit',
);
assert.ok(liveCanaryApprovalBoundary.validationCommands.includes('node test/conformance/check-contract-fixtures.mjs'));
assert.ok(liveCanaryApprovalBoundary.validationCommands.includes('npm run scan:readiness-gates'));
assert.equal(liveCanaryApprovalBoundary.safetyConfirmations.requiresPrivateTopology, false);
for (const [key, value] of Object.entries(liveCanaryApprovalBoundary.safetyConfirmations)) {
  if (key === 'requiresPrivateTopology') continue;
  assert.equal(value, true, `live-canary safety confirmation ${key} must be true`);
}

const examplePath = path.join(root, 'examples', 'compatibility', 'cross-team-conformance.json');
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
assert.equal(example.brokerOfRecord, 'gwakga');
assert.equal(example.publicFollowupIssue, 'https://github.com/jinwon-int/a2a-plane/issues/94');
assert.equal(example.independentReviewIssue, 'https://github.com/jinwon-int/a2a-plane/issues/166');
assert.ok(!example.fixtures.some((fixture) => fixture.startsWith('examples/local/')));
for (const fixture of Object.values(fixtureFiles).map((file) => `fixtures/contract/${file}`)) {
  assert.ok(example.fixtures.includes(fixture), `compatibility example must reference ${fixture}`);
}

walk({ fixtures, example }, (value, trail) => {
  if (typeof value !== 'string') return;
  assert.ok(
    !value.includes('raw session') || trail.join('.') === 'example.intentionallyExcluded.3',
    `raw-session wording must only be listed as excluded at ${trail.join('.')}`,
  );
  assert.ok(
    !value.includes('terminal ACK mutation') || trail.join('.') === 'example.intentionallyExcluded.2',
    `terminal ACK mutation must only be listed as excluded at ${trail.join('.')}`,
  );
});

// --- Checkpoint & Human-Interrupt fixture validation ---

// v0Freeze marker
assert.ok(checkpointInterrupt.v0Freeze, 'checkpoint-interrupt fixture must carry v0Freeze marker');
assert.ok(checkpointInterrupt.v0Freeze.frozenAt, 'checkpoint-interrupt v0Freeze must include frozenAt');
assert.equal(
  checkpointInterrupt.v0Freeze.round,
  'a2a-public-readiness-next-20260509T165108Z',
  'checkpoint-interrupt round must match',
);
assert.equal(checkpointInterrupt.contract, 'contracts/a2a/checkpoint-interrupt.md');

// Checkpoint states are non-terminal transitory states
assert.ok(checkpointInterrupt.checkpointStates.paused, 'paused state must be defined');
assert.ok(checkpointInterrupt.checkpointStates.awaiting_operator, 'awaiting_operator state must be defined');
assert.equal(checkpointInterrupt.checkpointStates.paused.terminal, false);
assert.equal(checkpointInterrupt.checkpointStates.awaiting_operator.terminal, false);
assert.deepEqual(
  checkpointInterrupt.checkpointStates.paused.allowedTransitions.sort(),
  ['blocked', 'cancelled', 'running'],
);
assert.deepEqual(
  checkpointInterrupt.checkpointStates.awaiting_operator.allowedTransitions.sort(),
  ['blocked', 'cancelled', 'running'],
);

// Interrupt decision types
const interruptTypes = new Set(checkpointInterrupt.interruptDecisionTypes.map((d) => d.type));
assert.deepEqual(
  [...interruptTypes].sort(),
  ['ambiguous_scope', 'approval_required', 'conflict_detected', 'safety_gate'],
);
for (const dt of checkpointInterrupt.interruptDecisionTypes) {
  assert.ok(Array.isArray(dt.validOperatorActions) && dt.validOperatorActions.length >= 2);
  assert.ok(dt.validOperatorActions.includes('approved'));
  assert.ok(dt.validOperatorActions.includes('refused'));
}

// Scenario coverage: all decision types must have at least one scenario
const scenarioDecisionTypes = new Set(
  checkpointInterrupt.scenarios
    .filter((s) => s.when?.decisionType || s.given?.decisionType)
    .map((s) => s.when?.decisionType || s.given?.decisionType),
);
for (const dt of interruptTypes) {
  assert.ok(scenarioDecisionTypes.has(dt), `interrupt decision type ${dt} must have at least one scenario`);
}

// Each scenario
const ckScenarioByName = new Map(checkpointInterrupt.scenarios.map((s) => [s.name, s]));

// Worker checkpoint scenario
const checkpointScenario = ckScenarioByName.get('worker-checkpoints-during-safe-file-operation');
assert.ok(checkpointScenario, 'checkpoint scenario must exist');
assert.equal(checkpointScenario.then.state, 'paused');
assert.equal(checkpointScenario.then.terminal, false);
assert.equal(checkpointScenario.then.workerAssigned, false);
assert.equal(checkpointScenario.then.terminalOutboxAckMutated, false);
assert.equal(checkpointScenario.then.liveProviderSend, false);
assert.ok(checkpointScenario.given.completedOperations.includes('write-file'));
assert.ok(checkpointScenario.when.artifactRefs.length > 0);

// Resume scenario
const resumeScenario = ckScenarioByName.get('worker-resumes-from-checkpoint');
assert.ok(resumeScenario, 'resume scenario must exist');
assert.equal(resumeScenario.then.state, 'running');
assert.equal(resumeScenario.then.terminal, false);
assert.equal(resumeScenario.then.checkpointContextProvided, true);
assert.equal(resumeScenario.then.preCheckpointOperationsNotReplayed, true);
assert.equal(resumeScenario.then.terminalOutboxAckMutated, false);
assert.equal(resumeScenario.then.liveProviderSend, false);

// Pause timeout → cancelled
const pauseTimeoutScenario = ckScenarioByName.get('pause-timeout-transitions-to-cancelled');
assert.ok(pauseTimeoutScenario, 'pause timeout scenario must exist');
assert.equal(pauseTimeoutScenario.then.state, 'cancelled');
assert.equal(pauseTimeoutScenario.then.terminal, true);
assert.equal(pauseTimeoutScenario.then.cancelSource, 'timeout');
assert.equal(pauseTimeoutScenario.then.terminalOutboxAckMutated, false);
assert.equal(pauseTimeoutScenario.then.liveProviderSend, false);

// Human interrupt: safety gate approved
const safetyGateScenario = ckScenarioByName.get('human-interrupt-safety-gate-approved');
assert.ok(safetyGateScenario, 'safety gate interrupt scenario must exist');
assert.equal(safetyGateScenario.thenInterrupt.state, 'awaiting_operator');
assert.equal(safetyGateScenario.thenInterrupt.decisionType, 'safety_gate');
assert.equal(safetyGateScenario.thenInterrupt.terminalOutboxAckMutated, false);
assert.equal(safetyGateScenario.thenInterrupt.liveProviderSend, false);
assert.equal(safetyGateScenario.operatorAction.action, 'approved');
assert.equal(safetyGateScenario.thenResume.state, 'running');
assert.equal(safetyGateScenario.thenResume.terminalOutboxAckMutated, false);
assert.equal(safetyGateScenario.thenResume.liveProviderSend, false);

// Human interrupt: ambiguous scope clarified
const ambiguousScenario = ckScenarioByName.get('human-interrupt-ambiguous-scope-clarified');
assert.ok(ambiguousScenario, 'ambiguous scope interrupt scenario must exist');
assert.equal(ambiguousScenario.thenInterrupt.decisionType, 'ambiguous_scope');
assert.equal(ambiguousScenario.operatorAction.action, 'clarified');
assert.equal(ambiguousScenario.thenResume.state, 'running');

// Human interrupt: refused becomes block
const refusedScenario = ckScenarioByName.get('human-interrupt-refused-becomes-block');
assert.ok(refusedScenario, 'refused interrupt scenario must exist');
assert.equal(refusedScenario.operatorAction.action, 'refused');
assert.equal(refusedScenario.then.state, 'blocked');
assert.equal(refusedScenario.then.terminal, true);
assert.equal(refusedScenario.then.blockerCategory, 'safety');
assert.equal(refusedScenario.then.terminalOutboxAckMutated, false);
assert.equal(refusedScenario.then.liveProviderSend, false);

// Interrupt timeout → cancelled
const intTimeoutScenario = ckScenarioByName.get('interrupt-timeout-transitions-to-cancelled');
assert.ok(intTimeoutScenario, 'interrupt timeout scenario must exist');
assert.equal(intTimeoutScenario.then.state, 'cancelled');
assert.equal(intTimeoutScenario.then.terminal, true);
assert.equal(intTimeoutScenario.then.cancelSource, 'timeout');
assert.equal(intTimeoutScenario.then.terminalOutboxAckMutated, false);
assert.equal(intTimeoutScenario.then.liveProviderSend, false);

// Replay: completed task is idempotent noop
const replayDoneScenario = ckScenarioByName.get('replay-completed-task-is-idempotent-noop');
assert.ok(replayDoneScenario, 'replay done scenario must exist');
assert.equal(replayDoneScenario.then.state, 'done');
assert.equal(replayDoneScenario.then.newSideEffects, false);
assert.equal(replayDoneScenario.then.newEvidencePosted, false);
assert.equal(replayDoneScenario.then.terminalOutboxAckMutated, false);
assert.equal(replayDoneScenario.then.liveProviderSend, false);

// Replay: checkpoint resume does not re-execute pre-checkpoint ops
const replayResumeScenario = ckScenarioByName.get('replay-checkpoint-resume-does-not-re-execute-pre-checkpoint-ops');
assert.ok(replayResumeScenario, 'replay resume scenario must exist');
assert.equal(replayResumeScenario.then.completedOperationsReplayed, false);
assert.equal(replayResumeScenario.then.checkpointContextMatches, true);
assert.equal(replayResumeScenario.then.terminalOutboxAckMutated, false);
assert.equal(replayResumeScenario.then.liveProviderSend, false);

// Replay guarantees
const replayGuarantees = checkpointInterrupt.replayGuarantees;
assert.ok(Array.isArray(replayGuarantees) && replayGuarantees.length >= 3);
const guaranteeNames = new Set(replayGuarantees.map((g) => g.guarantee));
assert.ok(guaranteeNames.has('idempotent-operation-replay'));
assert.ok(guaranteeNames.has('checkpoint-resume-replay'));
assert.ok(guaranteeNames.has('terminal-state-immutability'));
assert.ok(guaranteeNames.has('evidence-immutability'));

// Audit trace export
assert.ok(checkpointInterrupt.auditTraceExport, 'audit trace export must be defined');
assert.equal(checkpointInterrupt.auditTraceExport.exportSafety.noSecretsOrPrivatePaths, true);
assert.equal(checkpointInterrupt.auditTraceExport.exportSafety.noProviderMessageIdsAboveAcceptedSend, true);
assert.equal(checkpointInterrupt.auditTraceExport.exportSafety.noTerminalOutboxAckValues, true);
assert.equal(checkpointInterrupt.auditTraceExport.exportSafety.deterministicEventSequence, true);
assert.equal(checkpointInterrupt.auditTraceExport.exportSafety.redacted, true);
assert.equal(checkpointInterrupt.auditTraceExport.schema.redacted, true);
assert.equal(checkpointInterrupt.auditTraceExport.schema.brokerOfRecord, 'gwakga');
assert.ok(
  checkpointInterrupt.auditTraceExport.schema.events.some((e) => e.type === 'task.paused'),
  'audit trace must include pause event',
);
assert.ok(
  checkpointInterrupt.auditTraceExport.schema.events.some((e) => e.type === 'task.interrupted'),
  'audit trace must include interrupt event',
);
assert.ok(
  checkpointInterrupt.auditTraceExport.schema.events.some((e) => e.type === 'operator.decide'),
  'audit trace must include operator decide event',
);

// Artifact version lineage
assert.ok(checkpointInterrupt.artifactVersionLineage, 'artifact version lineage must be defined');
const lineage = checkpointInterrupt.artifactVersionLineage;
assert.equal(lineage.lineageSafety.pathsAreRepoRelative, true);
assert.equal(lineage.lineageSafety.versionRefsAreDeterministic, true);
assert.equal(lineage.lineageSafety.noHostSpecificPaths, true);
assert.equal(lineage.lineageSafety.noArtifactContentInline, true);
assert.equal(lineage.lineageSafety.noProviderCredentials, true);
assert.ok(lineage.example.artifactPath, 'lineage example must have artifactPath');
assert.ok(lineage.example.versionRef, 'lineage example must have versionRef');

// Safety confirmations
for (const [key, value] of Object.entries(checkpointInterrupt.safetyConfirmations)) {
  assert.equal(value, true, `checkpoint-interrupt safety confirmation ${key} must be true`);
}

// Assertions
assert.ok(Array.isArray(checkpointInterrupt.assertions) && checkpointInterrupt.assertions.length >= 8);
const ckAssertionsSet = new Set(checkpointInterrupt.assertions);
assert.ok(
  ckAssertionsSet.has(
    'paused and awaiting_operator are non-terminal transitory states',
  ),
);
assert.ok(
  ckAssertionsSet.has(
    'all scenarios confirm terminalOutboxAckMutated: false and liveProviderSend: false',
  ),
);
assert.ok(
  ckAssertionsSet.has(
    'checkpoint and interrupt contracts do not imply production DB mutation or persistence rollout',
  ),
);

// Every scenario must confirm safety invariants
for (const scenario of checkpointInterrupt.scenarios) {
  walk(scenario, (value, trail) => {
    if (trail.at(-1) === 'terminalOutboxAckMutated') {
      assert.equal(value, false, `scenario ${scenario.name}: terminalOutboxAckMutated must be false at ${trail.join('.')}`);
    }
    if (trail.at(-1) === 'liveProviderSend') {
      assert.equal(value, false, `scenario ${scenario.name}: liveProviderSend must be false at ${trail.join('.')}`);
    }
  });
}

console.log(JSON.stringify({
  ok: true,
  checkedFixtures: Object.values(fixtureFiles).map((file) => `fixtures/contract/${file}`),
  compatibilityExample: 'examples/compatibility/cross-team-conformance.json',
}));
