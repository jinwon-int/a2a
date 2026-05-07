/**
 * Worker status marker normalizer (Round 16, plugin-a2a#84).
 *
 * Parses `Start`, `Block`, `PR`, `Done` markers left by workers on GitHub
 * issues/comments and produces standardized `WorkerStatusEvent` objects that
 * the broker and GitHub projection layer can consume uniformly.
 *
 * Design goals:
 * - Single canonical event shape for both GitHub and general mode.
 * - Typed payload extraction (PR URL, branch, blocker reason, etc.).
 * - Malformed markers degrade safely to warnings, never crash the pipeline.
 * - Zero OpenClaw internals imported.
 */

// ── Event types ────────────────────────────────────────────────

export const WorkerStatusMarker = {
  START: "Start",
  BLOCK: "Block",
  PR: "PR",
  DONE: "Done",
} as const;

export type WorkerStatusMarkerType =
  (typeof WorkerStatusMarker)[keyof typeof WorkerStatusMarker];

export interface WorkerStatusEventBase {
  /** Which marker was detected. */
  marker: WorkerStatusMarkerType;
  /** The worker/agent that authored the marker. */
  workerId: string;
  /** Related issue or task number (GitHub issue #, or general task id). */
  taskId: string;
  /** ISO-8601 timestamp of when the marker was observed/parsed. */
  observedAt: string;
  /** Raw text that was parsed, for auditability. */
  rawText: string;
  /** Whether parsing succeeded fully or partially. */
  parseStatus: "clean" | "partial" | "failed";
  /** Warnings encountered during parsing (non-fatal issues). */
  warnings: string[];
}

export interface WorkerStatusStartEvent extends WorkerStatusEventBase {
  marker: "Start";
  payload: {
    summary?: string;
    issueUrl?: string;
  };
}

export interface WorkerStatusBlockEvent extends WorkerStatusEventBase {
  marker: "Block";
  payload: {
    reason: string;
    blockedOn?: string;
    /** ISO-8601 when the blocker was reported, if different from observedAt. */
    reportedAt?: string;
  };
}

export interface WorkerStatusPREvent extends WorkerStatusEventBase {
  marker: "PR";
  payload: {
    prUrl: string;
    branch?: string;
    /** Whether the PR description includes Closes/Fixes/Resolves. */
    closesIssue?: boolean;
    /** Verification summary if present. */
    verificationSummary?: string;
  };
}

export interface WorkerStatusDoneEvent extends WorkerStatusEventBase {
  marker: "Done";
  payload: {
    completionSummary?: string;
    prUrl?: string;
    /** Whether the task completed successfully. */
    success: boolean;
  };
}

export type WorkerStatusEvent =
  | WorkerStatusStartEvent
  | WorkerStatusBlockEvent
  | WorkerStatusPREvent
  | WorkerStatusDoneEvent;

// ── Parse error type ───────────────────────────────────────────

export interface WorkerStatusParseError {
  ok: false;
  error: string;
  rawText: string;
}

export type WorkerStatusParseResult = WorkerStatusEvent | WorkerStatusParseError;

// ── Helpers ────────────────────────────────────────────────────

const MARKER_PATTERNS: ReadonlyArray<{
  marker: WorkerStatusMarkerType;
  pattern: RegExp;
}> = [
  { marker: "Start", pattern: /\*\*Start\*\*/i },
  { marker: "Block", pattern: /\*\*Block\*\*/i },
  { marker: "PR", pattern: /\*\*PR\*\*/i },
  { marker: "Done", pattern: /\*\*Done\*\*/i },
];

/** Common GitHub-related URL patterns. */
const GITHUB_PR_URL = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/;
const GITHUB_ISSUE_URL = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/;
const BRANCH_PATTERN = /branch[:\s]+([A-Za-z0-9_.\-/]+)/i;
const CLOSES_PATTERN = /\b(?:closes|fixes|resolves)\s+#?\d+/i;

/**
 * Extract the first line containing the marker and the remaining body.
 */
function splitMarkerBody(text: string): { markerLine: string; body: string } {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern } of MARKER_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const inlineBody = line
          .slice((match.index ?? 0) + match[0].length)
          .replace(/^[\s:：—–-]+/, "")
          .trim();
        const followingBody = lines.slice(i + 1).join("\n").trim();
        const body = [inlineBody, followingBody].filter(Boolean).join("\n").trim();
        return {
          markerLine: line,
          body,
        };
      }
    }
  }
  return { markerLine: "", body: text };
}

/**
 * Extract a GitHub PR URL from text.
 */
function extractPRUrl(text: string): string | undefined {
  const match = text.match(GITHUB_PR_URL);
  return match ? match[0] : undefined;
}

/**
 * Extract a GitHub issue URL from text.
 */
function extractIssueUrl(text: string): string | undefined {
  const match = text.match(GITHUB_ISSUE_URL);
  return match ? match[0] : undefined;
}

/**
 * Extract branch name from text.
 */
function extractBranch(text: string): string | undefined {
  const match = text.match(BRANCH_PATTERN);
  return match ? match[1] : undefined;
}

/**
 * Check if text contains a Closes/Fixes/Resolves reference.
 */
function hasClosesReference(text: string): boolean {
  return CLOSES_PATTERN.test(text);
}

// ── Per-marker parsers ─────────────────────────────────────────

function parseStartMarker(
  workerId: string,
  taskId: string,
  rawText: string,
): WorkerStatusStartEvent {
  const { body } = splitMarkerBody(rawText);
  const warnings: string[] = [];
  const summary = body || undefined;
  const issueUrl = extractIssueUrl(body);

  return {
    marker: "Start",
    workerId,
    taskId,
    observedAt: new Date().toISOString(),
    rawText,
    parseStatus: "clean",
    warnings,
    payload: {
      ...(summary ? { summary } : {}),
      ...(issueUrl ? { issueUrl } : {}),
    },
  };
}

function parseBlockMarker(
  workerId: string,
  taskId: string,
  rawText: string,
): WorkerStatusBlockEvent {
  const { body } = splitMarkerBody(rawText);
  const warnings: string[] = [];

  // The body after **Block** should contain the reason
  const reason = body || "unspecified blocker";
  if (!body) {
    warnings.push("Block marker has no reason text");
  }

  // Try to extract what it's blocked on (e.g., "waiting on #42", "blocked by upstream")
  const blockedOnMatch = body?.match(/(?:blocked\s+(?:on|by)|waiting\s+(?:on|for))\s+([^\n.]+)/i);
  const blockedOn = blockedOnMatch ? blockedOnMatch[1].trim() : undefined;

  return {
    marker: "Block",
    workerId,
    taskId,
    observedAt: new Date().toISOString(),
    rawText,
    parseStatus: warnings.length > 0 ? "partial" : "clean",
    warnings,
    payload: {
      reason,
      ...(blockedOn ? { blockedOn } : {}),
    },
  };
}

function parsePRMarker(
  workerId: string,
  taskId: string,
  rawText: string,
): WorkerStatusPREvent {
  const { body } = splitMarkerBody(rawText);
  const warnings: string[] = [];

  const prUrl = extractPRUrl(body);
  if (!prUrl) {
    warnings.push("PR marker has no PR URL");
  }

  const branch = extractBranch(body);
  const closesIssue = hasClosesReference(body);

  // Everything after the PR URL line is potential verification summary
  let verificationSummary: string | undefined;
  if (body) {
    const lines = body.split("\n").filter((l) => l.trim());
    // Skip the PR URL line, take the rest
    const summaryLines = lines.filter((l) => !GITHUB_PR_URL.test(l) && !BRANCH_PATTERN.test(l));
    if (summaryLines.length > 0) {
      verificationSummary = summaryLines.join(" ").trim();
    }
  }

  return {
    marker: "PR",
    workerId,
    taskId,
    observedAt: new Date().toISOString(),
    rawText,
    parseStatus: warnings.length > 0 ? "partial" : "clean",
    warnings,
    payload: {
      prUrl: prUrl ?? "",
      ...(branch ? { branch } : {}),
      closesIssue: prUrl ? closesIssue : undefined,
      ...(verificationSummary ? { verificationSummary } : {}),
    },
  };
}

function parseDoneMarker(
  workerId: string,
  taskId: string,
  rawText: string,
): WorkerStatusDoneEvent {
  const { body } = splitMarkerBody(rawText);
  const warnings: string[] = [];

  const completionSummary = body || undefined;
  const prUrl = extractPRUrl(body);

  // Check for failure indicators
  const failureIndicators = /\b(failed|error|unsuccessful|aborted|rejected)\b/i;
  const success = !failureIndicators.test(body ?? "");

  return {
    marker: "Done",
    workerId,
    taskId,
    observedAt: new Date().toISOString(),
    rawText,
    parseStatus: warnings.length > 0 ? "partial" : "clean",
    warnings,
    payload: {
      ...(completionSummary ? { completionSummary } : {}),
      ...(prUrl ? { prUrl } : {}),
      success,
    },
  };
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Detect which marker type is present in the text.
 * Returns the first matching marker, or null if none found.
 */
export function detectMarker(text: string): WorkerStatusMarkerType | null {
  for (const { marker, pattern } of MARKER_PATTERNS) {
    if (pattern.test(text)) {
      return marker;
    }
  }
  return null;
}

/**
 * Parse a worker status marker from raw comment/text.
 *
 * @param text - The raw text (e.g., GitHub issue comment body).
 * @param workerId - The agent/worker identifier (e.g., "worker-alpha").
 * @param taskId - The related task identifier (e.g., GitHub issue number or task id).
 * @returns A typed WorkerStatusEvent, or a parse error.
 */
export function parseWorkerStatusMarker(
  text: string,
  workerId: string,
  taskId: string,
): WorkerStatusParseResult {
  if (!text || typeof text !== "string") {
    return {
      ok: false,
      error: "text must be a non-empty string",
      rawText: String(text),
    };
  }

  if (!workerId || typeof workerId !== "string") {
    return {
      ok: false,
      error: "workerId must be a non-empty string",
      rawText: text,
    };
  }

  if (!taskId || typeof taskId !== "string") {
    return {
      ok: false,
      error: "taskId must be a non-empty string",
      rawText: text,
    };
  }

  const marker = detectMarker(text);
  if (!marker) {
    return {
      ok: false,
      error: "no recognized worker status marker found in text",
      rawText: text,
    };
  }

  switch (marker) {
    case "Start":
      return parseStartMarker(workerId, taskId, text);
    case "Block":
      return parseBlockMarker(workerId, taskId, text);
    case "PR":
      return parsePRMarker(workerId, taskId, text);
    case "Done":
      return parseDoneMarker(workerId, taskId, text);
    default:
      return {
        ok: false,
        error: `unrecognized marker: ${marker}`,
        rawText: text,
      };
  }
}

/**
 * Convert a WorkerStatusEvent to a broker-consumable event shape.
 * This is the contract the broker ingestion lane expects.
 */
export function toBrokerEvent(event: WorkerStatusEvent): {
  type: "worker-status";
  marker: WorkerStatusMarkerType;
  workerId: string;
  taskId: string;
  observedAt: string;
  payload: Record<string, unknown>;
  meta: {
    parseStatus: string;
    warnings: string[];
  };
} {
  return {
    type: "worker-status",
    marker: event.marker,
    workerId: event.workerId,
    taskId: event.taskId,
    observedAt: event.observedAt,
    payload: event.payload as Record<string, unknown>,
    meta: {
      parseStatus: event.parseStatus,
      warnings: event.warnings,
    },
  };
}

/**
 * Batch parse multiple marker texts, collecting errors as warnings
 * rather than failing the entire batch.
 */
export function batchParseWorkerStatusMarkers(
  entries: Array<{ text: string; workerId: string; taskId: string }>,
): {
  events: WorkerStatusEvent[];
  errors: Array<{ taskId: string; error: string }>;
} {
  const events: WorkerStatusEvent[] = [];
  const errors: Array<{ taskId: string; error: string }> = [];

  for (const entry of entries) {
    const result = parseWorkerStatusMarker(entry.text, entry.workerId, entry.taskId);
    if ("ok" in result && result.ok === false) {
      errors.push({ taskId: entry.taskId, error: result.error });
    } else {
      events.push(result as WorkerStatusEvent);
    }
  }

  return { events, errors };
}
