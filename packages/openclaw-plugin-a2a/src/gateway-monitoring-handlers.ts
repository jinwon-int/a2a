/**
 * A2A monitoring gateway method handlers.
 *
 * These handlers own the gateway RPC surface for a2a.alerts.list and a2a.monitor.status.
 * They delegate to the standalone a2a-broker HTTP endpoint's diagnostics and alerts APIs.
 */
import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk/gateway-runtime";
import {
  createConfiguredA2ABrokerClient,
  resolveA2ABrokerAdapterPluginConfig,
  type A2ABrokerAdapterPluginRuntimeConfig,
} from "../config.js";
import { A2ABrokerClientError } from "../standalone-broker-client.js";
import {
  buildDisabledA2AOperatorEventBridgeState,
  buildUnavailableA2AOperatorEventBridgeState,
  createA2AOperatorEventBridge,
  type A2AOperatorEventBridge,
  type A2AOperatorEventBridgeBrokerClient,
} from "./operator-event-bridge.js";
import { createA2AOperatorNotificationAdapter } from "./operator-notification-adapter.js";
import type {
  A2AAlertsListParams,
  A2AMonitorStatusParams,
} from "./gateway-schema.js";
import {
  validateA2AAlertsListParams,
  validateA2AMonitorStatusParams,
  validateParams,
} from "./gateway-validators.js";
import { a2aError, A2AErrorCodes } from "./plugin-errors.js";

export type A2ABrokerAuditBottleneckWarning = {
  code: "broker_audit_bottleneck";
  severity: "warn";
  source: "broker.health";
  message: string;
  auditRows?: number;
  maxAuditEvents?: number;
  heartbeatRatio?: number;
  healthLatencyMs?: number;
  dominantEventType?: string;
};

export type A2ABrokerRuntimeOwnerMetadata = {
  manager?: string;
  service?: string;
  unit?: string;
  composeProject?: string;
  composeService?: string;
  containerName?: string;
};

export type A2ABrokerBuildInfoMetadata = {
  source: "broker.health";
  version: string;
  revision: string;
  image: string;
};

export type A2AOperatorReceiptProjectionState =
  | "accepted"
  | "sent"
  | "provider-delivered-if-known"
  | "operator-visible"
  | "timed_out"
  | "stale"
  | "failed"
  | "pending";

export type A2AOperatorVisibleTerminalReceiptState =
  | "pending_receipt"
  | "timed_out"
  | "stale"
  | "failed"
  | "duplicate_suppressed"
  | "receipt_confirmed";

export type A2ABrokerTerminalReceiptGapProjection = {
  taskId: string;
  status?: string;
  receiptState: A2AOperatorReceiptProjectionState;
  /** Provider/transport state only; never evidence of operator-visible receipt by itself. */
  providerDeliveryState?: Extract<A2AOperatorReceiptProjectionState, "accepted" | "sent" | "provider-delivered-if-known">;
  receiptStatus: "received" | "pending";
  receiptGapStatus: "confirmed" | "missing" | "timed_out" | "stale" | "failed" | "duplicate_suppressed";
  /** Operator-actionable receipt state, separate from provider send/delivery status. */
  operatorReceiptState: A2AOperatorVisibleTerminalReceiptState;
  operatorReceiptLabel: string;
  brokerReceiptClassification?: string;
  terminalAckEligible: boolean;
  reason: string;
};

export type A2ABrokerTerminalReceiptGapWarning = {
  code: "terminal_receipt_gap";
  severity: "warn";
  source: "broker.diagnostics";
  message: string;
  count: number;
  taskIds: string[];
};

export type A2ABrokerNoLiveRehearsalProjection = {
  mode: "release-dryrun/no-live";
  status: "ready" | "blocked";
  manifestId?: string;
  runId?: string;
  receiptStates: Array<{
    taskId?: string;
    state: A2AOperatorReceiptProjectionState;
    terminalAckEligible: boolean;
    reason: string;
  }>;
  gateFindings: Array<{
    code: string;
    status: "pass" | "blocked";
    message: string;
  }>;
  auditFindings: Array<{
    code: string;
    status: "pass" | "blocked";
    message: string;
  }>;
  missingUnsafeEvidenceFields: string[];
  safeOperations: {
    liveSend: false;
    terminalOutboxAck: false;
    gatewayRestart: false;
    productionDeploy: false;
    providerSend: false;
  };
};

export type A2ABrokerNoLiveRehearsalWarning = {
  code: "no_live_rehearsal_blocked";
  severity: "warn";
  source: "broker.rehearsalManifest";
  message: string;
  missingUnsafeEvidenceFields: string[];
};

export type A2ABrokerLiveReadinessProjection = {
  mode: "release-dryrun/no-live";
  status: "ready" | "blocked";
  runId?: string;
  canaryResults: Array<{
    code: string;
    status: "pass" | "blocked";
    message: string;
  }>;
  evidenceAcceptance: Array<{
    kind: "PR" | "Done" | "Block" | "missing_evidence";
    status: "accepted" | "missing" | "blocked";
    taskId?: string;
    issue?: string;
    url?: string;
    message: string;
  }>;
  queueSignals: {
    status: "ready" | "blocked";
    queued: number;
    claimed: number;
    running: number;
    stale: number;
    timedOut: number;
    messages: string[];
  };
  safeOperations: A2ABrokerNoLiveRehearsalProjection["safeOperations"];
};

export type A2ABrokerLiveReadinessWarning = {
  code: "live_readiness_blocked";
  severity: "warn";
  source: "broker.liveReadiness";
  message: string;
};

export function createA2AMonitoringHandlers(
  config: A2ABrokerAdapterPluginRuntimeConfig,
  deps: {
    createClient?: typeof createConfiguredA2ABrokerClient;
    createOperatorEventBridge?: (params: {
      broker: A2AOperatorEventBridgeBrokerClient;
    }) => A2AOperatorEventBridge;
    runtime?: unknown;
    now?: () => number;
  } = {},
) {
  type RawBrokerClient = ReturnType<typeof createConfiguredA2ABrokerClient>;

  const resolvedConfig = resolveA2ABrokerAdapterPluginConfig(config);
  const createClient = deps.createClient ?? createConfiguredA2ABrokerClient;
  const notificationAdapter = createA2AOperatorNotificationAdapter(config, deps.runtime, {
    ...(deps.now ? { now: deps.now } : {}),
  });
  const createOperatorEventBridgeFactory =
    deps.createOperatorEventBridge ??
    ((params: { broker: A2AOperatorEventBridgeBrokerClient }) =>
      createA2AOperatorEventBridge({
        broker: params.broker,
        ...(notificationAdapter
          ? {
              notifyOperator: async (envelope) => {
                const receipt = await notificationAdapter.notify(envelope);
                const failure = receipt ? undefined : notificationAdapter.getLastFailure(envelope.dedupeKey);
                return {
                  ackTerminalEvent: Boolean(receipt && !receipt.dryRun),
                  ...(receipt?.confirmationSource === "current_session_visible" || receipt?.confirmationSource === "manual_operator_receipt"
                    ? { confirmationSource: receipt.confirmationSource }
                    : {}),
                  reason: receipt
                    ? `operator notification receipt confirmed via ${receipt.confirmationSource}`
                    : failure?.reason ?? "operator notification sent without current-session/manual receipt confirmation",
                };
              },
            }
          : {}),
        ...(deps.now ? { now: deps.now } : {}),
      }));
  let rawClient: RawBrokerClient | undefined;
  let clientError: Error | undefined;
  let operatorBridge: A2AOperatorEventBridge | undefined;

  function getRawClient(): RawBrokerClient | null {
    if (rawClient) return rawClient;
    try {
      rawClient = createClient(config);
      clientError = undefined;
      return rawClient;
    } catch (error) {
      clientError = error instanceof Error ? error : new Error(String(error));
      return null;
    }
  }

  function respondBrokerUnavailable(opts: GatewayRequestHandlerOptions): void {
    const message = clientError?.message ?? "a2a broker client not initialized";
    opts.respond(false, undefined, a2aError(A2AErrorCodes.NOT_FOUND, message));
  }

  function ensureOperatorEventBridge(params: { cursor?: string } = {}): { bridge?: A2AOperatorEventBridge; disabled?: unknown } {
    if (!resolvedConfig.enabled) {
      return {
        disabled: buildDisabledA2AOperatorEventBridgeState({
          cursor: params.cursor,
          note: "Standalone A2A broker adapter is disabled",
        }),
      };
    }
    if (!resolvedConfig.operatorEventsEnabled) {
      return {
        disabled: buildDisabledA2AOperatorEventBridgeState({
          cursor: params.cursor,
          note:
            "Broker operator event bridge is disabled; set plugins.entries.a2a-broker-adapter.config.operatorEvents.enabled=true",
        }),
      };
    }

    const client = getRawClient();
    if (!client) {
      return {
        disabled: buildUnavailableA2AOperatorEventBridgeState({
          message: clientError?.message ?? "a2a broker client not initialized",
          cursor: params.cursor,
          ...(deps.now ? { now: deps.now } : {}),
        }),
      };
    }

    operatorBridge ??= createOperatorEventBridgeFactory({ broker: client });
    return { bridge: operatorBridge };
  }

  function getOperatorBridgeState(params: { cursor?: string }): unknown {
    const ensured = ensureOperatorEventBridge(params);
    if (ensured.disabled) return ensured.disabled;
    return ensured.bridge!.getState({ cursor: params.cursor });
  }

  return {
    startOperatorEventBridge(): unknown {
      const ensured = ensureOperatorEventBridge();
      if (ensured.disabled) return ensured.disabled;
      return ensured.bridge!.getState();
    },

    shutdownOperatorEventBridge(): void {
      operatorBridge?.shutdown();
      operatorBridge = undefined;
    },

    handleA2AAlertsList: async (opts: GatewayRequestHandlerOptions): Promise<void> => {
      const check = validateParams(opts.params, validateA2AAlertsListParams, "a2a.alerts.list");
      if (!check.valid) {
        opts.respond(false, undefined, check.error);
        return;
      }
      const client = getRawClient();
      if (!client) {
        respondBrokerUnavailable(opts);
        return;
      }
      try {
        const alerts = await client.getAlerts();
        opts.respond(true, alerts);
      } catch (err) {
        const error = toGatewayError(err);
        opts.respond(
          false,
          undefined,
          a2aError(A2AErrorCodes.INTERNAL, `a2a.alerts.list failed: ${error}`),
        );
      }
    },

    handleA2AMonitorStatus: async (opts: GatewayRequestHandlerOptions): Promise<void> => {
      const check = validateParams(opts.params, validateA2AMonitorStatusParams, "a2a.monitor.status");
      if (!check.valid) {
        opts.respond(false, undefined, check.error);
        return;
      }
      if (!check.data.taskId && check.data.operatorEvents?.enabled === true) {
        opts.respond(
          true,
          getOperatorBridgeState({ cursor: check.data.operatorEvents.cursor }),
        );
        return;
      }

      const client = getRawClient();
      if (!client) {
        respondBrokerUnavailable(opts);
        return;
      }
      try {
        const health = await getBrokerHealthForWarningProjection(client);
        if (check.data.taskId) {
          // Single-task diagnostics
          const diagnostics = await client.getTaskDiagnostics(check.data.taskId);
          opts.respond(true, projectBrokerAuditWarnings(diagnostics, health));
        } else {
          // Bulk diagnostics scan
          const diagnostics = await client.listDiagnostics();
          opts.respond(true, projectBrokerAuditWarnings(diagnostics, health));
        }
      } catch (err) {
        if (err instanceof A2ABrokerClientError && err.status === 404) {
          opts.respond(
            false,
            undefined,
            a2aError(A2AErrorCodes.NOT_FOUND, `a2a task not found: ${check.data.taskId}`),
          );
          return;
        }
        const error = toGatewayError(err);
        opts.respond(
          false,
          undefined,
          a2aError(A2AErrorCodes.INTERNAL, `a2a.monitor.status failed: ${error}`),
        );
      }
    },
  };
}

function toGatewayError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getBrokerHealthForWarningProjection(
  client: { health?: () => Promise<unknown> },
): Promise<unknown> {
  if (typeof client.health !== "function") return undefined;
  try {
    return await client.health();
  } catch {
    // Monitoring status should keep its existing diagnostics semantics even when
    // the optional health-side warning metadata is temporarily unavailable.
    return undefined;
  }
}

export function projectBrokerAuditWarnings(diagnostics: unknown, health: unknown): unknown {
  const warning = buildBrokerAuditBottleneckWarning(health);
  const terminalReceiptGaps = buildBrokerTerminalReceiptGapProjections(diagnostics);
  const receiptWarning = buildBrokerTerminalReceiptGapWarning(terminalReceiptGaps);
  const noLiveRehearsal = buildBrokerNoLiveRehearsalProjection(diagnostics);
  const noLiveRehearsalWarning = buildBrokerNoLiveRehearsalWarning(noLiveRehearsal);
  const liveReadiness = buildBrokerLiveReadinessProjection(diagnostics);
  const liveReadinessWarning = buildBrokerLiveReadinessWarning(liveReadiness);
  const runtimeOwner = buildBrokerRuntimeOwnerMetadata(health);
  const buildInfo = buildBrokerBuildInfoMetadata(health);
  if (!isPlainRecord(diagnostics)) return diagnostics;

  const existingWarnings = Array.isArray(diagnostics.pluginWarnings)
    ? diagnostics.pluginWarnings
    : [];
  const projectedDiagnostics = noLiveRehearsal
    ? stripBrokerNoLiveRehearsalManifests(diagnostics)
    : diagnostics;
  const pluginWarnings = [
    ...existingWarnings,
    ...(warning ? [warning] : []),
    ...(receiptWarning ? [receiptWarning] : []),
    ...(noLiveRehearsalWarning ? [noLiveRehearsalWarning] : []),
    ...(liveReadinessWarning ? [liveReadinessWarning] : []),
  ];
  return {
    ...projectedDiagnostics,
    ...(pluginWarnings.length ? { pluginWarnings } : {}),
    ...(terminalReceiptGaps.length ? { terminalReceiptGaps } : {}),
    ...(noLiveRehearsal ? { noLiveRehearsal } : {}),
    ...(liveReadiness ? { liveReadiness } : {}),
    ...(runtimeOwner ? { brokerRuntimeOwner: runtimeOwner } : {}),
    brokerBuildInfo: buildInfo,
  };
}

export function buildBrokerLiveReadinessProjection(
  diagnostics: unknown,
): A2ABrokerLiveReadinessProjection | undefined {
  if (!isPlainRecord(diagnostics)) return undefined;
  const source = findLiveReadinessSource(diagnostics);
  if (!source) return undefined;

  const canaryResults = readLiveReadinessCanaryResults(source);
  const evidenceAcceptance = readLiveReadinessEvidenceAcceptance(source);
  const queueSignals = readLiveReadinessQueueSignals(source);
  const hasBlockedCanary = canaryResults.some((result) => result.status === "blocked");
  const hasBlockedEvidence = evidenceAcceptance.some((result) => result.status !== "accepted");
  const status = hasBlockedCanary || hasBlockedEvidence || queueSignals.status === "blocked" ? "blocked" : "ready";
  const runId = firstSafeString(source.runId, source.run, source.traceId, getNested(source, ["metadata", "runId"]));

  return {
    mode: "release-dryrun/no-live",
    status,
    ...(runId ? { runId } : {}),
    canaryResults,
    evidenceAcceptance,
    queueSignals,
    safeOperations: {
      liveSend: false,
      terminalOutboxAck: false,
      gatewayRestart: false,
      productionDeploy: false,
      providerSend: false,
    },
  };
}

function buildBrokerLiveReadinessWarning(
  projection: A2ABrokerLiveReadinessProjection | undefined,
): A2ABrokerLiveReadinessWarning | undefined {
  if (!projection || projection.status !== "blocked") return undefined;
  return {
    code: "live_readiness_blocked",
    severity: "warn",
    source: "broker.liveReadiness",
    message: "Live-readiness monitor has blocked canary, evidence, stale, timed_out, or active queue signals.",
  };
}

function findLiveReadinessSource(root: Record<string, unknown>): Record<string, unknown> | undefined {
  const candidates = [
    root.liveReadiness,
    root.liveReadinessProjection,
    root.liveReadinessMonitor,
    getNested(root, ["diagnostics", "liveReadiness"]),
    getNested(root, ["monitor", "liveReadiness"]),
    findNoLiveRehearsalManifest(root),
  ];
  for (const candidate of candidates) {
    if (!isPlainRecord(candidate)) continue;
    const mode = firstString(candidate.mode, candidate.safetyMode, candidate.kind);
    if (
      mode === "release-dryrun/no-live" ||
      mode === "live-readiness" ||
      candidate.liveReadiness === true ||
      Array.isArray(candidate.evidenceAcceptance) ||
      Array.isArray(candidate.canaryResults)
    ) return candidate;
  }
  return undefined;
}

function readLiveReadinessCanaryResults(
  source: Record<string, unknown>,
): A2ABrokerLiveReadinessProjection["canaryResults"] {
  const raw = firstArray(source.canaryResults, source.canary, source.verifierResults, source.gates);
  if (!raw) return [];
  return raw.filter(isPlainRecord).map((record) => ({
    code: firstSafeString(record.code, record.name, record.id) ?? "canary",
    status: normalizeFindingStatus(firstSafeString(record.status, record.result, record.state)),
    message: firstSafeReason(record.message, record.reason, record.summary) ?? "live-readiness canary result",
  })).slice(0, 25);
}

function readLiveReadinessEvidenceAcceptance(
  source: Record<string, unknown>,
): A2ABrokerLiveReadinessProjection["evidenceAcceptance"] {
  const raw = firstArray(
    source.evidenceAcceptance,
    source.evidenceResults,
    source.verifierEvidence,
    source.canonicalEvidence,
    getNested(source, ["evidence", "acceptance"]),
  );
  if (!raw) return [];
  return raw.filter(isPlainRecord).map((record) => {
    const kind = normalizeEvidenceKind(firstSafeString(record.kind, record.marker, record.type));
    const status = normalizeEvidenceAcceptanceStatus(firstSafeString(record.status, record.result, record.state), kind);
    const taskId = firstSafeString(record.taskId, record.id);
    const issue = firstSafeString(record.issue, record.issueUrl, record.issueRef);
    const url = firstSafeUrl(record.url, record.prUrl, record.doneUrl, record.blockUrl, record.evidenceUrl);
    return {
      kind,
      status,
      ...(taskId ? { taskId } : {}),
      ...(issue ? { issue } : {}),
      ...(url ? { url } : {}),
      message: firstSafeReason(record.message, record.reason, record.summary) ?? buildEvidenceAcceptanceMessage(kind, status),
    };
  }).slice(0, 25);
}

function readLiveReadinessQueueSignals(
  source: Record<string, unknown>,
): A2ABrokerLiveReadinessProjection["queueSignals"] {
  const queue = isPlainRecord(source.queueSignals) ? source.queueSignals : isPlainRecord(source.queue) ? source.queue : source;
  const queued = firstNonNegativeInteger(queue.queued, queue.queuedCount, queue.pending) ?? 0;
  const claimed = firstNonNegativeInteger(queue.claimed, queue.claimedCount) ?? 0;
  const running = firstNonNegativeInteger(queue.running, queue.runningCount, queue.inProgress) ?? 0;
  const stale = firstNonNegativeInteger(queue.stale, queue.staleCount, queue.staleTasks) ?? 0;
  const timedOut = firstNonNegativeInteger(queue.timedOut, queue.timed_out, queue.timeout, queue.timedOutCount) ?? 0;
  const active = queued + claimed + running;
  const messages = [
    active ? `active queue signals: queued=${queued}, claimed=${claimed}, running=${running}` : undefined,
    stale ? `stale queue signals: ${stale}` : undefined,
    timedOut ? `timed_out queue signals: ${timedOut}` : undefined,
  ].filter((message): message is string => Boolean(message)).slice(0, 10);
  return {
    status: active || stale || timedOut ? "blocked" : "ready",
    queued,
    claimed,
    running,
    stale,
    timedOut,
    messages,
  };
}

export function buildBrokerNoLiveRehearsalProjection(
  diagnostics: unknown,
): A2ABrokerNoLiveRehearsalProjection | undefined {
  if (!isPlainRecord(diagnostics)) return undefined;
  const manifest = findNoLiveRehearsalManifest(diagnostics);
  if (!manifest) return undefined;

  const missingUnsafeEvidenceFields = collectMissingUnsafeEvidenceFields(manifest);
  const receiptStates = readNoLiveReceiptStates(manifest);
  const gateFindings = readNoLiveFindings(manifest, ["gateFindings", "gates", "receiptGates"]);
  const auditFindings = readNoLiveFindings(manifest, ["auditFindings", "audit", "ackAuditDecisions"]);
  const hasBlockedFinding = [...gateFindings, ...auditFindings].some((finding) => finding.status === "blocked");
  const status = missingUnsafeEvidenceFields.length || hasBlockedFinding ? "blocked" : "ready";
  const manifestId = firstSafeString(manifest.manifestId, manifest.id);
  const runId = firstSafeString(manifest.runId, manifest.run, manifest.traceId);
  return {
    mode: "release-dryrun/no-live",
    status,
    ...(manifestId ? { manifestId } : {}),
    ...(runId ? { runId } : {}),
    receiptStates,
    gateFindings,
    auditFindings,
    missingUnsafeEvidenceFields,
    safeOperations: {
      liveSend: false,
      terminalOutboxAck: false,
      gatewayRestart: false,
      productionDeploy: false,
      providerSend: false,
    },
  };
}

function stripBrokerNoLiveRehearsalManifests(diagnostics: Record<string, unknown>): Record<string, unknown> {
  const {
    noLiveRehearsalManifest: _noLiveRehearsalManifest,
    rehearsalManifest: _rehearsalManifest,
    noLiveRehearsal: _noLiveRehearsal,
    ...safeDiagnostics
  } = diagnostics;
  return safeDiagnostics;
}

function buildBrokerNoLiveRehearsalWarning(
  projection: A2ABrokerNoLiveRehearsalProjection | undefined,
): A2ABrokerNoLiveRehearsalWarning | undefined {
  if (!projection || projection.status !== "blocked") return undefined;
  return {
    code: "no_live_rehearsal_blocked",
    severity: "warn",
    source: "broker.rehearsalManifest",
    message: "No-live rehearsal manifest is missing required safe evidence or contains blocked gate/audit findings.",
    missingUnsafeEvidenceFields: projection.missingUnsafeEvidenceFields,
  };
}

function findNoLiveRehearsalManifest(root: Record<string, unknown>): Record<string, unknown> | undefined {
  const candidates = [
    root.noLiveRehearsalManifest,
    root.rehearsalManifest,
    root.noLiveRehearsal,
    getNested(root, ["diagnostics", "noLiveRehearsalManifest"]),
    getNested(root, ["diagnostics", "rehearsalManifest"]),
    getNested(root, ["rehearsal", "manifest"]),
  ];
  for (const candidate of candidates) {
    if (!isPlainRecord(candidate)) continue;
    const mode = firstString(candidate.mode, candidate.safetyMode, candidate.kind);
    if (mode === "release-dryrun/no-live" || mode === "no-live" || candidate.noLive === true) return candidate;
  }
  return undefined;
}

function collectMissingUnsafeEvidenceFields(manifest: Record<string, unknown>): string[] {
  const requiredFalse: Array<[string, unknown]> = [
    ["safeOperations.liveSend", getNested(manifest, ["safeOperations", "liveSend"])],
    ["safeOperations.terminalOutboxAck", getNested(manifest, ["safeOperations", "terminalOutboxAck"])],
    ["safeOperations.gatewayRestart", getNested(manifest, ["safeOperations", "gatewayRestart"])],
    ["safeOperations.productionDeploy", getNested(manifest, ["safeOperations", "productionDeploy"])],
    ["safeOperations.providerSend", getNested(manifest, ["safeOperations", "providerSend"])],
    ["receiptGate.terminalAckEligible", getNested(manifest, ["receiptGate", "terminalAckEligible"])],
  ];
  const missing = requiredFalse.flatMap(([field, value]) => value === false ? [] : [field]);
  if (getNested(manifest, ["receiptGate", "providerGatewaySendSuccess"]) !== "not_ack_evidence") {
    missing.push("receiptGate.providerGatewaySendSuccess");
  }
  return missing;
}

function readNoLiveReceiptStates(manifest: Record<string, unknown>): A2ABrokerNoLiveRehearsalProjection["receiptStates"] {
  const raw = firstArray(
    manifest.receiptStates,
    manifest.receipts,
    manifest.terminalReceipts,
    getNested(manifest, ["receiptGate", "receiptStates"]),
  );
  if (!raw) return [];
  return raw.filter(isPlainRecord).map((record) => {
    const state = normalizeNoLiveReceiptState(firstSafeString(record.state, record.status, record.receiptStatus));
    const taskId = firstSafeString(record.taskId, record.id);
    return {
      ...(taskId ? { taskId } : {}),
      state,
      terminalAckEligible: record.terminalAckEligible === true,
      reason: firstSafeReason(record.reason, record.message) ?? buildNoLiveReceiptReason(state),
    };
  }).slice(0, 25);
}

function readNoLiveFindings(
  manifest: Record<string, unknown>,
  keys: string[],
): A2ABrokerNoLiveRehearsalProjection["gateFindings"] {
  const raw = firstArray(...keys.map((key) => manifest[key]));
  if (!raw) return [];
  return raw.filter(isPlainRecord).map((record) => ({
    code: firstSafeString(record.code, record.name, record.id) ?? "finding",
    status: normalizeFindingStatus(firstSafeString(record.status, record.result)),
    message: firstSafeReason(record.message, record.reason, record.summary) ?? "no-live rehearsal finding",
  })).slice(0, 25);
}

export function buildBrokerTerminalReceiptGapProjections(
  diagnostics: unknown,
): A2ABrokerTerminalReceiptGapProjection[] {
  if (!isPlainRecord(diagnostics)) return [];
  const byTask = new Map<string, A2ABrokerTerminalReceiptGapProjection>();

  for (const record of readTerminalReceiptGapRecords(diagnostics)) {
    const projection = normalizeBrokerTerminalReceiptGapProjection(record);
    if (!projection) continue;
    byTask.set(projection.taskId, projection);
  }

  return [...byTask.values()].sort((a, b) => a.taskId.localeCompare(b.taskId)).slice(0, 25);
}

function buildBrokerTerminalReceiptGapWarning(
  projections: A2ABrokerTerminalReceiptGapProjection[],
): A2ABrokerTerminalReceiptGapWarning | undefined {
  const gaps = projections.filter((projection) => projection.receiptGapStatus !== "confirmed");
  if (!gaps.length) return undefined;
  return {
    code: "terminal_receipt_gap",
    severity: "warn",
    source: "broker.diagnostics",
    message: "Terminal task receipt/evidence is not operator-confirmed; provider send success is not terminal ACK evidence.",
    count: gaps.length,
    taskIds: gaps.map((gap) => gap.taskId).slice(0, 10),
  };
}

function readTerminalReceiptGapRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const pushRecord = (value: unknown) => {
    if (isPlainRecord(value)) records.push(value);
  };
  const pushArray = (value: unknown) => {
    if (Array.isArray(value)) records.push(...value.filter(isPlainRecord));
  };

  pushRecord(root.terminalEvent);
  pushRecord(root.terminalReceipt);
  pushRecord(root.receipt);
  pushArray(root.terminalReceipts);
  pushArray(root.receiptGaps);
  pushArray(root.terminalReceiptGaps);
  pushArray(root.terminalOutbox);
  pushArray(root.events);
  pushArray(root.outboxEvents);
  pushArray(root.tasks);
  pushArray(root.items);
  pushArray(root.diagnostics);
  pushRecord(root.task);
  if (!records.length) records.push(root);
  return records;
}

function normalizeBrokerTerminalReceiptGapProjection(
  record: Record<string, unknown>,
): A2ABrokerTerminalReceiptGapProjection | undefined {
  const task = isPlainRecord(record.task) ? record.task : undefined;
  const metadata = isPlainRecord(record.metadata) ? record.metadata : undefined;
  const receipt = isPlainRecord(record.receipt) ? record.receipt : undefined;
  const ack = isPlainRecord(record.ack) ? record.ack : undefined;
  const ackAudit = isPlainRecord(record.ackAudit) ? record.ackAudit : undefined;
  const delivery = isPlainRecord(record.delivery) ? record.delivery : undefined;
  const payload = isPlainRecord(record.payload) ? record.payload : undefined;
  const roots = [ackAudit, record, metadata, receipt, ack, delivery, payload].filter(isPlainRecord);

  const taskId = firstSafeString(record.taskId, record.a2aTaskId, task?.id, metadata?.taskId, payload?.taskId, record.id);
  if (!taskId) return undefined;

  const status = firstSafeString(record.status, record.type, task && isPlainRecord(task.status) ? task.status.state : undefined, payload?.status);
  const receiptMode = readConfirmedTerminalReceiptMode(roots);
  const explicitGap = readExplicitTerminalReceiptGapStatus(roots);
  const terminalLike = isTerminalDiagnosticRecord(record, status);
  const receiptGapStatus = explicitGap ?? (receiptMode ? "confirmed" : terminalLike ? "missing" : undefined);
  if (!receiptGapStatus) return undefined;
  const receiptState = normalizeOperatorReceiptProjectionState(roots, status, receiptMode, receiptGapStatus);
  const providerDeliveryState = readProviderDeliveryState(roots);
  const operatorReceiptState = normalizeOperatorVisibleReceiptState(receiptGapStatus);
  const brokerReceiptClassification = readBrokerReceiptClassification(roots);

  const terminalAckEligible = Boolean(receiptMode) && receiptGapStatus === "confirmed";
  return {
    taskId,
    ...(status ? { status } : {}),
    receiptState,
    ...(providerDeliveryState ? { providerDeliveryState } : {}),
    receiptStatus: receiptGapStatus === "confirmed" ? "received" : "pending",
    receiptGapStatus,
    operatorReceiptState,
    operatorReceiptLabel: buildOperatorReceiptLabel(operatorReceiptState),
    ...(brokerReceiptClassification ? { brokerReceiptClassification } : {}),
    terminalAckEligible,
    reason: buildTerminalReceiptGapReason(receiptGapStatus),
  };
}

function readConfirmedTerminalReceiptMode(
  roots: Record<string, unknown>[],
): "current_session_visible" | "manual_operator_receipt" | undefined {
  for (const root of roots) {
    if (root.current_session_visible === true || root.currentSessionVisible === true) return "current_session_visible";
    if (root.manual_operator_receipt === true || root.manualOperatorReceipt === true) return "manual_operator_receipt";
    const mode = firstSafeString(root.receiptMode, root.receiptProjection, root.projection, root.mode, root.kind, root.evidence);
    if (mode === "current_session_visible" || mode === "operator_visible" || mode === "operator-visible") return "current_session_visible";
    if (mode === "manual_operator_receipt" || mode === "operator_confirmed" || mode === "operator-confirmed") return "manual_operator_receipt";
  }
  return undefined;
}

function readExplicitTerminalReceiptGapStatus(
  roots: Record<string, unknown>[],
): A2ABrokerTerminalReceiptGapProjection["receiptGapStatus"] | undefined {
  for (const root of roots) {
    const decision = firstSafeString(root.decision)?.toLowerCase();
    if (["duplicate_suppressed", "duplicate-suppressed", "duplicate_delivery_suppressed", "suppress_duplicate", "duplicate"].includes(decision ?? "")) return "duplicate_suppressed";
    const raw = firstSafeString(
      root.receiptGapStatus,
      root.receipt_gap_status,
      root.operatorReceiptStatus,
      root.operator_receipt_status,
      root.terminalReceiptStatus,
      root.terminal_receipt_status,
      root.receiptClassification,
      root.receipt_classification,
      root.classification,
      root.receiptStatus,
      root.receipt_status,
    )?.toLowerCase();
    if (!raw) continue;
    if (["confirmed", "receipt_confirmed", "received", "visible", "operator_visible", "operator-visible", "operator_confirmed"].includes(raw)) return "confirmed";
    if (["provider_delivered", "provider-delivered", "provider-delivered-if-known", "delivered", "provider_sent", "provider-sent", "sent", "accepted", "started", "produced", "pending"].includes(raw)) return "missing";
    if (["missing", "waiting", "unconfirmed", "not_received", "receipt_missing", "pending_receipt", "hold_unacked"].includes(raw)) return "missing";
    if (["timed_out", "timeout", "timed-out"].includes(raw)) return "timed_out";
    if (["stale", "expired", "stale_timed_out", "timed_out_stale", "timed-out-stale"].includes(raw)) return "stale";
    if (["duplicate_suppressed", "duplicate-suppressed", "duplicate_delivery_suppressed", "suppress_duplicate", "duplicate"].includes(raw)) return "duplicate_suppressed";
    if (["failed", "failure", "error", "rejected", "undeliverable"].includes(raw)) return "failed";
  }
  return undefined;
}

function isTerminalDiagnosticRecord(record: Record<string, unknown>, status: string | undefined): boolean {
  const normalized = status?.toLowerCase();
  if (normalized && ["succeeded", "success", "completed", "done", "failed", "failure", "blocked", "canceled", "cancelled"].includes(normalized)) {
    return true;
  }
  const providerStatus = firstSafeString(record.providerSendStatus, record.providerGatewaySendStatus, getNested(record, ["delivery", "status"]))?.toLowerCase();
  return providerStatus === "sent" || providerStatus === "provider_sent" || providerStatus === "accepted";
}

function normalizeOperatorReceiptProjectionState(
  roots: Record<string, unknown>[],
  brokerStatus: string | undefined,
  receiptMode: "current_session_visible" | "manual_operator_receipt" | undefined,
  gapStatus: A2ABrokerTerminalReceiptGapProjection["receiptGapStatus"],
): A2AOperatorReceiptProjectionState {
  if (receiptMode && gapStatus === "confirmed") return "operator-visible";
  if (gapStatus === "failed") return "failed";
  if (gapStatus === "timed_out") return "timed_out";
  if (gapStatus === "stale") return "stale";
  if (gapStatus === "duplicate_suppressed") return "pending";

  for (const root of roots) {
    const normalized = firstSafeString(
      root.receiptState,
      root.receipt_state,
      root.operatorReceiptState,
      root.operator_receipt_state,
      root.terminalReceiptState,
      root.terminal_receipt_state,
      root.terminalReceiptStatus,
      root.terminal_receipt_status,
      root.receiptClassification,
      root.receipt_classification,
      root.classification,
      root.receiptStatus,
      root.receipt_status,
      root.providerDeliveryStatus,
      root.provider_delivery_status,
      root.providerSendStatus,
      root.provider_send_status,
      root.providerGatewaySendStatus,
      root.provider_gateway_send_status,
      root.status,
    )?.toLowerCase();
    const state = normalizeOperatorReceiptStateString(normalized);
    if (state) return state;
  }

  const fallback = normalizeOperatorReceiptStateString(brokerStatus?.toLowerCase());
  return fallback ?? (gapStatus === "missing" ? "pending" : "timed_out");
}

function normalizeOperatorReceiptStateString(value: string | undefined): A2AOperatorReceiptProjectionState | undefined {
  if (!value) return undefined;
  if (value === "accepted" || value === "queued" || value === "started" || value === "produced") return "accepted";
  if (value === "sent" || value === "provider_sent" || value === "provider-sent") return "sent";
  if (["provider_delivered", "provider-delivered", "provider-delivered-if-known", "delivered"].includes(value)) {
    return "provider-delivered-if-known";
  }
  if (["operator_visible", "operator-visible", "visible", "received", "receipt_confirmed", "confirmed", "operator_confirmed"].includes(value)) {
    return "operator-visible";
  }
  if (value === "timed_out" || value === "timeout" || value === "timed-out") return "timed_out";
  if (value === "stale" || value === "expired") return "stale";
  if (["failed", "failure", "error", "rejected", "undeliverable"].includes(value)) return "failed";
  return undefined;
}

function buildTerminalReceiptGapReason(
  status: A2ABrokerTerminalReceiptGapProjection["receiptGapStatus"],
): string {
  if (status === "confirmed") return "operator-visible receipt confirmed; terminal ack may be eligible";
  if (status === "failed") return "operator-visible receipt failed; terminal ack must remain blocked";
  if (status === "timed_out") return "operator-visible receipt timed out; terminal ack must remain blocked until refreshed";
  if (status === "stale") return "operator-visible receipt is stale; terminal ack must remain blocked until refreshed";
  if (status === "duplicate_suppressed") return "duplicate terminal notification was suppressed; terminal ack must remain blocked without receipt confirmation";
  return "terminal task/provider send lacks current-session visibility or manual operator receipt; terminal ack must remain blocked";
}

function normalizeOperatorVisibleReceiptState(
  status: A2ABrokerTerminalReceiptGapProjection["receiptGapStatus"],
): A2AOperatorVisibleTerminalReceiptState {
  if (status === "confirmed") return "receipt_confirmed";
  if (status === "timed_out") return "timed_out";
  if (status === "stale") return "stale";
  if (status === "failed") return "failed";
  if (status === "duplicate_suppressed") return "duplicate_suppressed";
  return "pending_receipt";
}

function buildOperatorReceiptLabel(state: A2AOperatorVisibleTerminalReceiptState): string {
  switch (state) {
    case "receipt_confirmed":
      return "receipt confirmed";
    case "timed_out":
      return "timed out receipt";
    case "stale":
      return "stale receipt";
    case "failed":
      return "failed receipt";
    case "duplicate_suppressed":
      return "duplicate suppressed";
    case "pending_receipt":
      return "pending receipt";
  }
}

function readProviderDeliveryState(
  roots: Record<string, unknown>[],
): Extract<A2AOperatorReceiptProjectionState, "accepted" | "sent" | "provider-delivered-if-known"> | undefined {
  for (const root of roots) {
    const state = normalizeOperatorReceiptStateString(firstString(
      root.providerDeliveryState,
      root.provider_delivery_state,
      root.providerDeliveryStatus,
      root.provider_delivery_status,
      root.providerSendStatus,
      root.provider_send_status,
      root.providerGatewaySendStatus,
      root.provider_gateway_send_status,
      root.terminalReceiptStatus,
      root.terminal_receipt_status,
      root.receiptStatus,
      root.receipt_status,
      root.status,
    )?.toLowerCase());
    if (state === "accepted" || state === "sent" || state === "provider-delivered-if-known") return state;
  }
  return undefined;
}

function readBrokerReceiptClassification(roots: Record<string, unknown>[]): string | undefined {
  for (const root of roots) {
    const classification = firstSafeString(
      root.receiptClassification,
      root.receipt_classification,
      root.operatorReceiptState,
      root.operator_receipt_state,
      root.terminalReceiptState,
      root.terminal_receipt_state,
      root.decision,
    );
    if (classification) return classification;
  }
  return undefined;
}

export function buildBrokerBuildInfoMetadata(
  health: unknown,
): A2ABrokerBuildInfoMetadata {
  const version = firstSafeBuildString(
    "version",
    getNested(health, ["buildInfo", "version"]),
    getNested(health, ["build", "version"]),
    getNested(health, ["release", "version"]),
    isPlainRecord(health) ? health.version : undefined,
  ) ?? "unknown";
  const revision = firstSafeBuildString(
    "revision",
    getNested(health, ["buildInfo", "revision"]),
    getNested(health, ["build", "revision"]),
    getNested(health, ["build", "commit"]),
    getNested(health, ["git", "revision"]),
    getNested(health, ["git", "sha"]),
    isPlainRecord(health) ? health.revision : undefined,
  ) ?? "unknown";
  const image = firstSafeBuildString(
    "image",
    getNested(health, ["buildInfo", "image"]),
    getNested(health, ["build", "image"]),
    getNested(health, ["container", "image"]),
    getNested(health, ["docker", "image"]),
    isPlainRecord(health) ? health.image : undefined,
  ) ?? "unknown";

  return {
    source: "broker.health",
    version,
    revision,
    image,
  };
}

export function buildBrokerRuntimeOwnerMetadata(
  health: unknown,
): A2ABrokerRuntimeOwnerMetadata | undefined {
  if (!isPlainRecord(health)) return undefined;

  const manager = firstSafeString(
    health.runtimeManager,
    health.manager,
    health.supervisor,
    health.orchestrator,
    getNested(health, ["runtimeOwner", "manager"]),
    getNested(health, ["runtime", "manager"]),
    getNested(health, ["process", "manager"]),
  );
  const service = firstSafeString(
    health.service,
    getNested(health, ["runtimeOwner", "service"]),
    getNested(health, ["runtime", "service"]),
  );
  const unit = firstSafeString(
    health.unit,
    health.systemdUnit,
    getNested(health, ["runtimeOwner", "unit"]),
    getNested(health, ["runtime", "unit"]),
  );
  const composeProject = firstSafeString(
    health.composeProject,
    getNested(health, ["runtimeOwner", "composeProject"]),
    getNested(health, ["runtime", "composeProject"]),
    getNested(health, ["docker", "composeProject"]),
  );
  const composeService = firstSafeString(
    health.composeService,
    getNested(health, ["runtimeOwner", "composeService"]),
    getNested(health, ["runtime", "composeService"]),
    getNested(health, ["docker", "composeService"]),
  );
  const containerName = firstSafeString(
    health.containerName,
    getNested(health, ["runtimeOwner", "containerName"]),
    getNested(health, ["runtime", "containerName"]),
    getNested(health, ["docker", "containerName"]),
  );

  if (!manager && !unit && !composeProject && !composeService && !containerName) {
    return undefined;
  }

  return {
    ...(manager ? { manager } : {}),
    ...(service ? { service } : {}),
    ...(unit ? { unit } : {}),
    ...(composeProject ? { composeProject } : {}),
    ...(composeService ? { composeService } : {}),
    ...(containerName ? { containerName } : {}),
  };
}

export function buildBrokerAuditBottleneckWarning(
  health: unknown,
): A2ABrokerAuditBottleneckWarning | undefined {
  if (!isPlainRecord(health)) return undefined;

  const auditRows = firstFiniteNumber(
    health.auditRows,
    getNested(health, ["audit", "auditRows"]),
    getNested(health, ["audit", "rows"]),
    getNested(health, ["diagnostics", "auditRows"]),
  );
  const maxAuditEvents = firstFiniteNumber(
    health.maxAuditEvents,
    getNested(health, ["audit", "maxAuditEvents"]),
    getNested(health, ["config", "maxAuditEvents"]),
    getNested(health, ["diagnostics", "maxAuditEvents"]),
  );
  const heartbeatRatio = normalizeRatio(
    firstFiniteNumber(
      health.heartbeatRatio,
      getNested(health, ["audit", "heartbeatRatio"]),
      getNested(health, ["diagnostics", "heartbeatRatio"]),
    ),
  );
  const healthLatencyMs = firstFiniteNumber(
    health.healthLatencyMs,
    health.latencyMs,
    getNested(health, ["diagnostics", "healthLatencyMs"]),
  );
  const dominantEventType = firstSafeString(
    health.dominantEventType,
    getNested(health, ["audit", "dominantEventType"]),
    getNested(health, ["diagnostics", "dominantEventType"]),
  );

  const overLimit =
    auditRows !== undefined && maxAuditEvents !== undefined && auditRows > maxAuditEvents;
  const heartbeatHeavy = heartbeatRatio !== undefined && heartbeatRatio >= 0.8;
  const slowHealth = healthLatencyMs !== undefined && healthLatencyMs >= 1_000;

  if (!overLimit && !heartbeatHeavy && !slowHealth) return undefined;

  return {
    code: "broker_audit_bottleneck",
    severity: "warn",
    source: "broker.health",
    message:
      "Broker audit table may be a status bottleneck; verify audit retention/pruning and heartbeat volume.",
    ...(auditRows !== undefined ? { auditRows } : {}),
    ...(maxAuditEvents !== undefined ? { maxAuditEvents } : {}),
    ...(heartbeatRatio !== undefined ? { heartbeatRatio } : {}),
    ...(healthLatencyMs !== undefined ? { healthLatencyMs } : {}),
    ...(dominantEventType ? { dominantEventType } : {}),
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function firstArray(...values: unknown[]): unknown[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

function normalizeNoLiveReceiptState(value: string | undefined): A2ABrokerNoLiveRehearsalProjection["receiptStates"][number]["state"] {
  return normalizeOperatorReceiptStateString(value?.toLowerCase()) ?? "pending";
}

function normalizeFindingStatus(value: string | undefined): "pass" | "blocked" {
  const normalized = value?.toLowerCase();
  return normalized === "pass" || normalized === "passed" || normalized === "ok" || normalized === "ready" ? "pass" : "blocked";
}

function buildNoLiveReceiptReason(state: A2ABrokerNoLiveRehearsalProjection["receiptStates"][number]["state"]): string {
  if (state === "operator-visible") return "operator-visible receipt evidence was projected without terminal ACK";
  if (state === "sent") return "provider send is projected only and is not terminal ACK evidence";
  if (state === "provider-delivered-if-known") return "provider delivery is informational only and is not operator-visible ACK evidence";
  if (state === "failed") return "receipt failed; terminal ACK remains blocked";
  if (state === "stale" || state === "timed_out") return "receipt is not fresh; terminal ACK remains blocked";
  return "receipt is pending in no-live rehearsal projection";
}

function normalizeEvidenceKind(value: string | undefined): A2ABrokerLiveReadinessProjection["evidenceAcceptance"][number]["kind"] {
  const normalized = value?.toLowerCase();
  if (normalized === "pr" || normalized === "pull_request" || normalized === "pull-request") return "PR";
  if (normalized === "done") return "Done";
  if (normalized === "block" || normalized === "blocked") return "Block";
  return "missing_evidence";
}

function normalizeEvidenceAcceptanceStatus(
  value: string | undefined,
  kind: A2ABrokerLiveReadinessProjection["evidenceAcceptance"][number]["kind"],
): A2ABrokerLiveReadinessProjection["evidenceAcceptance"][number]["status"] {
  const normalized = value?.toLowerCase();
  if (["accepted", "pass", "passed", "ok", "valid", "present"].includes(normalized ?? "")) return "accepted";
  if (["missing", "absent", "not_found", "no_evidence"].includes(normalized ?? "") || kind === "missing_evidence") return "missing";
  return "blocked";
}

function buildEvidenceAcceptanceMessage(
  kind: A2ABrokerLiveReadinessProjection["evidenceAcceptance"][number]["kind"],
  status: A2ABrokerLiveReadinessProjection["evidenceAcceptance"][number]["status"],
): string {
  if (status === "accepted") return `${kind} evidence accepted by broker verifier`;
  if (status === "missing") return "required PR/Done/Block evidence is missing";
  return `${kind} evidence was not accepted by broker verifier`;
}

function firstNonNegativeInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  }
  return undefined;
}

function firstSafeUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/(?:issues|pull)\/\d+(?:#issuecomment-\d+)?$/.test(trimmed)) return trimmed;
  }
  return undefined;
}

function firstSafeReason(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const redacted = redactUnsafeText(value.trim());
    if (redacted) return redacted.slice(0, 180);
  }
  return undefined;
}

function redactUnsafeText(value: string): string {
  return value
    .replace(new RegExp(String.fromCharCode(96, 96, 96) + "[\\s\\S]*?" + String.fromCharCode(96, 96, 96), "g"), "[redacted]")
    .replace(/\b(api[_ -]?key|token|secret|password|authorization|bearer)\b\s*[:=]\s*[^\s,;]+/gi, "$1: [redacted]")
    .replace(/\b(rawPrompt|raw_prompt|prompt|sessionText|sessionContent)\b\s*[:=]\s*[^\n]+/gi, "$1: [redacted]")
    .replace(/\/(?:home|root|Users)\/[^\s,;]+/g, "[redacted-path]")
    .trim();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNested(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isPlainRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function normalizeRatio(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value > 1 ? value / 100 : value;
}

function firstSafeBuildString(kind: "version" | "revision" | "image", ...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > buildInfoMaxLength(kind)) continue;
    if (looksSensitive(trimmed)) continue;
    if (kind === "version" && /^[a-zA-Z0-9._:+-]{1,80}$/.test(trimmed)) return trimmed;
    if (kind === "revision" && /^[a-zA-Z0-9._:-]{4,80}$/.test(trimmed)) return trimmed;
    if (kind === "image" && /^[a-zA-Z0-9._:/@+-]{1,160}$/.test(trimmed)) return trimmed;
  }
  return undefined;
}

function buildInfoMaxLength(kind: "version" | "revision" | "image"): number {
  return kind === "image" ? 160 : 80;
}

function looksSensitive(value: string): boolean {
  return (
    /(?:token|secret|password|api[_-]?key)=/i.test(value) ||
    /(?:^|[/:._-])(?:token|secret|password|api[_-]?key)(?:$|[/:._-])/i.test(value) ||
    /^\/(?:home|root|Users)\//.test(value)
  );
}

function firstSafeString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (/^[a-zA-Z0-9_.:-]{1,80}$/.test(trimmed)) return trimmed;
  }
  return undefined;
}
