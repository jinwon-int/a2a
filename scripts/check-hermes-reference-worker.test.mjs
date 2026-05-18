import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scriptPath = 'examples/workers/hermes-reference-worker/a2a_worker.py';
const fixturePath = 'examples/workers/hermes-reference-worker/hermes-local-smoke-task.json';

test('Hermes reference worker remains local-dry-run first', () => {
  const script = readFileSync(scriptPath, 'utf8');
  assert.match(script, /SAFE_LOCAL_MODES = \{"hermes-reference-dry-run", "local-hermes-smoke"\}/);
  assert.match(script, /refusing non-loopback broker URL/);
  assert.match(script, /A2A_HERMES_REFERENCE_ALLOW_NON_LOOPBACK/);
  assert.doesNotMatch(script, /api\.telegram\.org|terminal[-_ ]?outbox|provider send/i);
  assert.doesNotMatch(script, /requests\.post|requests\.get/);
});

test('Hermes local smoke task is assigned to the reference worker and no-live', () => {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  assert.equal(fixture.id, 'hermes-local-smoke-1');
  assert.equal(fixture.assignedWorkerId, 'hermes-agent-reference-worker');
  assert.equal(fixture.targetNodeId, 'hermes-agent-reference-worker');
  assert.equal(fixture.payload.mode, 'hermes-reference-dry-run');
  assert.equal(fixture.payload.noLive, true);
  assert.equal(fixture.policyContext.liveImpact, false);
});
