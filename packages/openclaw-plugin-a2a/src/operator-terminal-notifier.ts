type UnknownRecord = Record<string, unknown>;

export type A2AOperatorTerminalNotificationType = "success" | "failure" | "block" | "pr";
export type A2AOperatorTerminalReceiptProjection = "current_session_visible" | "manual_operator_receipt";

export type A2AOperatorTerminalNotificationEnvelope = {
  kind: "a2a.operator.notification";
  version: 1;
  id: string;
  dedupeKey: string;
  type: A2AOperatorTerminalNotificationType;
  severity: "info" | "warn" | "error";
  deliveryOwner: "openclaw.plugin-notifier";
  deliveryTarget: "operator-main-session";
  title: string;
  text: string;
  evidence: A2AOperatorNotificationEvidence;
  taskId?: string;
  worker?: string;
  status?: string;
  repo?: string;
  issueUrl?: string;
  prUrl?: string;
  doneUrl?: string;
  blockUrl?: string;
  runId?: string;
  traceId?: string;
  createdAt?: string;
  dryRun?: boolean;
};

export type A2AOperatorNotificationEvidence = {
  schema: "a2a.operator.notification.evidence";
  version: 1;
  taskId?: string;
  worker?: string;
  status?: string;
  repo?: string;
  issueUrl?: string;
  prUrl?: string;
  doneUrl?: string;
  blockUrl?: string;
  runId?: string;
  traceId?: string;
  summary?: string;
  taskDescription?: string;
  createdAt?: string;
  receiptProjection?: A2AOperatorTerminalReceiptProjection;
};

export type A2AOpenClawTelegramOperatorNotification = {
  kind: "openclaw.operator.telegram_notification";
  version: 1;
  dedupeKey: string;
  dryRun?: true;
  delivery: {
    mode: "announce";
    channel: "telegram";
  };
  title: string;
  text: string;
  evidence: A2AOperatorNotificationEvidence;
};

export type A2AOperatorReleaseDriftStatus = "current" | "stale" | "unknown";

export type A2AOperatorReleaseDriftItem = {
  id: string;
  status: A2AOperatorReleaseDriftStatus;
  revision?: string;
  expectedRevision?: string;
};

export type A2AOperatorReleaseDriftSummary = {
  kind: "a2a.operator.release-drift";
  status: A2AOperatorReleaseDriftStatus;
  text: string;
  broker: A2AOperatorReleaseDriftItem;
  workers: A2AOperatorReleaseDriftItem[];
};

export type A2AOperatorTerminalNotificationBuildOptions = {
  maxTextChars?: number;
  dryRun?: boolean;
};

export type A2ATelegramSafeDryRunNotificationHarness = {
  notify(envelope: A2AOperatorTerminalNotificationEnvelope): void;
  list(): A2AOperatorTerminalNotificationEnvelope[];
  listTelegram(): A2AOpenClawTelegramOperatorNotification[];
  stats(): {
    accepted: number;
    dropped: number;
    maxNotifications: number;
  };
};

export type A2ATelegramSafeDryRunNotificationHarnessOptions = {
  /**
   * Upper bound for retained dry-run notifications. This is a local safety
   * fuse for replay storms; the harness never sends to Telegram.
   */
  maxNotifications?: number;
};

const DEFAULT_MAX_TEXT_CHARS = 900;

const URL_SECRET_RE = /([?&](?:token|secret|password|key|api_key)=)[^&\s]+/gi;
const BEARER_RE = /\b(?:bearer|token)\s+[a-z0-9._~+/=-]{12,}/gi;
const SECRET_ASSIGN_RE = /\b(?:token|secret|password|api[_-]?key)=\S+/gi;
const PRIVATE_PATH_RE = /\/(?:home|root|Users)\/[^\s),;]+/g;

export function buildA2AOperatorTerminalOutboxNotificationEnvelope(
  outbox: UnknownRecord,
  options: A2AOperatorTerminalNotificationBuildOptions = {},
): A2AOperatorTerminalNotificationEnvelope | undefined {
  const payload = asRecord(outbox.payload);
  if (!payload) return undefined;
  const type = readNotificationType(payload);
  if (!type) return undefined;

  const taskId = readString(payload.taskId);
  const worker = readWorker(payload);
  const status = readStatus(payload);
  const repo = readRepo(payload);
  const issueNumber = typeof payload.issue === "number" && Number.isFinite(payload.issue) ? payload.issue : undefined;
  const issueUrl = repo && issueNumber !== undefined ? `https://github.com/${repo}/issues/${issueNumber}` : readIssueUrl(payload);
  const prUrl = readPrUrl(payload);
  const doneUrl = readDoneUrl(payload);
  const blockUrl = readBlockUrl(payload);
  const runId = readRunId(payload, outbox);
  const traceId = readTraceId(payload, outbox);
  const createdAt = readString(payload.completedAt) ?? readString(payload.updatedAt) ?? readString(payload.createdAt) ?? readString(outbox.createdAt);
  const summary = readString(payload.testSummary) ?? readString(payload.summary) ?? readString(payload.message);
  const safeSummary = summary ? clampText(redactText(summary), 240) : undefined;
  const taskDescription = readTaskDescription(payload, asRecord(payload.task), asRecord(payload.metadata));
  const safeTaskDescription = taskDescription ? clampText(redactText(taskDescription), 180) : undefined;
  const title = buildTitle(type, taskId, prUrl);
  const evidence = compactEvidence({
    taskId,
    worker,
    status,
    repo,
    issueUrl,
    prUrl,
    doneUrl,
    blockUrl,
    runId,
    traceId,
    summary: safeSummary,
    taskDescription: safeTaskDescription,
    createdAt,
  });
  const text = clampText(
    redactText(
      [
        title,
        safeSummary,
        renderWorkerTaskCompletionLine({ type, worker, taskId, taskDescription: safeTaskDescription }),
        worker ? `Worker: ${worker}` : undefined,
        safeTaskDescription && !taskId ? `Task: ${safeTaskDescription}` : undefined,
        repo ? `Repo: ${repo}` : undefined,
        issueUrl ? `Issue: ${issueUrl}` : undefined,
        prUrl ? `PR: ${prUrl}` : undefined,
        doneUrl ? `Done: ${doneUrl}` : undefined,
        blockUrl ? `Block: ${blockUrl}` : undefined,
        runId ? `Run: ${runId}` : undefined,
        traceId ? `Trace: ${traceId}` : undefined,
      ].filter(Boolean).join("\n"),
    ),
    Math.max(120, options.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS),
  );
  const eventId = readString(outbox.id);
  const dedupeKey = buildDedupeKey({ eventId, taskId, type, createdAt, prUrl });
  if (!dedupeKey) return undefined;

  return {
    kind: "a2a.operator.notification",
    version: 1,
    id: `operator-notify:${dedupeKey}`,
    dedupeKey,
    type,
    severity: type === "failure" ? "error" : type === "block" ? "warn" : "info",
    deliveryOwner: "openclaw.plugin-notifier",
    deliveryTarget: "operator-main-session",
    title,
    text,
    evidence,
    ...(taskId ? { taskId } : {}),
    ...(worker ? { worker } : {}),
    ...(status ? { status } : {}),
    ...(repo ? { repo } : {}),
    ...(issueUrl ? { issueUrl } : {}),
    ...(prUrl ? { prUrl } : {}),
    ...(doneUrl ? { doneUrl } : {}),
    ...(blockUrl ? { blockUrl } : {}),
    ...(runId ? { runId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(options.dryRun ? { dryRun: true } : {}),
  };
}

export function buildA2AOperatorTerminalNotificationEnvelope(
  event: { id?: string; name?: string; data?: unknown },
  options: A2AOperatorTerminalNotificationBuildOptions = {},
): A2AOperatorTerminalNotificationEnvelope | undefined {
  const data = asRecord(event.data) ?? asRecord(event);
  if (!data) {
    return undefined;
  }

  const terminal = asRecord(data.terminalEvent) ?? asRecord(data.event) ?? data;
  const type = readNotificationType(terminal);
  if (!type) {
    return undefined;
  }

  const task = asRecord(terminal.task) ?? asRecord(data.task);
  const metadata = asRecord(task?.metadata) ?? asRecord(terminal.metadata) ?? {};
  const taskId = readString(terminal.taskId) ?? readString(task?.id) ?? readString(metadata.taskId);
  const worker = readWorker(terminal, task, metadata);
  const status = readStatus(terminal, task);
  const createdAt =
    readString(terminal.createdAt) ?? readString(terminal.timestamp) ?? readString(task?.status && asRecord(task.status)?.timestamp);
  const prUrl = readPrUrl(terminal) ?? readPrUrl(metadata) ?? readPrUrl(task ?? {});
  const repo = readRepo(terminal) ?? readRepo(metadata) ?? readRepo(task ?? {});
  const issueNumber = readIssueNumber(terminal) ?? readIssueNumber(metadata) ?? readIssueNumber(task ?? {});
  const issueUrl = repo && issueNumber !== undefined
    ? `https://github.com/${repo}/issues/${issueNumber}`
    : readIssueUrl(terminal) ?? readIssueUrl(metadata) ?? readIssueUrl(task ?? {});
  const doneUrl = readDoneUrl(terminal) ?? readDoneUrl(metadata) ?? readDoneUrl(task ?? {});
  const blockUrl = readBlockUrl(terminal) ?? readBlockUrl(metadata) ?? readBlockUrl(task ?? {});
  const runId = readRunId(terminal, metadata, task, data);
  const traceId = readTraceId(terminal, metadata, task, data);
  const releaseDrift = buildA2AOperatorReleaseDriftSummary([terminal, metadata, task, data]);
  const receiptProjection = readOperatorReceiptProjection(terminal, metadata, task, data);
  if (!receiptProjection) {
    return undefined;
  }
  const summary =
    readString(terminal.summary) ??
    readString(terminal.message) ??
    readStatusMessage(task) ??
    readString(asRecord(terminal.error)?.message) ??
    readString(asRecord(task?.status)?.state);
  const safeSummary = summary ? clampText(redactText(summary), 240) : undefined;
  const taskDescription = readTaskDescription(terminal, metadata, task, asRecord(task?.payload), data);
  const safeTaskDescription = taskDescription ? clampText(redactText(taskDescription), 180) : undefined;

  const title = buildTitle(type, taskId, prUrl);
  const releaseLine = releaseDrift ? `Release: ${releaseDrift.text}` : undefined;
  const evidence = compactEvidence({
    taskId,
    worker,
    status,
    repo,
    issueUrl,
    prUrl,
    doneUrl,
    blockUrl,
    runId,
    traceId,
    summary: safeSummary,
    taskDescription: safeTaskDescription,
    createdAt,
    receiptProjection,
  });
  const text = clampText(
    redactText(
      [
        title,
        releaseLine,
        summary,
        `Receipt: ${receiptProjection}`,
        renderWorkerTaskCompletionLine({ type, worker, taskId, taskDescription: safeTaskDescription }),
        worker ? `Worker: ${worker}` : undefined,
        safeTaskDescription && !taskId ? `Task: ${safeTaskDescription}` : undefined,
        repo ? `Repo: ${repo}` : undefined,
        issueUrl ? `Issue: ${issueUrl}` : undefined,
        prUrl ? `PR: ${prUrl}` : undefined,
        doneUrl ? `Done: ${doneUrl}` : undefined,
        blockUrl ? `Block: ${blockUrl}` : undefined,
        runId ? `Run: ${runId}` : undefined,
        traceId ? `Trace: ${traceId}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    Math.max(120, options.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS),
  );
  const dedupeKey = buildDedupeKey({
    eventId: event.id ?? readString(terminal.id) ?? readString(data.id),
    taskId,
    type,
    createdAt,
    prUrl,
  });

  return {
    kind: "a2a.operator.notification",
    version: 1,
    id: `operator-notify:${dedupeKey}`,
    dedupeKey,
    type,
    severity: type === "failure" ? "error" : type === "block" ? "warn" : "info",
    deliveryOwner: "openclaw.plugin-notifier",
    deliveryTarget: "operator-main-session",
    title,
    text,
    evidence,
    ...(taskId ? { taskId } : {}),
    ...(worker ? { worker } : {}),
    ...(status ? { status } : {}),
    ...(repo ? { repo } : {}),
    ...(issueUrl ? { issueUrl } : {}),
    ...(prUrl ? { prUrl } : {}),
    ...(doneUrl ? { doneUrl } : {}),
    ...(blockUrl ? { blockUrl } : {}),
    ...(runId ? { runId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(options.dryRun ? { dryRun: true } : {}),
  };
}

export function buildA2AOpenClawTelegramOperatorNotification(
  envelope: A2AOperatorTerminalNotificationEnvelope,
): A2AOpenClawTelegramOperatorNotification {
  return {
    kind: "openclaw.operator.telegram_notification",
    version: 1,
    dedupeKey: envelope.dedupeKey,
    ...(envelope.dryRun ? { dryRun: true } : {}),
    delivery: {
      mode: "announce",
      channel: "telegram",
    },
    title: envelope.title,
    text: envelope.text,
    evidence: envelope.evidence,
  };
}

export function buildA2AOperatorReleaseDriftSummary(
  payload: unknown,
): A2AOperatorReleaseDriftSummary | undefined {
  const roots = Array.isArray(payload)
    ? payload.flatMap((value) => buildReleaseDriftRoots(value))
    : buildReleaseDriftRoots(payload);

  for (const root of roots) {
    const release = asRecord(root.release);
    const brokerRecord = firstRecord(root.broker, root.brokerRelease, root.brokerStatus, release?.broker);
    const workerRecords = readWorkerReleaseRecords(root);
    if (!brokerRecord && workerRecords.length === 0) {
      continue;
    }

    const broker = normalizeReleaseDriftItem("broker", brokerRecord ?? root, true);
    const workers = workerRecords.map(([id, record]) => normalizeReleaseDriftItem(id, record, false));
    const status = combineReleaseDriftStatus([broker, ...workers]);
    const text = renderA2AOperatorReleaseDriftSummary({ broker, workers });
    return {
      kind: "a2a.operator.release-drift",
      status,
      text,
      broker,
      workers,
    };
  }

  return undefined;
}

export function renderA2AOperatorReleaseDriftSummary(params: {
  broker: A2AOperatorReleaseDriftItem;
  workers: A2AOperatorReleaseDriftItem[];
}): string {
  const workerText = params.workers.length
    ? params.workers.map(renderReleaseDriftItem).join(", ")
    : "none";
  return clampText(`broker ${renderReleaseDriftItem(params.broker).replace(/^broker /, "")}; workers ${workerText}`, 360);
}

export function createA2AOperatorDryRunNotifier(): {
  notify(envelope: A2AOperatorTerminalNotificationEnvelope): void;
  list(): A2AOperatorTerminalNotificationEnvelope[];
} {
  const harness = createA2ATelegramSafeDryRunNotificationHarness();
  return {
    notify: harness.notify,
    list: harness.list,
  };
}

export function createA2ATelegramSafeDryRunNotificationHarness(
  options: A2ATelegramSafeDryRunNotificationHarnessOptions = {},
): A2ATelegramSafeDryRunNotificationHarness {
  const maxNotifications = Math.max(1, Math.floor(options.maxNotifications ?? 100));
  const envelopes: A2AOperatorTerminalNotificationEnvelope[] = [];
  const telegram: A2AOpenClawTelegramOperatorNotification[] = [];
  let dropped = 0;

  function cloneEnvelope(envelope: A2AOperatorTerminalNotificationEnvelope): A2AOperatorTerminalNotificationEnvelope {
    return {
      ...envelope,
      dryRun: true,
      evidence: { ...envelope.evidence },
    };
  }

  function cloneTelegram(notification: A2AOpenClawTelegramOperatorNotification): A2AOpenClawTelegramOperatorNotification {
    return {
      ...notification,
      delivery: { ...notification.delivery },
      evidence: { ...notification.evidence },
    };
  }

  return {
    notify(envelope) {
      if (envelopes.length >= maxNotifications) {
        dropped += 1;
        return;
      }
      const dryRunEnvelope = cloneEnvelope(envelope);
      envelopes.push(dryRunEnvelope);
      telegram.push(buildA2AOpenClawTelegramOperatorNotification(dryRunEnvelope));
    },
    list() {
      return envelopes.map(cloneEnvelope);
    },
    listTelegram() {
      return telegram.map(cloneTelegram);
    },
    stats() {
      return {
        accepted: envelopes.length,
        dropped,
        maxNotifications,
      };
    },
  };
}



export function getA2AOperatorTerminalReceiptGate(
  event: { data?: unknown } | unknown,
): { isTerminal: boolean; receiptProjection?: A2AOperatorTerminalReceiptProjection } {
  const data = asRecord(asRecord(event)?.data) ?? asRecord(event);
  if (!data) {
    return { isTerminal: false };
  }
  const terminal = asRecord(data.terminalEvent) ?? asRecord(data.event) ?? data;
  if (!readNotificationType(terminal)) {
    return { isTerminal: false };
  }
  const task = asRecord(terminal.task) ?? asRecord(data.task);
  const metadata = asRecord(task?.metadata) ?? asRecord(terminal.metadata) ?? {};
  const receiptProjection = readOperatorReceiptProjection(terminal, metadata, task, data);
  return {
    isTerminal: true,
    ...(receiptProjection ? { receiptProjection } : {}),
  };
}

function buildReleaseDriftRoots(value: unknown): UnknownRecord[] {
  const record = asRecord(value);
  if (!record) return [];
  const keys = ["releaseDrift", "release", "drift", "versionStatus", "operatorStatus", "snapshot", "summary", "liveSummary"];
  const roots: UnknownRecord[] = [record];
  for (let index = 0; index < roots.length; index += 1) {
    for (const key of keys) {
      const nested = asRecord(roots[index][key]);
      if (nested && !roots.includes(nested)) roots.push(nested);
    }
  }
  return roots;
}

function readWorkerReleaseRecords(root: UnknownRecord): Array<[string, UnknownRecord]> {
  const release = asRecord(root.release);
  const value = root.workers ?? root.workerRevisions ?? root.runnerRevisions ?? root.runners ?? root.fleet ?? release?.workers;
  if (Array.isArray(value)) {
    return value
      .map(asRecord)
      .filter((record): record is UnknownRecord => Boolean(record))
      .map((record, index) => [readWorkerId(record) ?? `worker-${index + 1}`, record]);
  }
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record)
    .map(([id, worker]) => [id, asRecord(worker)] as const)
    .filter((entry): entry is readonly [string, UnknownRecord] => Boolean(entry[1]))
    .map(([id, worker]) => [readWorkerId(worker) ?? id, worker]);
}

function normalizeReleaseDriftItem(
  fallbackId: string,
  record: UnknownRecord,
  broker: boolean,
): A2AOperatorReleaseDriftItem {
  const id = broker ? "broker" : (readWorkerId(record) ?? fallbackId);
  const revision = firstSafeRevision(
    record.revision,
    record.currentRevision,
    record.deployedRevision,
    record.runnerRevision,
    record.commit,
    record.sha,
    record.version,
  );
  const expectedRevision = firstSafeRevision(
    record.expectedRevision,
    record.latestRevision,
    record.mainRevision,
    record.targetRevision,
    record.githubMainRevision,
    record.runnerMainRevision,
  );
  const status = normalizeReleaseDriftStatus(record.status, record.state, record.drift, revision, expectedRevision);
  return {
    id: sanitizeLabel(id) ?? fallbackId,
    status,
    ...(revision ? { revision } : {}),
    ...(expectedRevision ? { expectedRevision } : {}),
  };
}

function normalizeReleaseDriftStatus(
  ...values: unknown[]
): A2AOperatorReleaseDriftStatus {
  const revision = values.at(-2);
  const expectedRevision = values.at(-1);
  for (const value of values.slice(0, -2)) {
    const text = readString(value)?.toLowerCase();
    if (!text) continue;
    if (["current", "ok", "up-to-date", "up_to_date", "match", "matched"].includes(text)) return "current";
    if (["stale", "behind", "drift", "drifted", "mismatch", "blocked"].includes(text)) return "stale";
    if (["unknown", "missing", "unreported", "null"].includes(text)) return "unknown";
  }
  if (!revision || !expectedRevision || typeof revision !== "string" || typeof expectedRevision !== "string") return "unknown";
  return revision === expectedRevision ? "current" : "stale";
}

function combineReleaseDriftStatus(items: A2AOperatorReleaseDriftItem[]): A2AOperatorReleaseDriftStatus {
  if (items.some((item) => item.status === "stale")) return "stale";
  if (items.some((item) => item.status === "unknown")) return "unknown";
  return "current";
}

function renderReleaseDriftItem(item: A2AOperatorReleaseDriftItem): string {
  const current = item.revision ? shortRevision(item.revision) : "?";
  const expected = item.expectedRevision ? shortRevision(item.expectedRevision) : undefined;
  const revisionText = expected && expected !== current ? `${current}→${expected}` : current;
  return `${item.id} ${item.status} ${revisionText}`;
}

function readWorkerId(record: UnknownRecord): string | undefined {
  return sanitizeLabel(firstString(record.workerId, record.nodeId, record.id, record.name));
}

function sanitizeLabel(value: unknown): string | undefined {
  const text = firstString(value);
  return text && /^[a-zA-Z0-9_.:-]{1,80}$/.test(text) ? text : undefined;
}

function firstSafeRevision(...values: unknown[]): string | undefined {
  const text = firstString(...values);
  if (!text || text === "null") return undefined;
  return /^[a-zA-Z0-9._:-]{4,80}$/.test(text) ? text : undefined;
}

function shortRevision(value: string): string {
  return /^[0-9a-f]{12,}$/i.test(value) ? value.slice(0, 12) : value;
}

function firstString(...values: unknown[]): string | undefined {
  return values.map(readString).find(Boolean);
}

function firstRecord(...values: unknown[]): UnknownRecord | undefined {
  return values.map(asRecord).find(Boolean);
}

function readNotificationType(record: UnknownRecord): A2AOperatorTerminalNotificationType | undefined {
  const task = asRecord(record.task);
  const status = asRecord(task?.status);
  const raw = [record.type, record.kind, record.reason, record.status, status?.state]
    .map(readString)
    .find(Boolean)
    ?.toLowerCase();

  if (!raw) return undefined;
  if (["success", "succeeded", "completed", "done"].includes(raw)) return "success";
  if (["failure", "failed", "error", "errored", "dead_lettered", "canceled", "cancelled"].includes(raw)) return "failure";
  if (["block", "blocked", "approval_required", "needs_approval", "waiting_on_operator"].includes(raw)) return "block";
  if (["pr", "pull_request", "pull-request", "pr_opened", "pr_created"].includes(raw)) return "pr";
  return undefined;
}

function buildTitle(type: A2AOperatorTerminalNotificationType, taskId?: string, prUrl?: string): string {
  const subject = taskId ? `task ${taskId}` : "terminal task";
  if (type === "success") return `A2A Terminal Brief 완료: ${subject}`;
  if (type === "failure") return `A2A Terminal Brief 실패: ${subject}`;
  if (type === "block") return `A2A Terminal Brief 차단: ${subject}`;
  return `A2A Terminal Brief PR: ${prUrl ?? subject}`;
}

function renderWorkerTaskCompletionLine(params: {
  type: A2AOperatorTerminalNotificationType;
  worker?: string;
  taskId?: string;
  taskDescription?: string;
}): string | undefined {
  if (!params.worker && !params.taskId && !params.taskDescription) {
    return undefined;
  }
  const worker = params.worker ?? "unknown worker";
  const task = params.taskId
    ? params.taskDescription
      ? `${params.taskId} — ${params.taskDescription}`
      : params.taskId
    : params.taskDescription ?? "unknown task";
  const verb = params.type === "success" || params.type === "pr" ? "completed" : "reported";
  return `Worker ${worker} ${verb} task: ${task}`;
}

function readTaskDescription(...records: Array<UnknownRecord | undefined>): string | undefined {
  for (const record of records) {
    if (!record) continue;
    const nestedRequest = asRecord(record.request);
    const nestedTask = asRecord(record.task);
    const direct = firstString(
      record.taskDescription,
      record.description,
      record.originalMessage,
      record.instructions,
      record.title,
      nestedRequest?.originalMessage,
      nestedRequest?.instructions,
      nestedTask?.taskDescription,
      nestedTask?.description,
      nestedTask?.originalMessage,
      nestedTask?.instructions,
      nestedTask?.title,
    );
    if (direct) return direct;
  }
  return undefined;
}

function buildDedupeKey(parts: {
  eventId?: string;
  taskId?: string;
  type: A2AOperatorTerminalNotificationType;
  createdAt?: string;
  prUrl?: string;
}): string {
  return [parts.eventId, parts.taskId, parts.type, parts.createdAt, parts.prUrl]
    .filter(Boolean)
    .join(":")
    .slice(0, 180);
}

function compactEvidence(values: Omit<A2AOperatorNotificationEvidence, "schema" | "version">): A2AOperatorNotificationEvidence {
  return {
    schema: "a2a.operator.notification.evidence",
    version: 1,
    ...(values.taskId ? { taskId: values.taskId } : {}),
    ...(values.worker ? { worker: values.worker } : {}),
    ...(values.status ? { status: values.status } : {}),
    ...(values.repo ? { repo: values.repo } : {}),
    ...(values.issueUrl ? { issueUrl: values.issueUrl } : {}),
    ...(values.prUrl ? { prUrl: values.prUrl } : {}),
    ...(values.doneUrl ? { doneUrl: values.doneUrl } : {}),
    ...(values.blockUrl ? { blockUrl: values.blockUrl } : {}),
    ...(values.runId ? { runId: values.runId } : {}),
    ...(values.traceId ? { traceId: values.traceId } : {}),
    ...(values.summary ? { summary: values.summary } : {}),
    ...(values.taskDescription ? { taskDescription: values.taskDescription } : {}),
    ...(values.createdAt ? { createdAt: values.createdAt } : {}),
    ...(values.receiptProjection ? { receiptProjection: values.receiptProjection } : {}),
  };
}


function readOperatorReceiptProjection(...records: Array<UnknownRecord | undefined>): A2AOperatorTerminalReceiptProjection | undefined {
  for (const record of records) {
    if (!record) continue;
    const receipt = asRecord(record.receipt);
    const ack = asRecord(record.ack);
    const operator = asRecord(record.operator);
    const evidence = asRecord(record.evidence);
    const projection = normalizeReceiptProjection(firstString(
      record.receiptProjection,
      record.operatorReceiptProjection,
      record.operatorVisibleProjection,
      record.ackProjection,
      record.visibilityProjection,
      receipt?.projection,
      receipt?.kind,
      ack?.projection,
      ack?.kind,
      operator?.receiptProjection,
      operator?.visibleProjection,
      evidence?.receiptProjection,
      evidence?.operatorVisibleProjection,
    ));
    if (projection) return projection;
  }
  return undefined;
}

function normalizeReceiptProjection(value: string | undefined): A2AOperatorTerminalReceiptProjection | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "current_session_visible" || normalized === "manual_operator_receipt") {
    return normalized;
  }
  return undefined;
}

function readWorker(...records: Array<UnknownRecord | undefined>): string | undefined {
  for (const record of records) {
    if (!record) continue;
    const worker = sanitizeLabel(firstString(record.worker, record.workerId, record.nodeId, asRecord(record.workerRef)?.id));
    if (worker) return worker;
  }
  return undefined;
}

function readStatus(terminal: UnknownRecord, task?: UnknownRecord): string | undefined {
  return sanitizeLabel(firstString(terminal.status, terminal.type, asRecord(task?.status)?.state, task?.status));
}

function readRepo(record: UnknownRecord): string | undefined {
  const github = asRecord(record.github);
  const repo = firstString(record.repo, record.repository, record.repositoryFullName, github?.repo, github?.repository);
  return repo && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]{1,100}$/.test(repo) ? repo : undefined;
}

function readPrUrl(record: UnknownRecord): string | undefined {
  return [record.prUrl, record.pullRequestUrl, record.htmlUrl, asRecord(record.github)?.prUrl]
    .map(readString)
    .find((value) => Boolean(value && /^https:\/\/github\.com\//.test(value)));
}

function readIssueUrl(record: UnknownRecord): string | undefined {
  return [record.issueUrl, record.githubIssueUrl, asRecord(record.github)?.issueUrl]
    .map(readString)
    .find(isSafeHttpUrl);
}

function readIssueNumber(record: UnknownRecord): number | undefined {
  const github = asRecord(record.github);
  const value = record.issue ?? record.issueNumber ?? github?.issue ?? github?.issueNumber;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readRunId(...records: Array<UnknownRecord | undefined>): string | undefined {
  for (const record of records) {
    if (!record) continue;
    const metadata = asRecord(record.metadata);
    const github = asRecord(record.github);
    const value = sanitizeLabel(firstString(record.runId, record.run, record.runName, metadata?.runId, metadata?.run, github?.runId));
    if (value) return value;
  }
  return undefined;
}

function readTraceId(...records: Array<UnknownRecord | undefined>): string | undefined {
  for (const record of records) {
    if (!record) continue;
    const metadata = asRecord(record.metadata);
    const telemetry = asRecord(record.telemetry);
    const value = sanitizeLabel(firstString(record.traceId, record.trace, record.correlationId, metadata?.traceId, telemetry?.traceId));
    if (value) return value;
  }
  return undefined;
}

function readDoneUrl(record: UnknownRecord): string | undefined {
  return [record.doneUrl, record.doneEvidenceUrl, record.done, asRecord(record.evidence)?.doneUrl]
    .map(readString)
    .find(isSafeHttpUrl);
}

function readBlockUrl(record: UnknownRecord): string | undefined {
  return [record.blockUrl, record.blockEvidenceUrl, record.block, asRecord(record.evidence)?.blockUrl]
    .map(readString)
    .find(isSafeHttpUrl);
}

function isSafeHttpUrl(value: string | undefined): value is string {
  return Boolean(value && /^https:\/\//.test(value));
}

function readStatusMessage(task?: UnknownRecord): string | undefined {
  const status = asRecord(task?.status);
  const message = asRecord(status?.message);
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts.map(asRecord).map((part) => readString(part?.text)).find(Boolean);
}

function redactText(value: string): string {
  return value
    .replace(URL_SECRET_RE, "$1[REDACTED]")
    .replace(BEARER_RE, "[REDACTED]")
    .replace(SECRET_ASSIGN_RE, "[REDACTED]")
    .replace(PRIVATE_PATH_RE, "[REDACTED_PATH]");
}

function clampText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}
