import type {
  A2AScheduledWakePlan,
  A2AWakeEnvelope,
  A2AWakeRuntimePort,
} from "./wake-layer.js";
import {
  createInProcessWakeQueueAdapter,
  type A2ARuntimeWakeAdapter,
} from "./runtime-wake-adapter.js";

export function createA2AWakeRuntimePort(
  adapter: A2ARuntimeWakeAdapter = createInProcessWakeQueueAdapter(),
): A2AWakeRuntimePort {
  return {
    async dispatchWake(params: { envelope: A2AWakeEnvelope; plan: A2AScheduledWakePlan }) {
      const dispatch = await adapter.wake({
        taskId: params.plan.taskId,
        targetSessionKey: params.plan.sessionKey,
        message: buildWakeMessage(params.envelope, params.plan),
        ...(params.plan.correlationId ? { correlationId: params.plan.correlationId } : {}),
        ...(params.plan.targetKey ? { targetNodeId: params.plan.targetKey } : {}),
        runtimeHint: adapter.runtime,
        createdAt: params.envelope.acceptedAtMs,
      });
      if (dispatch.visibleFailure) {
        return {
          accepted: false,
          code: dispatch.visibleFailure.reason,
          message: dispatch.visibleFailure.message,
        };
      }
      return {
        accepted: true,
        runtimeRunId: dispatch.wakeId,
        note:
          dispatch.status === "coalesced"
            ? "Wake-on-Task coalesced into existing runtime queue entry."
            : "Wake-on-Task queued through runtime adapter.",
      };
    },
  };
}

function buildWakeMessage(envelope: A2AWakeEnvelope, plan: A2AScheduledWakePlan): string {
  const target = envelope.target.displayKey ?? envelope.target.sessionKey;
  return [
    "A2A Wake-on-Task accepted.",
    `taskId=${plan.taskId}`,
    `target=${target}`,
    ...(envelope.waitRunId ? [`waitRunId=${envelope.waitRunId}`] : []),
    ...(envelope.correlationId ? [`correlationId=${envelope.correlationId}`] : []),
  ].join(" ");
}
