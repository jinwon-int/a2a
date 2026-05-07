import assert from "node:assert/strict";
import test from "node:test";
import {
  createInProcessWakeQueueAdapter,
  createRuntimeUnavailableWakeAdapter,
} from "../dist/src/runtime-wake-adapter.js";

test("in-process wake adapter queues first wake and coalesces by active target session", async () => {
  let tick = 1_000;
  const adapter = createInProcessWakeQueueAdapter({
    now: () => tick,
    randomId: () => "abc123",
  });

  const first = await adapter.wake({
    taskId: "task-1",
    targetSessionKey: "agent:main:telegram:direct:1234",
    message: "first",
    createdAt: 900,
  });
  assert.equal(first.status, "queued");
  assert.equal(first.wakeId, "wake:abc123");
  assert.deepEqual(first.coalescedTaskIds, []);

  tick = 1_100;
  const second = await adapter.wake({
    taskId: "task-2",
    targetSessionKey: "agent:main:telegram:direct:1234",
    message: "second",
  });
  assert.equal(second.status, "coalesced");
  assert.equal(second.wakeId, "wake:abc123");
  assert.deepEqual(second.coalescedTaskIds, ["task-1"]);

  assert.deepEqual(adapter.entries(), [
    {
      wakeId: "wake:abc123",
      targetSessionKey: "agent:main:telegram:direct:1234",
      taskIds: ["task-1", "task-2"],
      message: "second",
      createdAt: 900,
      updatedAt: 1_100,
    },
  ]);
});

test("in-process wake adapter keeps duplicate accepted-task wakes bounded and clearable", async () => {
  let tick = 2_000;
  const adapter = createInProcessWakeQueueAdapter({
    now: () => tick,
    randomId: () => "dup",
    maxTaskIdsPerEntry: 2,
  });

  await adapter.wake({
    taskId: "task-1",
    targetSessionKey: "agent:main:low-resource",
    message: "first",
  });
  tick = 2_100;
  const duplicate = await adapter.wake({
    taskId: "task-1",
    targetSessionKey: "agent:main:low-resource",
    message: "duplicate should update, not append",
  });
  assert.equal(duplicate.status, "coalesced");
  assert.deepEqual(adapter.entries()[0].taskIds, ["task-1"]);
  assert.equal(adapter.entries()[0].message, "duplicate should update, not append");

  await adapter.wake({
    taskId: "task-2",
    targetSessionKey: "agent:main:low-resource",
    message: "second",
  });
  const overflow = await adapter.wake({
    taskId: "task-3",
    targetSessionKey: "agent:main:low-resource",
    message: "third should be rejected visibly",
  });
  assert.equal(overflow.visibleFailure?.visible, true);
  assert.equal(overflow.visibleFailure?.reason, "adapter_error");
  assert.match(overflow.visibleFailure?.message ?? "", /coalescing limit/);
  assert.deepEqual(adapter.entries()[0].taskIds, ["task-1", "task-2"]);

  assert.equal(adapter.clear("agent:main:low-resource"), 1);
  assert.deepEqual(adapter.entries(), []);
});

test("in-process wake adapter reports capacity pressure without dropping existing queue entries", async () => {
  const adapter = createInProcessWakeQueueAdapter({
    now: () => 3_000,
    randomId: () => "cap",
    maxQueueEntries: 1,
  });

  await adapter.wake({
    taskId: "task-1",
    targetSessionKey: "agent:main:first",
    message: "first",
  });
  const rejected = await adapter.wake({
    taskId: "task-2",
    targetSessionKey: "agent:main:second",
    message: "second",
  });

  assert.equal(rejected.visibleFailure?.visible, true);
  assert.equal(rejected.visibleFailure?.reason, "adapter_error");
  assert.match(rejected.visibleFailure?.message ?? "", /capacity reached/);
  assert.deepEqual(
    adapter.entries().map((entry) => entry.targetSessionKey),
    ["agent:main:first"],
  );
  assert.equal(adapter.clear(), 1);
  assert.deepEqual(adapter.entries(), []);
});

test("in-process wake adapter records visible invalid-request failures", async () => {
  const adapter = createInProcessWakeQueueAdapter({ now: () => 42 });

  const result = await adapter.wake({
    taskId: "",
    targetSessionKey: "agent:main:missing-message",
    message: "",
  });

  assert.equal(result.visibleFailure?.visible, true);
  assert.equal(result.visibleFailure?.reason, "invalid_request");
  assert.deepEqual(adapter.failures(), [
    {
      status: "failed",
      taskId: "unknown",
      targetSessionKey: "agent:main:missing-message",
      reason: "invalid_request",
      message: "Wake request requires taskId, targetSessionKey, and message",
      visible: true,
      timestamp: 42,
    },
  ]);
});

test("runtime-unavailable adapter records visible wake failure", async () => {
  const adapter = createRuntimeUnavailableWakeAdapter({ now: () => 7 });

  const result = await adapter.wake({
    taskId: "task-unavailable",
    targetSessionKey: "agent:main:target",
    message: "wake now",
  });

  assert.equal(result.status, "queued");
  assert.equal(result.visibleFailure?.reason, "runtime_unavailable");
  assert.deepEqual(adapter.failures(), [
    {
      status: "failed",
      taskId: "task-unavailable",
      targetSessionKey: "agent:main:target",
      reason: "runtime_unavailable",
      message: "Wake runtime unavailable for agent:main:target",
      visible: true,
      timestamp: 7,
    },
  ]);
});
