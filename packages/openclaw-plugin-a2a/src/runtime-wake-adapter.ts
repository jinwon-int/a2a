export type A2AWakeRuntimeKind = "openclaw-session" | "worker-run" | "in-process-queue";

export type A2AWakeFailureReason =
  | "runtime_unavailable"
  | "invalid_request"
  | "adapter_error";

export type A2AWakeRequest = {
  taskId: string;
  targetSessionKey: string;
  message: string;
  correlationId?: string;
  targetNodeId?: string;
  runtimeHint?: A2AWakeRuntimeKind;
  createdAt?: number;
};

export type A2AWakeDispatch = {
  status: "queued" | "coalesced" | "dispatched";
  taskId: string;
  targetSessionKey: string;
  runtime: A2AWakeRuntimeKind;
  wakeId: string;
  coalescedTaskIds: string[];
  visibleFailure?: A2AWakeFailureRecord;
};

export type A2AWakeFailureRecord = {
  status: "failed";
  taskId: string;
  targetSessionKey?: string;
  reason: A2AWakeFailureReason;
  message: string;
  visible: true;
  timestamp: number;
};

export type A2ARuntimeWakeAdapter = {
  readonly runtime: A2AWakeRuntimeKind;
  wake(request: A2AWakeRequest): Promise<A2AWakeDispatch> | A2AWakeDispatch;
  failures(): A2AWakeFailureRecord[];
};

export type InProcessWakeQueueEntry = {
  wakeId: string;
  targetSessionKey: string;
  taskIds: string[];
  message: string;
  createdAt: number;
  updatedAt: number;
};

export type InProcessWakeQueueAdapterOptions = {
  now?: () => number;
  randomId?: () => string;
  /**
   * Keep constrained nodes from retaining an unbounded number of pending target
   * sessions when the host cannot drain wakes quickly enough.
   */
  maxQueueEntries?: number;
  /**
   * Keep repeated accepted-task events for one active session from growing an
   * unbounded coalesced task list.
   */
  maxTaskIdsPerEntry?: number;
};

export type InProcessWakeQueueAdapter = A2ARuntimeWakeAdapter & {
  entries: () => InProcessWakeQueueEntry[];
  clear: (targetSessionKey?: string) => number;
};

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createVisibleFailure(params: {
  taskId?: string;
  targetSessionKey?: string;
  reason: A2AWakeFailureReason;
  message: string;
  now: () => number;
}): A2AWakeFailureRecord {
  return {
    status: "failed",
    taskId: params.taskId ?? "unknown",
    ...(params.targetSessionKey ? { targetSessionKey: params.targetSessionKey } : {}),
    reason: params.reason,
    message: params.message,
    visible: true,
    timestamp: params.now(),
  };
}

export function createRuntimeUnavailableWakeAdapter(options: {
  runtime?: A2AWakeRuntimeKind;
  now?: () => number;
} = {}): A2ARuntimeWakeAdapter {
  const now = options.now ?? Date.now;
  const records: A2AWakeFailureRecord[] = [];
  const runtime = options.runtime ?? "openclaw-session";
  return {
    runtime,
    wake(request) {
      const failure = createVisibleFailure({
        taskId: request.taskId,
        targetSessionKey: request.targetSessionKey,
        reason: "runtime_unavailable",
        message: `Wake runtime unavailable for ${request.targetSessionKey}`,
        now,
      });
      records.push(failure);
      return {
        status: "queued",
        taskId: request.taskId,
        targetSessionKey: request.targetSessionKey,
        runtime,
        wakeId: `failed:${request.taskId}`,
        coalescedTaskIds: [],
        visibleFailure: failure,
      };
    },
    failures() {
      return [...records];
    },
  };
}

export function createInProcessWakeQueueAdapter(
  options: InProcessWakeQueueAdapterOptions = {},
): InProcessWakeQueueAdapter {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? (() => Math.random().toString(36).slice(2));
  const maxQueueEntries = Math.max(1, Math.floor(options.maxQueueEntries ?? 64));
  const maxTaskIdsPerEntry = Math.max(1, Math.floor(options.maxTaskIdsPerEntry ?? 32));
  const queue = new Map<string, InProcessWakeQueueEntry>();
  const failures: A2AWakeFailureRecord[] = [];

  return {
    runtime: "in-process-queue",
    wake(request) {
      const taskId = readNonEmptyString(request.taskId);
      const targetSessionKey = readNonEmptyString(request.targetSessionKey);
      const message = readNonEmptyString(request.message);
      if (!taskId || !targetSessionKey || !message) {
        const failure = createVisibleFailure({
          taskId,
          targetSessionKey,
          reason: "invalid_request",
          message: "Wake request requires taskId, targetSessionKey, and message",
          now,
        });
        failures.push(failure);
        return {
          status: "queued",
          taskId: taskId ?? "unknown",
          targetSessionKey: targetSessionKey ?? "unknown",
          runtime: "in-process-queue",
          wakeId: `failed:${taskId ?? "unknown"}`,
          coalescedTaskIds: [],
          visibleFailure: failure,
        };
      }

      const existing = queue.get(targetSessionKey);
      if (existing) {
        if (!existing.taskIds.includes(taskId) && existing.taskIds.length < maxTaskIdsPerEntry) {
          existing.taskIds.push(taskId);
        }
        if (existing.taskIds.includes(taskId)) {
          existing.message = message;
          existing.updatedAt = now();
        } else {
          const failure = createVisibleFailure({
            taskId,
            targetSessionKey,
            reason: "adapter_error",
            message: `Wake queue coalescing limit reached for ${targetSessionKey}`,
            now,
          });
          failures.push(failure);
          return {
            status: "queued",
            taskId,
            targetSessionKey,
            runtime: "in-process-queue",
            wakeId: `failed:${taskId}`,
            coalescedTaskIds: [...existing.taskIds],
            visibleFailure: failure,
          };
        }
        return {
          status: "coalesced",
          taskId,
          targetSessionKey,
          runtime: "in-process-queue",
          wakeId: existing.wakeId,
          coalescedTaskIds: existing.taskIds.filter((id) => id !== taskId),
        };
      }

      if (queue.size >= maxQueueEntries) {
        const failure = createVisibleFailure({
          taskId,
          targetSessionKey,
          reason: "adapter_error",
          message: `Wake queue capacity reached (${maxQueueEntries})`,
          now,
        });
        failures.push(failure);
        return {
          status: "queued",
          taskId,
          targetSessionKey,
          runtime: "in-process-queue",
          wakeId: `failed:${taskId}`,
          coalescedTaskIds: [],
          visibleFailure: failure,
        };
      }

      const createdAt = request.createdAt ?? now();
      const entry: InProcessWakeQueueEntry = {
        wakeId: `wake:${randomId()}`,
        targetSessionKey,
        taskIds: [taskId],
        message,
        createdAt,
        updatedAt: createdAt,
      };
      queue.set(targetSessionKey, entry);
      return {
        status: "queued",
        taskId,
        targetSessionKey,
        runtime: "in-process-queue",
        wakeId: entry.wakeId,
        coalescedTaskIds: [],
      };
    },
    failures() {
      return [...failures];
    },
    entries() {
      return [...queue.values()].map((entry) => ({ ...entry, taskIds: [...entry.taskIds] }));
    },
    clear(targetSessionKey) {
      const normalizedTargetSessionKey = readNonEmptyString(targetSessionKey);
      if (normalizedTargetSessionKey) {
        return queue.delete(normalizedTargetSessionKey) ? 1 : 0;
      }
      const size = queue.size;
      queue.clear();
      return size;
    },
  };
}
