import {
  resolveA2ABrokerAdapterPluginConfig,
  type A2ABrokerAdapterPluginRuntimeConfig,
} from "../config.js";
import type { A2AOperatorTerminalNotificationEnvelope } from "./operator-terminal-notifier.js";

type UnknownRecord = Record<string, unknown>;

type OperatorNotificationTarget = {
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string | number;
};

type OperatorNotificationOutboundAdapter = {
  sendText?: (payload: UnknownRecord) => Promise<unknown> | unknown;
  capabilities?: UnknownRecord;
  receiptCapabilities?: UnknownRecord;
  supportsReceipt?: (receiptMode: "current_session_visible") => boolean | Promise<boolean>;
  supportsCurrentSessionVisibleReceipt?: boolean;
  supportsUserVisibleReceipt?: boolean;
  currentSessionVisibleReceipt?: boolean;
  userVisibleReceipt?: boolean;
};

type OperatorNotificationRuntime = {
  channel?: {
    outbound?: {
      loadAdapter?: (channel: never) => Promise<OperatorNotificationOutboundAdapter | undefined>;
    };
  };
};

export type A2AOperatorNotificationReceiptConfirmationSource =
  | "current_session_visible"
  | "manual_operator_receipt"
  | "dry_run_projection";

export type A2AOperatorNotificationDeliveryReceipt = {
  dedupeKey: string;
  channel: string;
  to: string;
  deliveredAt: string;
  confirmationSource: A2AOperatorNotificationReceiptConfirmationSource;
  dryRun?: boolean;
};

export type A2AOperatorNotificationDeliveryFailure = {
  dedupeKey: string;
  code: "runtime_adapter_unavailable" | "receipt_runtime_unsupported" | "receipt_confirmation_missing";
  reason: string;
};

export type A2AOperatorNotificationAdapter = {
  notify(envelope: A2AOperatorTerminalNotificationEnvelope): Promise<A2AOperatorNotificationDeliveryReceipt | undefined>;
  listReceipts(): A2AOperatorNotificationDeliveryReceipt[];
  getLastFailure(dedupeKey: string): A2AOperatorNotificationDeliveryFailure | undefined;
};

export type A2AOperatorNotificationPreflightCheck = {
  code:
    | "plugin_activation"
    | "operator_events_enabled"
    | "notification_target"
    | "runtime_adapter"
    | "receipt_runtime";
  ok: boolean;
  message: string;
  severity: "info" | "error";
};

export type A2AOperatorNotificationTargetState = {
  status: "ready" | "disabled" | "missing" | "blocked";
  enabled: boolean;
  configured: boolean;
  channel?: string;
  to?: string;
  reason: string;
};

export type A2AOperatorNotificationPreflightResult = {
  ok: boolean;
  safeToRestartGateway: boolean;
  notificationTarget: A2AOperatorNotificationTargetState;
  target?: OperatorNotificationTarget;
  checks: A2AOperatorNotificationPreflightCheck[];
};

const MAX_RECEIPTS = 250;

export function createA2AOperatorNotificationAdapter(
  config: A2ABrokerAdapterPluginRuntimeConfig,
  runtime: unknown,
  deps: { now?: () => number } = {},
): A2AOperatorNotificationAdapter | undefined {
  const target = resolveOperatorNotificationTarget(config);
  if (!target) {
    return undefined;
  }

  const safeRuntime = runtime as OperatorNotificationRuntime | undefined;
  const delivered = new Map<string, A2AOperatorNotificationDeliveryReceipt>();
  const failures = new Map<string, A2AOperatorNotificationDeliveryFailure>();
  const now = deps.now ?? Date.now;
  const recordFailure = (
    envelope: A2AOperatorTerminalNotificationEnvelope,
    code: A2AOperatorNotificationDeliveryFailure["code"],
    reason: string,
  ): undefined => {
    failures.set(envelope.dedupeKey, { dedupeKey: envelope.dedupeKey, code, reason });
    if (failures.size > MAX_RECEIPTS) {
      const oldest = failures.keys().next().value;
      if (oldest) failures.delete(oldest);
    }
    return undefined;
  };

  return {
    async notify(envelope) {
      const existing = delivered.get(envelope.dedupeKey);
      if (existing) {
        return existing;
      }

      let confirmationSource: A2AOperatorNotificationReceiptConfirmationSource;

      if (envelope.dryRun) {
        confirmationSource = "dry_run_projection";
      } else {
        const outbound = await safeRuntime?.channel?.outbound?.loadAdapter?.(target.channel as never);
        if (!outbound?.sendText) {
          return recordFailure(
            envelope,
            "runtime_adapter_unavailable",
            `runtime_adapter_unavailable: Gateway runtime ${target.channel} adapter does not expose sendText; terminal ACK remains receipt-gated`,
          );
        }
        if (!await adapterSupportsCurrentSessionVisibleReceipt(outbound)) {
          return recordFailure(
            envelope,
            "receipt_runtime_unsupported",
            `receipt_runtime_unsupported: Gateway runtime ${target.channel} adapter does not advertise current-session-visible receipt support; live provider send skipped and terminal ACK remains receipt-gated`,
          );
        }
        const providerResult = await outbound.sendText({
          cfg: config as never,
          channel: target.channel,
          to: target.to,
          text: renderOperatorNotificationText(envelope),
          delivery: {
            mode: "announce",
            channel: target.channel,
            to: target.to,
            ...(target.accountId ? { accountId: target.accountId } : {}),
            ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
          },
          receiptRequired: "current_session_visible",
          userVisibleReceiptRequired: true,
          ...(target.accountId ? { accountId: target.accountId } : {}),
          ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
        });
        const confirmed = readReceiptConfirmationSource(providerResult, target);
        if (!confirmed) {
          return recordFailure(
            envelope,
            "receipt_confirmation_missing",
            "receipt_confirmation_missing: provider send returned without current-session/manual receipt confirmation; terminal ACK remains receipt-gated",
          );
        }
        confirmationSource = confirmed;
      }

      const receipt: A2AOperatorNotificationDeliveryReceipt = {
        dedupeKey: envelope.dedupeKey,
        channel: target.channel,
        to: target.to,
        deliveredAt: new Date(now()).toISOString(),
        confirmationSource,
        ...(envelope.dryRun ? { dryRun: true } : {}),
      };

      failures.delete(envelope.dedupeKey);
      delivered.set(envelope.dedupeKey, receipt);
      if (delivered.size > MAX_RECEIPTS) {
        const oldest = delivered.keys().next().value;
        if (oldest) delivered.delete(oldest);
      }
      return receipt;
    },
    listReceipts() {
      return [...delivered.values()].map((receipt) => ({ ...receipt }));
    },
    getLastFailure(dedupeKey) {
      const failure = failures.get(dedupeKey);
      return failure ? { ...failure } : undefined;
    },
  };
}

export async function preflightA2AOperatorNotificationRuntime(
  config: A2ABrokerAdapterPluginRuntimeConfig,
  runtime: unknown,
): Promise<A2AOperatorNotificationPreflightResult> {
  const resolved = resolveA2ABrokerAdapterPluginConfig(config);
  const target = resolveOperatorNotificationTarget(config);
  const notificationTarget = buildOperatorNotificationTargetState(config, resolved, target);
  const checks: A2AOperatorNotificationPreflightCheck[] = [];

  checks.push({
    code: "plugin_activation",
    ok: resolved.enabled && resolved.explicitlyActivated,
    severity: resolved.enabled && resolved.explicitlyActivated ? "info" : "error",
    message: resolved.enabled && resolved.explicitlyActivated
      ? "a2a-broker-adapter is explicitly activated"
      : "set plugins.entries.a2a-broker-adapter.enabled=true or allowlist the plugin before restarting Gateway",
  });
  checks.push({
    code: "operator_events_enabled",
    ok: resolved.operatorEventsEnabled,
    severity: resolved.operatorEventsEnabled ? "info" : "error",
    message: resolved.operatorEventsEnabled
      ? "operatorEvents.enabled is true"
      : "set plugins.entries.a2a-broker-adapter.config.operatorEvents.enabled=true before terminal-outbox monitoring",
  });
  checks.push({
    code: "notification_target",
    ok: Boolean(target),
    severity: target ? "info" : "error",
    message: target
      ? `operatorEvents.notification resolves to ${target.channel}`
      : "set operatorEvents.enabled=true and operatorEvents.notification.enabled=true with notification.to or chatId; stale targets stay ignored while disabled",
  });

  let runtimeAdapterReady = true;
  let receiptRuntimeReady = true;
  if (target) {
    const adapterChecks = await preflightRuntimeAdapter(runtime, target.channel);
    checks.push(...adapterChecks);
    runtimeAdapterReady = adapterChecks.some((check) => check.code === "runtime_adapter" && check.ok);
    receiptRuntimeReady = adapterChecks.some((check) => check.code === "receipt_runtime" && check.ok);
  }

  const ok = checks.every((check) => check.ok);
  const finalNotificationTarget = target && (!runtimeAdapterReady || !receiptRuntimeReady)
    ? {
      ...notificationTarget,
      status: "blocked" as const,
      reason: !runtimeAdapterReady
        ? `operatorEvents.notification resolves to ${target.channel}, but no runtime route is available; preflight did not send a live message`
        : `operatorEvents.notification resolves to ${target.channel}, but runtime does not advertise current-session-visible receipt support; preflight did not send a live message`,
    }
    : notificationTarget;
  return {
    ok,
    safeToRestartGateway: ok,
    notificationTarget: finalNotificationTarget,
    ...(target ? { target } : {}),
    checks,
  };
}

function buildOperatorNotificationTargetState(
  config: A2ABrokerAdapterPluginRuntimeConfig,
  resolved: ReturnType<typeof resolveA2ABrokerAdapterPluginConfig>,
  target: OperatorNotificationTarget | undefined,
): A2AOperatorNotificationTargetState {
  if (target) {
    return {
      status: "ready",
      enabled: true,
      configured: true,
      channel: target.channel,
      to: target.to,
      reason: `operatorEvents.notification resolves to ${target.channel}; runtime preflight does not send live messages`,
    };
  }

  const pluginConfig = config.plugins?.entries?.["a2a-broker-adapter"]?.config;
  const operatorEvents = asRecord(pluginConfig?.operatorEvents);
  const notification = asRecord(operatorEvents?.notification) ?? asRecord(operatorEvents?.notify);
  const channel = readOptionalString(notification?.channel) ?? "telegram";
  const staleTo = readOptionalString(notification?.to) ?? readOptionalString(notification?.chatId);

  if (!resolved.enabled || !resolved.explicitlyActivated || !resolved.operatorEventsEnabled) {
    return {
      status: "blocked",
      enabled: false,
      configured: false,
      reason: "operator events are not fully enabled; notification targets are ignored until plugin and operatorEvents are active",
    };
  }

  if (!notification || notification.enabled !== true) {
    return {
      status: "disabled",
      enabled: false,
      configured: false,
      channel,
      reason: staleTo
        ? "operatorEvents.notification.enabled is not true; stale notification.to/chatId is ignored and no live send will occur"
        : "operatorEvents.notification.enabled is not true; no live notification target is active",
    };
  }

  return {
    status: "missing",
    enabled: true,
    configured: false,
    channel,
    reason: "operatorEvents.notification.enabled=true but notification.to/chatId is missing; terminal ACK remains receipt-gated",
  };
}

async function preflightRuntimeAdapter(
  runtime: unknown,
  channel: string,
): Promise<A2AOperatorNotificationPreflightCheck[]> {
  const safeRuntime = runtime as OperatorNotificationRuntime | undefined;
  const loadAdapter = safeRuntime?.channel?.outbound?.loadAdapter;
  if (!loadAdapter) {
    return [{
      code: "runtime_adapter",
      ok: false,
      severity: "error",
      message: "Gateway runtime channel outbound loader is unavailable; restart/live send is not ready",
    }];
  }

  try {
    const outbound = await loadAdapter(channel as never);
    if (outbound?.sendText) {
      const supportsReceipt = await adapterSupportsCurrentSessionVisibleReceipt(outbound);
      return [
        {
          code: "runtime_adapter",
          ok: true,
          severity: "info",
          message: `Gateway runtime can resolve ${channel} outbound adapter without sending a live message`,
        },
        {
          code: "receipt_runtime",
          ok: supportsReceipt,
          severity: supportsReceipt ? "info" : "error",
          message: supportsReceipt
            ? `Gateway runtime ${channel} adapter advertises current-session-visible receipt support without sending a live message`
            : `Gateway runtime ${channel} adapter does not advertise current-session-visible receipt support; live send remains approval-blocked`,
        },
      ];
    }
  } catch (error) {
    return [{
      code: "runtime_adapter",
      ok: false,
      severity: "error",
      message: `Gateway runtime failed to resolve ${channel} outbound adapter: ${error instanceof Error ? error.message : String(error)}`,
    }];
  }

  return [{
    code: "runtime_adapter",
    ok: false,
    severity: "error",
    message: `Gateway runtime ${channel} adapter does not expose sendText; live send remains approval-blocked`,
  }];
}

async function adapterSupportsCurrentSessionVisibleReceipt(
  outbound: OperatorNotificationOutboundAdapter,
): Promise<boolean> {
  if (outbound.supportsCurrentSessionVisibleReceipt === true || outbound.supportsUserVisibleReceipt === true) return true;
  if (outbound.currentSessionVisibleReceipt === true || outbound.userVisibleReceipt === true) return true;

  for (const capabilities of [outbound.capabilities, outbound.receiptCapabilities]) {
    if (!capabilities) continue;
    if (
      capabilities.currentSessionVisibleReceipt === true ||
      capabilities.current_session_visible === true ||
      capabilities.currentSessionVisible === true ||
      capabilities.userVisibleReceipt === true ||
      capabilities.user_visible_receipt === true
    ) {
      return true;
    }
    const receipt = asRecord(capabilities.receipt);
    if (
      receipt?.currentSessionVisible === true ||
      receipt?.currentSessionVisibleReceipt === true ||
      receipt?.current_session_visible === true ||
      receipt?.userVisibleReceipt === true
    ) {
      return true;
    }
  }

  if (outbound.supportsReceipt) {
    try {
      return await outbound.supportsReceipt("current_session_visible") === true;
    } catch {
      return false;
    }
  }

  return false;
}

export function renderOperatorNotificationText(
  envelope: A2AOperatorTerminalNotificationEnvelope,
): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (value: string | undefined): void => {
    const line = value?.trim();
    if (!line || seen.has(line)) return;
    seen.add(line);
    lines.push(line);
  };

  pushUnique(renderCompactOperatorNotificationTitle(envelope));
  pushUnique(renderCompactOperatorNotificationWorkLine(envelope));
  pushUnique(envelope.repo ? `Repo: ${envelope.repo}` : undefined);
  pushUnique(envelope.issueUrl ? `Issue: ${envelope.issueUrl}` : undefined);
  pushUnique(envelope.prUrl ? `PR: ${envelope.prUrl}` : undefined);
  pushUnique(envelope.doneUrl ? `Done: ${envelope.doneUrl}` : undefined);
  pushUnique(envelope.blockUrl ? `Block: ${envelope.blockUrl}` : undefined);
  return lines.join("\n");
}

function renderCompactOperatorNotificationTitle(
  envelope: A2AOperatorTerminalNotificationEnvelope,
): string {
  const worker = envelope.worker?.trim();
  const subject = worker ? `${worker} 작업` : "A2A 작업";
  if (envelope.type === "success") return `A2A Terminal Brief 완료: ${subject}`;
  if (envelope.type === "failure") return `A2A Terminal Brief 실패: ${subject}`;
  if (envelope.type === "block") return `A2A Terminal Brief 차단: ${subject}`;
  return `A2A Terminal Brief PR 알림: ${subject}`;
}

function renderCompactOperatorNotificationWorkLine(
  envelope: A2AOperatorTerminalNotificationEnvelope,
): string | undefined {
  const evidenceSummary = typeof envelope.evidence.summary === "string" ? envelope.evidence.summary : undefined;
  const summary = evidenceSummary ?? firstOperatorNotificationSummaryLine(envelope);
  if (!summary) return undefined;
  return `업무: ${summary}`;
}

function firstOperatorNotificationSummaryLine(
  envelope: A2AOperatorTerminalNotificationEnvelope,
): string | undefined {
  const ignoredPrefixes = ["A2A ", "Worker:", "Task:", "Dedupe:", "Receipt:", "Repo:", "Issue:", "PR:", "Done:", "Block:"];
  for (const candidate of envelope.text.split("\n")) {
    const line = candidate.trim();
    if (!line) continue;
    if (line === envelope.title) continue;
    if (ignoredPrefixes.some((prefix) => line.startsWith(prefix))) continue;
    return line;
  }
  return undefined;
}

export function resolveOperatorNotificationTarget(
  config: A2ABrokerAdapterPluginRuntimeConfig,
): OperatorNotificationTarget | undefined {
  const resolved = resolveA2ABrokerAdapterPluginConfig(config);
  if (!resolved.enabled || !resolved.explicitlyActivated || !resolved.operatorEventsEnabled) {
    return undefined;
  }

  const pluginConfig = config.plugins?.entries?.["a2a-broker-adapter"]?.config;
  const operatorEvents = asRecord(pluginConfig?.operatorEvents);
  const notification = asRecord(operatorEvents?.notification) ?? asRecord(operatorEvents?.notify);
  if (!notification || notification.enabled !== true) {
    return undefined;
  }

  const channel = readOptionalString(notification.channel) ?? "telegram";
  const to = readOptionalString(notification.to) ?? readOptionalString(notification.chatId);
  if (!to) {
    return undefined;
  }

  const accountId = readOptionalString(notification.accountId);
  const threadId = readOptionalString(notification.threadId) ?? readOptionalNumber(notification.threadId);
  return {
    channel,
    to,
    ...(accountId ? { accountId } : {}),
    ...(threadId !== undefined ? { threadId } : {}),
  };
}

function readReceiptConfirmationSource(
  value: unknown,
  target: OperatorNotificationTarget,
): A2AOperatorNotificationReceiptConfirmationSource | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const delivery = asRecord(record.delivery);
  const receipt = asRecord(record.receipt);
  const confirmation = asRecord(record.confirmation) ?? asRecord(delivery?.confirmation) ?? asRecord(receipt?.confirmation);
  const candidates = [record, delivery, receipt, confirmation].filter(Boolean) as UnknownRecord[];
  if (candidates.some((candidate) => !receiptTargetMatches(candidate, target))) {
    return undefined;
  }

  for (const candidate of candidates) {
    if (!receiptTargetMatches(candidate, target)) {
      continue;
    }
    if (candidateIsAcceptedButNotAcknowledged(candidate)) {
      continue;
    }
    if (
      candidate.currentSessionVisible === true ||
      candidate.current_session_visible === true ||
      candidate.userVisible === true ||
      candidate.user_visible === true ||
      candidate.visibleInCurrentSession === true ||
      candidate.visible_in_current_session === true
    ) {
      return "current_session_visible";
    }
    if (
      candidate.manualReceiptConfirmed === true ||
      candidate.manual_receipt_confirmed === true ||
      candidate.operatorReceiptConfirmed === true ||
      candidate.operator_receipt_confirmed === true ||
      candidate.receiptConfirmedByOperator === true ||
      candidate.receipt_confirmed_by_operator === true ||
      candidate.manual_operator_receipt === true
    ) {
      return "manual_operator_receipt";
    }
    const source =
      readOptionalString(candidate.confirmationSource) ??
      readOptionalString(candidate.confirmation_source) ??
      readOptionalString(candidate.source) ??
      readOptionalString(candidate.receiptProjection) ??
      readOptionalString(candidate.receipt_projection) ??
      readOptionalString(candidate.evidence) ??
      readOptionalString(candidate.terminalAckProjection) ??
      readOptionalString(candidate.terminal_ack_projection) ??
      readOptionalString(candidate.projection) ??
      readOptionalString(candidate.mode);
    const normalizedSource = normalizeReceiptConfirmationSource(source);
    if (normalizedSource) {
      const status = readOptionalString(candidate.status);
      if (!status || ["confirmed", "receipt_confirmed", "delivered", "visible", "operator_visible", "operator_confirmed", "received"].includes(status) || candidateHasExplicitAcknowledgement(candidate)) {
        return normalizedSource;
      }
    }
  }

  return undefined;
}

function normalizeReceiptConfirmationSource(value: string | undefined): A2AOperatorNotificationReceiptConfirmationSource | undefined {
  const normalized = value?.toLowerCase();
  if (normalized === "current_session_visible" || normalized === "operator_visible" || normalized === "operator-visible") {
    return "current_session_visible";
  }
  if (normalized === "manual_operator_receipt" || normalized === "operator_confirmed" || normalized === "operator-confirmed") {
    return "manual_operator_receipt";
  }
  return undefined;
}

function candidateHasExplicitAcknowledgement(candidate: UnknownRecord): boolean {
  return (
    readOptionalBoolean(candidate.acknowledged) ??
    readOptionalBoolean(candidate.operatorAcknowledged) ??
    readOptionalBoolean(candidate.operator_acknowledged) ??
    readOptionalBoolean(candidate.userVisibleAcknowledged) ??
    readOptionalBoolean(candidate.user_visible_acknowledged) ??
    readOptionalBoolean(candidate.receiptAcknowledged) ??
    readOptionalBoolean(candidate.receipt_acknowledged)
  ) === true;
}

function candidateIsAcceptedButNotAcknowledged(candidate: UnknownRecord): boolean {
  if (candidateHasExplicitAcknowledgement(candidate)) return false;

  const accepted =
    readOptionalBoolean(candidate.accepted) ??
    readOptionalBoolean(candidate.providerAccepted) ??
    readOptionalBoolean(candidate.provider_accepted) ??
    readOptionalBoolean(candidate.sendAccepted) ??
    readOptionalBoolean(candidate.send_accepted);
  const status = readOptionalString(candidate.status);
  return accepted === true || status === "accepted" || status === "queued" || status === "sent" || status === "provider_sent";
}

function receiptTargetMatches(candidate: UnknownRecord, target: OperatorNotificationTarget): boolean {
  const channel = readOptionalString(candidate.channel);
  if (channel && channel !== target.channel) {
    return false;
  }

  const to = readOptionalString(candidate.to) ?? readOptionalString(candidate.target) ?? readOptionalString(candidate.chatId);
  if (to && to !== target.to) {
    return false;
  }

  const accountId = readOptionalString(candidate.accountId);
  if (accountId && target.accountId && accountId !== target.accountId) {
    return false;
  }

  const threadId = readOptionalString(candidate.threadId) ?? readOptionalNumber(candidate.threadId)?.toString();
  if (threadId && target.threadId !== undefined && threadId !== String(target.threadId)) {
    return false;
  }

  return true;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}
