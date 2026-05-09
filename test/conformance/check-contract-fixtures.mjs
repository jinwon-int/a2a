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

const { lifecycle, workers, cancellation, evidence } = fixtures;

assert.deepEqual(lifecycle.terminalStates.sort(), ['blocked', 'done', 'pr']);
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
