import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  createConfiguredA2ABrokerClient,
  shouldEnableWakeOnTask,
  shouldUseStandaloneBrokerSessionsSendAdapter,
  type A2ABrokerAdapterPluginRuntimeConfig,
} from "../config.js";
import {
  buildBrokerCreateTaskRequestFromOpenClaw,
  type A2ABrokerTaskRecord,
} from "../standalone-broker-client.js";
import {
  createDelegatedTaskRuntime,
  supportsCanonicalDelegatedRuntime,
} from "./delegated-task-runtime.js";
import {
  createRemoteNodeHandoffAdapter,
  type InnerSessionsSendHook,
  type RemoteNodeHandoffDeps,
} from "./remote-node-handoff-adapter.js";
import { createA2AWakeRuntimePort } from "./runtime-wake-dispatch.js";
import type { A2ARuntimeWakeAdapter } from "./runtime-wake-adapter.js";
import type { A2AWakeAuditEvent, A2AWakeGuardState, A2AWakeRuntimePort } from "./wake-layer.js";
import {
  runA2AWakeAfterTaskAcceptance,
  type A2AWakeAfterAcceptanceOptions,
} from "./wake-envelope.js";

type PluginRuntime = OpenClawPluginApi["runtime"];

type SessionsSendHookEvent = {
  sessionKey: string;
  target?: {
    sessionKey?: string;
    displayKey?: string;
  };
  message: string;
  task?: {
    intent?: string;
    instructions?: string;
    constraints?: {
      maxPingPongTurns?: number;
    };
    runtime?: {
      waitRunId?: string;
      announceTimeoutMs?: number;
      maxPingPongTurns?: number;
      cancelTarget?: {
        kind?: string;
        sessionKey?: string;
        runId?: string;
      };
    };
    requester?: {
      sessionKey?: string;
      channel?: string;
    };
    correlationId?: string;
    parentRunId?: string;
  };
  rawParams?: unknown;
};

type SessionsSendHookResult =
  | { handled: false; reason?: string }
  | {
      handled: true;
      mode: "delegated";
      dispatch: {
        kind: "a2a-broker";
        taskId: string;
        waitRunId?: string;
        cancelTarget?: {
          kind?: string;
          sessionKey?: string;
          runId?: string;
        };
        wake?: A2AWakeAuditEvent;
      };
    }
  | { handled: true; mode: "direct"; result: Record<string, unknown> };

type RawBrokerClient = ReturnType<typeof createConfiguredA2ABrokerClient>;
type BrokerClientFactory = (config: A2ABrokerAdapterPluginRuntimeConfig) => RawBrokerClient;

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRawTaskId(rawParams: unknown): string | undefined {
  if (!rawParams || typeof rawParams !== "object" || Array.isArray(rawParams)) {
    return undefined;
  }
  return normalizeOptionalString((rawParams as Record<string, unknown>).taskId);
}

function normalizeSessionRunCancelTarget(value: {
  kind?: string;
  sessionKey?: string;
  runId?: string;
} | undefined): { kind: "session_run"; sessionKey: string; runId?: string } | undefined {
  if (value?.kind !== "session_run") {
    return undefined;
  }
  const sessionKey = normalizeOptionalString(value.sessionKey);
  if (!sessionKey) {
    return undefined;
  }
  const runId = normalizeOptionalString(value.runId);
  return {
    kind: "session_run",
    sessionKey,
    ...(runId ? { runId } : {}),
  };
}

function readDispatchFromBrokerTask(task: A2ABrokerTaskRecord): {
  waitRunId?: string;
  cancelTarget?: {
    kind?: string;
    sessionKey?: string;
    runId?: string;
  };
} {
  const payload = task.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  const record = payload as Record<string, unknown>;
  const rawCancelTarget = record.cancelTarget;
  const cancelTarget =
    rawCancelTarget && typeof rawCancelTarget === "object" && !Array.isArray(rawCancelTarget)
      ? normalizeSessionRunCancelTarget({
          kind: normalizeOptionalString((rawCancelTarget as Record<string, unknown>).kind),
          sessionKey: normalizeOptionalString(
            (rawCancelTarget as Record<string, unknown>).sessionKey,
          ),
          runId: normalizeOptionalString((rawCancelTarget as Record<string, unknown>).runId),
        })
      : undefined;
  return {
    waitRunId: normalizeOptionalString(record.waitRunId),
    cancelTarget,
  };
}

export function createA2ASessionsSendHook(
  config: A2ABrokerAdapterPluginRuntimeConfig,
  runtime?: PluginRuntime,
  deps: {
    createBrokerClient?: BrokerClientFactory;
    wake?: A2AWakeAfterAcceptanceOptions;
    wakeRuntime?: A2AWakeRuntimePort;
    wakeAdapter?: A2ARuntimeWakeAdapter;
  } = {},
) {
  const recentWakeKeys = new Set<string>();

  function buildWakeOptions(base?: A2AWakeAfterAcceptanceOptions): A2AWakeAfterAcceptanceOptions {
    const runtimePort = deps.wakeRuntime ?? base?.runtime ?? createA2AWakeRuntimePort(deps.wakeAdapter);
    const baseState = base?.state ?? {};
    const state: A2AWakeGuardState = {
      ...baseState,
      recentWakeKeys: baseState.recentWakeKeys ?? recentWakeKeys,
    };
    return {
      ...base,
      runtime: runtimePort,
      config: base?.config ?? { enabled: shouldEnableWakeOnTask(config) },
      state,
      onResult: async (params) => {
        if (params.result.plan.status === "scheduled") {
          recentWakeKeys.add(params.result.plan.wakeKey);
        }
        await base?.onResult?.(params);
      },
    };
  }

  if (supportsCanonicalDelegatedRuntime(runtime)) {
    return createDelegatedTaskRuntime(config, runtime, {
      createBrokerClient: deps.createBrokerClient,
      wake: buildWakeOptions(deps.wake),
    }).run;
  }

  return async (event: SessionsSendHookEvent): Promise<SessionsSendHookResult> => {
    if (!shouldUseStandaloneBrokerSessionsSendAdapter(config)) {
      return { handled: false, reason: "a2a broker adapter inactive" };
    }
    if (!event.task?.intent) {
      return { handled: false, reason: "no delegated task intent" };
    }

    const targetSessionKey =
      normalizeOptionalString(event.target?.sessionKey) ?? normalizeOptionalString(event.sessionKey);
    const targetDisplayKey =
      normalizeOptionalString(event.target?.displayKey) ?? targetSessionKey ?? event.sessionKey;
    if (!targetSessionKey || !targetDisplayKey) {
      return { handled: false, reason: "missing target session" };
    }

    const announceTimeoutMs =
      typeof event.task.runtime?.announceTimeoutMs === "number" &&
      Number.isFinite(event.task.runtime.announceTimeoutMs)
        ? Math.max(0, event.task.runtime.announceTimeoutMs)
        : 30_000;
    const maxPingPongTurns =
      typeof event.task.runtime?.maxPingPongTurns === "number" &&
      Number.isFinite(event.task.runtime.maxPingPongTurns)
        ? Math.max(0, event.task.runtime.maxPingPongTurns)
        : typeof event.task.constraints?.maxPingPongTurns === "number" &&
            Number.isFinite(event.task.constraints.maxPingPongTurns)
          ? Math.max(0, event.task.constraints.maxPingPongTurns)
          : 0;

    const createBrokerClient = deps.createBrokerClient ?? createConfiguredA2ABrokerClient;
    const brokerTask = await createBrokerClient(config).createTask(
      buildBrokerCreateTaskRequestFromOpenClaw({
        taskId: readRawTaskId(event.rawParams),
        waitRunId: normalizeOptionalString(event.task.runtime?.waitRunId),
        correlationId: normalizeOptionalString(event.task.correlationId),
        parentRunId: normalizeOptionalString(event.task.parentRunId),
        requesterSessionKey: normalizeOptionalString(event.task.requester?.sessionKey),
        requesterChannel: normalizeOptionalString(event.task.requester?.channel),
        targetNodeId: normalizeOptionalString(event.target?.displayKey),
        targetSessionKey,
        targetDisplayKey,
        originalMessage:
          normalizeOptionalString(event.task.instructions) ?? normalizeOptionalString(event.message) ?? "",
        cancelTarget: normalizeSessionRunCancelTarget(event.task.runtime?.cancelTarget),
        announceTimeoutMs,
        maxPingPongTurns,
      }),
    );

    const wake = await runA2AWakeAfterTaskAcceptance({
      task: brokerTask,
      fallback: {
        waitRunId: normalizeOptionalString(event.task.runtime?.waitRunId),
        correlationId: normalizeOptionalString(event.task.correlationId),
        parentRunId: normalizeOptionalString(event.task.parentRunId),
        requesterSessionKey: normalizeOptionalString(event.task.requester?.sessionKey),
        requesterChannel: normalizeOptionalString(event.task.requester?.channel),
        targetSessionKey,
        targetDisplayKey,
      },
      wake: buildWakeOptions(deps.wake),
    });

    const dispatch = readDispatchFromBrokerTask(brokerTask);
    return {
      handled: true,
      mode: "delegated",
      dispatch: {
        kind: "a2a-broker",
        taskId: brokerTask.id,
        waitRunId: dispatch.waitRunId ?? normalizeOptionalString(event.task.runtime?.waitRunId),
        cancelTarget:
          dispatch.cancelTarget ?? normalizeSessionRunCancelTarget(event.task.runtime?.cancelTarget),
        ...(shouldEnableWakeOnTask(config) && wake.audit.auditEvent ? { wake: wake.audit.auditEvent } : {}),
      },
    };
  };
}

// Wraps `createA2ASessionsSendHook` with the remote node-id handoff adapter so
// that `sessions_send` calls targeting a remote A2A node-id (e.g. "node-remote")
// preserve the node-id through to broker task creation instead of being
// rejected by core's local-session visibility check. The base hook is left
// unchanged for callers that opt out of remote-aware routing.
export function createA2ASessionsSendHookWithRemoteResolution(
  config: A2ABrokerAdapterPluginRuntimeConfig,
  runtime?: PluginRuntime,
  deps: {
    createBrokerClient?: BrokerClientFactory;
    wake?: A2AWakeAfterAcceptanceOptions;
    wakeRuntime?: A2AWakeRuntimePort;
    wakeAdapter?: A2ARuntimeWakeAdapter;
    resolverOptions?: RemoteNodeHandoffDeps["resolverOptions"];
    visibilityPolicy?: RemoteNodeHandoffDeps["visibilityPolicy"];
  } = {},
): InnerSessionsSendHook {
  const innerHook = createA2ASessionsSendHook(config, runtime, {
    ...(deps.createBrokerClient ? { createBrokerClient: deps.createBrokerClient } : {}),
    ...(deps.wake ? { wake: deps.wake } : {}),
    ...(deps.wakeRuntime ? { wakeRuntime: deps.wakeRuntime } : {}),
    ...(deps.wakeAdapter ? { wakeAdapter: deps.wakeAdapter } : {}),
  }) as InnerSessionsSendHook;
  return createRemoteNodeHandoffAdapter(config, {
    innerHook,
    ...(deps.resolverOptions ? { resolverOptions: deps.resolverOptions } : {}),
    ...(deps.visibilityPolicy ? { visibilityPolicy: deps.visibilityPolicy } : {}),
  });
}
