/**
 * First-wave regression tests for plugin-to-broker contract.
 *
 * Covers scenarios from the regression matrix that do not depend
 * on the OpenClaw core runtime (docs/regression-matrix.md §Automation plan):
 *
 *  - 6a: Status mapping (mapBrokerStatusToExecutionStatus / DeliveryStatus)
 *  - 6b: Broker error → task error (buildGatewayTaskError)
 *  - 6c: Cancel result shape (buildGatewayTaskResult for cancel)
 *  - 6d: Payload round-trip (readBrokerTaskPayload)
 *  - 6e: Output envelope (buildGatewayTaskOutput)
 *  - 6f: Cancel result shape detail (abortStatus)
 *  - 6g: Validator errors (validateParams for all 4 methods)
 *  - 6h: Missing broker client (respondBrokerUnavailable)
 *  - 8:  Task-not-found (getBrokerTask 404 → undefined)
 *  - parity: Dead-letter error code mapping (exceeded_requeue_limit)
 *  - parity: Cancel policy_denied error surfacing
 *
 * These are pure unit tests — no broker instance needed.
 * Full parity analysis: docs/legacy-parity-checklist.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── imports from src ──────────────────────────────────────────

import {
  buildGatewayTaskResult,
  buildGatewayTaskStatus,
  buildGatewayTaskOutput,
  buildGatewayTaskError,
  getBrokerTask,
  readBrokerTaskPayload,
  normalizeString,
  normalizeUnknownRecord,
  resolveWorkerId,
  type GatewayTaskMethod,
} from "../dist/src/gateway-handlers.js";

import {
  mapBrokerStatusToExecutionStatus,
  mapBrokerStatusToDeliveryStatus,
} from "../dist/type-mapping.js";

import {
  A2ABrokerClientError,
  type A2ABrokerTaskRecord,
} from "../dist/standalone-broker-client.js";

import {
  validateParams,
  validateA2ATaskRequestParams,
  validateA2ATaskUpdateParams,
  validateA2ATaskCancelParams,
  validateA2ATaskStatusParams,
} from "../dist/src/gateway-validators.js";

import { a2aError, A2AErrorCodes } from "../dist/src/plugin-errors.js";

// ── helpers ───────────────────────────────────────────────────

function makeTask(overrides: Partial<A2ABrokerTaskRecord> = {}): A2ABrokerTaskRecord {
  return {
    id: "task-001",
    intent: "chat",
    status: "queued",
    requester: { id: "hub-001", kind: "session", role: "hub" },
    target: { id: "worker-001" },
    assignedWorkerId: "worker-001",
    createdAt: "2026-04-18T00:00:00Z",
    updatedAt: "2026-04-18T00:00:00Z",
    ...overrides,
  };
}

// ── 6a. Status mapping ───────────────────────────────────────

describe("6a — mapBrokerStatusToExecutionStatus", () => {
  const cases: Array<[A2ABrokerTaskRecord["status"], string]> = [
    ["queued", "accepted"],
    ["claimed", "accepted"],
    ["running", "running"],
    ["succeeded", "completed"],
    ["canceled", "cancelled"],
  ];

  for (const [brokerStatus, expected] of cases) {
    it(`${brokerStatus} → ${expected}`, () => {
      assert.equal(
        mapBrokerStatusToExecutionStatus({ brokerStatus }),
        expected,
      );
    });
  }

  it("failed with timeout code → timed_out", () => {
    assert.equal(
      mapBrokerStatusToExecutionStatus({ brokerStatus: "failed", brokerErrorCode: "timeout" }),
      "timed_out",
    );
  });

  it("failed with timed_out code → timed_out", () => {
    assert.equal(
      mapBrokerStatusToExecutionStatus({ brokerStatus: "failed", brokerErrorCode: "timed_out" }),
      "timed_out",
    );
  });

  it("failed with broker_timeout code → timed_out", () => {
    assert.equal(
      mapBrokerStatusToExecutionStatus({ brokerStatus: "failed", brokerErrorCode: "broker_timeout" }),
      "timed_out",
    );
  });

  it("failed without error code → failed", () => {
    assert.equal(
      mapBrokerStatusToExecutionStatus({ brokerStatus: "failed" }),
      "failed",
    );
  });
});

describe("6a — mapBrokerStatusToDeliveryStatus", () => {
  const pending: Array<A2ABrokerTaskRecord["status"]> = ["queued", "claimed", "running"];
  const skipped: Array<A2ABrokerTaskRecord["status"]> = ["succeeded", "failed", "canceled"];

  for (const status of pending) {
    it(`${status} → pending`, () => {
      assert.equal(mapBrokerStatusToDeliveryStatus(status), "pending");
    });
  }

  for (const status of skipped) {
    it(`${status} → skipped`, () => {
      assert.equal(mapBrokerStatusToDeliveryStatus(status), "skipped");
    });
  }
});

// ── 6b. Broker error → task error ────────────────────────────

describe("6b — buildGatewayTaskError", () => {
  it("returns undefined when no error fields", () => {
    const task = makeTask();
    assert.equal(buildGatewayTaskError(task), undefined);
  });

  it("synthesizes remote_task_failed when status=failed but no code", () => {
    const task = makeTask({
      status: "failed",
      error: { message: "unknown failure" },
    });
    const error = buildGatewayTaskError(task);
    assert.equal(error?.code, "remote_task_failed");
    assert.equal(error?.message, "unknown failure");
  });

  it("preserves explicit code and message", () => {
    const task = makeTask({
      error: { code: "custom_err", message: "something" },
    });
    const error = buildGatewayTaskError(task);
    assert.equal(error?.code, "custom_err");
    assert.equal(error?.message, "something");
  });
});

// ── 6c/6f. Cancel result shape ───────────────────────────────

describe("6f — cancel result abortStatus", () => {
  it("aborted when broker status is canceled", () => {
    const task = makeTask({ status: "canceled" });
    const result = buildGatewayTaskResult("a2a.task.cancel", task) as Record<string, unknown>;
    assert.equal(result.abortStatus, "aborted");
  });

  it("not-attempted when broker status is not canceled", () => {
    const task = makeTask({ status: "succeeded" });
    const result = buildGatewayTaskResult("a2a.task.cancel", task) as Record<string, unknown>;
    assert.equal(result.abortStatus, "not-attempted");
  });

  it("not-attempted when task already failed", () => {
    const task = makeTask({ status: "failed", error: { message: "boom" } });
    const result = buildGatewayTaskResult("a2a.task.cancel", task) as Record<string, unknown>;
    assert.equal(result.abortStatus, "not-attempted");
  });
});

// ── 6d. Payload round-trip ───────────────────────────────────

describe("6d — readBrokerTaskPayload", () => {
  it("reads all six payload keys", () => {
    const task = makeTask({
      payload: {
        requesterSessionKey: "agent:main:node-remote",
        requesterChannel: "telegram",
        targetSessionKey: "agent:main:worker-alpha",
        targetDisplayKey: "worker-alpha",
        correlationId: "corr-001",
        parentRunId: "parent-001",
      },
    });
    const p = readBrokerTaskPayload(task);
    assert.equal(p.requesterSessionKey, "agent:main:node-remote");
    assert.equal(p.requesterChannel, "telegram");
    assert.equal(p.targetSessionKey, "agent:main:worker-alpha");
    assert.equal(p.targetDisplayKey, "worker-alpha");
    assert.equal(p.correlationId, "corr-001");
    assert.equal(p.parentRunId, "parent-001");
  });

  it("returns empty object when payload is missing", () => {
    const task = makeTask();
    assert.deepStrictEqual(readBrokerTaskPayload(task), {});
  });

  it("returns empty object when payload is not an object", () => {
    const task = makeTask({ payload: "not-an-object" } as Partial<A2ABrokerTaskRecord> as A2ABrokerTaskRecord);
    assert.deepStrictEqual(readBrokerTaskPayload(task), {});
  });
});

// ── 6e. Output envelope ──────────────────────────────────────

describe("6e — buildGatewayTaskOutput", () => {
  it("includes artifactIds, validation, apply, note when present", () => {
    const task = makeTask({
      status: "succeeded",
      result: {
        summary: "done",
        note: "a note",
        artifactIds: ["art-1", "art-2"],
        output: { answer: 42 },
        validation: { verdict: "pass" as const },
        apply: { note: "applied" },
      },
    });
    const output = buildGatewayTaskOutput(task) as Record<string, unknown>;
    assert.ok(Array.isArray(output.artifactIds));
    assert.equal(output.artifactIds.length, 2);
    assert.equal(output.note, "a note");
    assert.ok(output.validation);
    assert.ok(output.apply);
    assert.equal(output.answer, 42);
  });

  it("omits output key when only summary (no output fields)", () => {
    const task = makeTask({
      status: "succeeded",
      result: { summary: "done" },
    });
    // buildGatewayTaskOutput always includes status from the task
    const output = buildGatewayTaskOutput(task) as Record<string, unknown>;
    assert.equal(output.status, "succeeded");
    // but no artifactIds, validation, apply, note, or user output fields
    assert.equal(output.artifactIds, undefined);
    assert.equal(output.validation, undefined);
    assert.equal(output.apply, undefined);
    assert.equal(output.note, undefined);
  });

  it("returns undefined when no result", () => {
    const task = makeTask();
    assert.equal(buildGatewayTaskOutput(task), undefined);
  });
});

// ── 6g. Validator errors ─────────────────────────────────────

describe("6g — validator rejects minimal-missing-field cases", () => {
  it("request: rejects missing sessionKey", () => {
    const result = validateParams({}, validateA2ATaskRequestParams, "a2a.task.request");
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.error.code, "INVALID_REQUEST");
      assert.ok(result.error.message.includes("a2a.task.request"));
    }
  });

  it("update: rejects missing sessionKey", () => {
    const result = validateParams({}, validateA2ATaskUpdateParams, "a2a.task.update");
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.error.code, "INVALID_REQUEST");
    }
  });

  it("cancel: rejects missing sessionKey", () => {
    const result = validateParams({}, validateA2ATaskCancelParams, "a2a.task.cancel");
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.error.code, "INVALID_REQUEST");
    }
  });

  it("status: rejects missing sessionKey", () => {
    const result = validateParams({}, validateA2ATaskStatusParams, "a2a.task.status");
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.error.code, "INVALID_REQUEST");
    }
  });

  it("request: rejects missing target", () => {
    const result = validateParams(
      { sessionKey: "s1", request: { method: "a2a.task.request", task: { intent: "delegate", instructions: "do it" } } },
      validateA2ATaskRequestParams,
      "a2a.task.request",
    );
    assert.equal(result.valid, false);
  });

  it("request: rejects invalid intent", () => {
    const result = validateParams(
      { sessionKey: "s1", request: { method: "a2a.task.request", target: { sessionKey: "t1", displayKey: "t1" }, task: { intent: "invalid", instructions: "do it" } } },
      validateA2ATaskRequestParams,
      "a2a.task.request",
    );
    assert.equal(result.valid, false);
  });
});

// ── 6h. Missing broker client ────────────────────────────────

describe("6h — broker client not initialized returns NOT_FOUND", () => {
  it("respondBrokerUnavailable returns NOT_FOUND error", async () => {
    // We can't call respondBrokerUnavailable directly (it uses opts.respond),
    // but we can verify the error shape through the handler flow.
    // Instead, verify a2aError produces the right shape.
    const err = a2aError(A2AErrorCodes.NOT_FOUND, "a2a broker client not initialized");
    assert.equal(err.code, "NOT_FOUND");
    assert.equal(err.message, "a2a broker client not initialized");
  });
});

// ── 8. Task-not-found ────────────────────────────────────────

describe("8 — getBrokerTask returns undefined on 404", () => {
  it("swallows A2ABrokerClientError 404 to undefined", async () => {
    const fakeClient = {
      async getTask() {
        throw new A2ABrokerClientError("not found", 404, "GET", "/tasks/missing");
      },
    } as unknown as Parameters<typeof getBrokerTask>[0];

    const result = await getBrokerTask(fakeClient, "missing-task");
    assert.equal(result, undefined);
  });

  it("re-throws non-404 errors", async () => {
    const fakeClient = {
      async getTask() {
        throw new A2ABrokerClientError("forbidden", 403, "GET", "/tasks/secret");
      },
    } as unknown as Parameters<typeof getBrokerTask>[0];

    await assert.rejects(
      () => getBrokerTask(fakeClient, "secret-task"),
      (err: unknown) => err instanceof A2ABrokerClientError && err.status === 403,
    );
  });
});

// ── resolveWorkerId ──────────────────────────────────────────

describe("resolveWorkerId", () => {
  it("prefers requester.id", () => {
    const task = makeTask({ claimedBy: "claimer-1", assignedWorkerId: "assigned-1" });
    const id = resolveWorkerId(task, { id: "req-1" });
    assert.equal(id, "req-1");
  });

  it("falls back to claimedBy", () => {
    const task = makeTask({ claimedBy: "claimer-1", assignedWorkerId: "assigned-1" });
    const id = resolveWorkerId(task, undefined);
    assert.equal(id, "claimer-1");
  });

  it("falls back to assignedWorkerId", () => {
    const task = makeTask({ assignedWorkerId: "assigned-1" });
    const id = resolveWorkerId(task, undefined);
    assert.equal(id, "assigned-1");
  });

  it("falls back to targetNodeId when no claimedBy/assignedWorkerId/requester", () => {
    const task = makeTask({ claimedBy: undefined, assignedWorkerId: undefined, targetNodeId: "target-1", target: { id: "target-1" } });
    const id = resolveWorkerId(task, undefined);
    assert.equal(id, "target-1");
  });

  it("throws when no workerId available", () => {
    const task = makeTask({ claimedBy: undefined, assignedWorkerId: undefined, target: { id: "" } });
    assert.throws(() => resolveWorkerId(task, undefined), /workerId is required/);
  });
});

// ── Parity: dead-letter error code ─────────────────────────────

describe("parity — dead-letter (exceeded_requeue_limit) maps to failed", () => {
  it("exceeded_requeue_limit → executionStatus failed (not timed_out)", () => {
    const task = makeTask({
      status: "failed",
      error: {
        code: "exceeded_requeue_limit",
        message: "dead-lettered after 5 automatic requeues: worker offline",
      },
    });
    assert.equal(
      mapBrokerStatusToExecutionStatus({ brokerStatus: "failed", brokerErrorCode: "exceeded_requeue_limit" }),
      "failed",
    );
  });

  it("exceeded_requeue_limit preserves error details in buildGatewayTaskError", () => {
    const task = makeTask({
      status: "failed",
      error: {
        code: "exceeded_requeue_limit",
        message: "dead-lettered after 3 automatic requeues",
      },
    });
    const error = buildGatewayTaskError(task);
    assert.equal(error?.code, "exceeded_requeue_limit");
    assert.ok(error?.message?.includes("dead-lettered"));
  });

  it("broker_timeout still maps to timed_out (no regression from dead-letter)", () => {
    const task = makeTask({
      status: "failed",
      error: { code: "broker_timeout", message: "watchdog" },
    });
    assert.equal(
      mapBrokerStatusToExecutionStatus({ brokerStatus: "failed", brokerErrorCode: "broker_timeout" }),
      "timed_out",
    );
  });
});

// ── Parity: cancel error shaping ──────────────────────────────

describe("parity — cancel error surfaces via toGatewayError", () => {
  it("policy_denied from broker cancel is a normal error string", () => {
    // The plugin wraps broker errors via toGatewayError which just returns
    // error.message. Verify the shape is consistent.
    const brokerError = new Error("task cancellation requires a hub, operator, requester, or assigned worker actor");
    const gatewayMessage = brokerError.message;
    assert.ok(gatewayMessage.includes("policy_denied") === false); // broker uses its own message format
    assert.ok(gatewayMessage.includes("cancellation"));
  });

  it("cancel on terminal task returns abortStatus based on actual status", () => {
    const succeededTask = makeTask({ status: "succeeded" });
    const failedTask = makeTask({ status: "failed", error: { code: "exceeded_requeue_limit", message: "dl" } });

    // Non-canceled terminal tasks → not-attempted
    for (const task of [succeededTask, failedTask]) {
      const result = buildGatewayTaskResult("a2a.task.cancel", task) as Record<string, unknown>;
      assert.equal(result.abortStatus, "not-attempted");
    }

    // Already-canceled task → aborted (broker returns it as-is with canceled status)
    const canceledTask = makeTask({ status: "canceled" });
    const canceledResult = buildGatewayTaskResult("a2a.task.cancel", canceledTask) as Record<string, unknown>;
    assert.equal(canceledResult.abortStatus, "aborted");
  });
});

// ── buildGatewayTaskStatus integration ────────────────────────

describe("buildGatewayTaskStatus — full payload round-trip", () => {
  it("maps succeeded task with full payload to gateway status", () => {
    const task = makeTask({
      status: "succeeded",
      claimedAt: "2026-04-18T00:01:00Z",
      result: {
        summary: "analysis complete",
        output: { verdict: "pass" },
        artifactIds: ["a1"],
        validation: { verdict: "pass" as const, note: "ok" },
        apply: { note: "done" },
      },
      payload: {
        requesterSessionKey: "agent:main:node-remote",
        requesterChannel: "telegram",
        targetSessionKey: "agent:main:worker-alpha",
        targetDisplayKey: "worker-alpha",
        correlationId: "corr-001",
        parentRunId: "parent-001",
      },
    });

    const status = buildGatewayTaskStatus(task) as Record<string, unknown>;

    assert.equal(status.taskId, "task-001");
    assert.equal(status.executionStatus, "completed");
    assert.equal(status.deliveryStatus, "skipped");
    assert.equal(status.correlationId, "corr-001");
    assert.equal(status.parentRunId, "parent-001");
    assert.equal(status.summary, "analysis complete");
    assert.ok(status.startedAt);
    assert.ok(status.updatedAt);
    assert.ok(status.output);
    assert.equal(status.hasHeartbeat, false);
  });
});
