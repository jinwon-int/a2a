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

const { lifecycle, workers, cancellation, evidence, crossBroker } = fixtures;

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

const examplePath = path.join(root, 'examples', 'compatibility', 'cross-team-conformance.json');
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
assert.equal(example.brokerOfRecord, 'gwakga');
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

console.log(JSON.stringify({
  ok: true,
  checkedFixtures: Object.values(fixtureFiles).map((file) => `fixtures/contract/${file}`),
  compatibilityExample: 'examples/compatibility/cross-team-conformance.json',
}));
