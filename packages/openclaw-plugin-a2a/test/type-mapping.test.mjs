import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isBrokerTimeoutCode,
  mapBrokerErrorToTaskError,
  mapBrokerStatusToDeliveryStatus,
  mapBrokerStatusToExecutionStatus,
  resolveCancelTarget,
} from '../dist/type-mapping.js';

test('type mapping keeps current broker-to-openclaw contract stable', () => {
  assert.equal(mapBrokerStatusToExecutionStatus({ brokerStatus: 'queued' }), 'accepted');
  assert.equal(mapBrokerStatusToExecutionStatus({ brokerStatus: 'claimed' }), 'accepted');
  assert.equal(mapBrokerStatusToExecutionStatus({ brokerStatus: 'running' }), 'running');
  assert.equal(mapBrokerStatusToExecutionStatus({ brokerStatus: 'succeeded' }), 'completed');
  assert.equal(
    mapBrokerStatusToExecutionStatus({ brokerStatus: 'failed', brokerErrorCode: 'timed_out' }),
    'timed_out',
  );
  assert.equal(mapBrokerStatusToExecutionStatus({ brokerStatus: 'failed' }), 'failed');

  assert.equal(mapBrokerStatusToDeliveryStatus('queued'), 'pending');
  assert.equal(mapBrokerStatusToDeliveryStatus('running'), 'pending');
  assert.equal(mapBrokerStatusToDeliveryStatus('succeeded'), 'skipped');
  assert.equal(mapBrokerStatusToDeliveryStatus('canceled'), 'skipped');

  assert.deepEqual(
    mapBrokerErrorToTaskError({ brokerStatus: 'failed', brokerErrorMessage: 'boom' }),
    { code: 'remote_task_failed', message: 'boom' },
  );
  assert.equal(isBrokerTimeoutCode(' timeout '), true);
  assert.equal(isBrokerTimeoutCode('other'), false);
});

test('cancel target resolution prefers explicit payloads but can backfill from session/run ids', () => {
  assert.deepEqual(
    resolveCancelTarget({
      explicit: { kind: 'session_run', sessionKey: 'session-a', runId: 'run-1' },
      targetSessionKey: 'ignored',
      runId: 'ignored',
    }),
    { kind: 'session_run', sessionKey: 'session-a', runId: 'run-1' },
  );

  assert.deepEqual(
    resolveCancelTarget({ targetSessionKey: 'session-b', runId: 'run-2' }),
    { kind: 'session_run', sessionKey: 'session-b', runId: 'run-2' },
  );

  assert.equal(resolveCancelTarget({}), undefined);
});
