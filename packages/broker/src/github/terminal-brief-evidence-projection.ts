import type { TerminalTaskOutboxEvent, TerminalTaskStatus } from "../core/terminal-event-outbox.js";
import { MAX_GITHUB_COMMENT_LENGTH, redactSensitive } from "./projection.js";

export const TERMINAL_BRIEF_GITHUB_EVIDENCE_SCHEMA = "a2a.terminal-brief.github-evidence.v1";

const TRUNCATION_MARKER = "\n\n…(truncated)";
const PRIVATE_PATH_RE = /(^|[\s=(\[])(?:[A-Za-z]:)?\/(?:work|tmp|var|home|root|data)\/[A-Za-z0-9._~+\-/]+/g;
const OPENCLAW_CONTEXT_PATH_RE = /\b(?:AGENTS|SOUL|USER|TOOLS|HEARTBEAT|IDENTITY)\.md\b|\.openclaw\/[A-Za-z0-9._~+\-/]*/g;

export type TerminalBriefGitHubEvidenceMarker = "Done" | "PR" | "Block";
export type TerminalBriefGitHubEvidenceWriteAction = "create" | "skip" | "update";

export interface TerminalBriefGitHubEvidenceManifest {
  schemaVersion: typeof TERMINAL_BRIEF_GITHUB_EVIDENCE_SCHEMA;
  runId: string;
  repo: string;
  issueNumber: number;
  taskId: string;
  outboxEventId: string;
  terminalStatus: TerminalTaskStatus;
  terminalUpdatedAt: string;
}

export interface ProjectTerminalBriefGitHubEvidenceInput {
  manifest: TerminalBriefGitHubEvidenceManifest;
  event: TerminalTaskOutboxEvent;
}

export interface ProjectedTerminalBriefGitHubEvidenceComment {
  marker: TerminalBriefGitHubEvidenceMarker;
  taskId: string;
  body: string;
  dedupeKey: string;
  replayKey: string;
  manifest: TerminalBriefGitHubEvidenceManifest;
  /** Explicit boundary for callers: posting this comment does not acknowledge Terminal Brief receipt. */
  boundary: {
    githubComment: "evidence_ledger_only";
    terminalAck: false;
    readReceipt: false;
    visibilityProof: false;
    operatorApproval: false;
  };
}

export interface ExistingGitHubEvidenceComment {
  id?: number | string;
  url?: string;
  body: string;
}

export interface TerminalBriefGitHubEvidenceWritePlan {
  action: TerminalBriefGitHubEvidenceWriteAction;
  projection: ProjectedTerminalBriefGitHubEvidenceComment;
  matchedComment?: ExistingGitHubEvidenceComment;
  reason: string;
}

export function projectTerminalBriefGitHubEvidenceComment(
  input: ProjectTerminalBriefGitHubEvidenceInput,
): ProjectedTerminalBriefGitHubEvidenceComment {
  validateManifestBinding(input.manifest, input.event);
  const marker = markerForStatus(input.event.payload.status, input.event.payload.prUrl);
  const dedupeKey = buildDedupeKey(input.manifest, marker);
  const replayKey = buildReplayKey(input.manifest);
  const body = boundLength(renderEvidenceBody(input.manifest, input.event, marker, dedupeKey, replayKey));
  return {
    marker,
    taskId: input.manifest.taskId,
    body,
    dedupeKey,
    replayKey,
    manifest: { ...input.manifest },
    boundary: {
      githubComment: "evidence_ledger_only",
      terminalAck: false,
      readReceipt: false,
      visibilityProof: false,
      operatorApproval: false,
    },
  };
}

export function planTerminalBriefGitHubEvidenceWrite(
  projection: ProjectedTerminalBriefGitHubEvidenceComment,
  existingComments: ExistingGitHubEvidenceComment[],
): TerminalBriefGitHubEvidenceWritePlan {
  const matchedComment = existingComments.find((comment) => comment.body.includes(`dedupe_key: ${projection.dedupeKey}`));
  if (!matchedComment) {
    return { action: "create", projection, reason: "no existing GitHub evidence comment with matching dedupe key" };
  }
  if (matchedComment.body === projection.body) {
    return { action: "skip", projection, matchedComment, reason: "matching GitHub evidence comment already exists" };
  }
  return {
    action: "update",
    projection,
    matchedComment,
    reason: "matching dedupe key found with different body; update instead of creating a duplicate",
  };
}

function validateManifestBinding(manifest: TerminalBriefGitHubEvidenceManifest, event: TerminalTaskOutboxEvent): void {
  const failures: string[] = [];
  if (manifest.schemaVersion !== TERMINAL_BRIEF_GITHUB_EVIDENCE_SCHEMA) failures.push("schemaVersion");
  if (!manifest.runId || manifest.runId !== event.payload.run) failures.push("runId");
  if (!manifest.repo || manifest.repo !== event.payload.repo) failures.push("repo");
  if (!Number.isInteger(manifest.issueNumber) || manifest.issueNumber !== event.payload.issue) failures.push("issueNumber");
  if (!manifest.taskId || manifest.taskId !== event.payload.taskId) failures.push("taskId");
  if (!manifest.outboxEventId || manifest.outboxEventId !== event.id) failures.push("outboxEventId");
  if (manifest.terminalStatus !== event.payload.status) failures.push("terminalStatus");
  if (!manifest.terminalUpdatedAt || manifest.terminalUpdatedAt !== event.payload.updatedAt) failures.push("terminalUpdatedAt");
  if (failures.length > 0) {
    throw new Error(`terminal brief GitHub evidence manifest mismatch: ${failures.join(", ")}`);
  }
}

function markerForStatus(status: TerminalTaskStatus, prUrl: string | undefined): TerminalBriefGitHubEvidenceMarker {
  if (status === "succeeded") return prUrl ? "PR" : "Done";
  return "Block";
}

function renderEvidenceBody(
  manifest: TerminalBriefGitHubEvidenceManifest,
  event: TerminalTaskOutboxEvent,
  marker: TerminalBriefGitHubEvidenceMarker,
  dedupeKey: string,
  replayKey: string,
): string {
  const payload = event.payload;
  const lines = [
    `[a2a:TerminalBriefGitHubEvidence:${marker}] task=${manifest.taskId}`,
    `schema: ${manifest.schemaVersion}`,
    `dedupe_key: ${dedupeKey}`,
    `replay_key: ${replayKey}`,
    `run: ${safeString(manifest.runId)}`,
    `repo: ${safeString(manifest.repo)}`,
    `issue: ${manifest.issueNumber}`,
    `outbox_event: ${safeString(manifest.outboxEventId)}`,
    `terminal_status: ${manifest.terminalStatus}`,
    `terminal_updated_at: ${safeString(manifest.terminalUpdatedAt)}`,
    "boundary: GitHub comments are durable evidence ledger entries only; they are not Terminal Brief ACK, read receipt, operator-visible proof, or operator approval.",
  ];

  if (payload.worker) lines.push(`worker: ${safeString(payload.worker)}`);
  if (payload.taskBrief) lines.push(`task_brief: ${safeString(payload.taskBrief)}`);
  if (payload.testSummary) lines.push(`summary: ${safeString(payload.testSummary)}`);
  if (payload.prUrl) lines.push(`pull_request: ${safeString(payload.prUrl)}`);
  if (payload.doneUrl) lines.push(`done_comment: ${safeString(payload.doneUrl)}`);
  if (payload.blockUrl) lines.push(`block_comment: ${safeString(payload.blockUrl)}`);
  lines.push(`receipt_status: ${safeString(event.receipt.status)}`);
  lines.push("receipt_boundary: receipt status is projected for audit context only and does not advance terminal-outbox ACK.");
  return lines.join("\n");
}

function buildDedupeKey(manifest: TerminalBriefGitHubEvidenceManifest, marker: TerminalBriefGitHubEvidenceMarker): string {
  return [
    TERMINAL_BRIEF_GITHUB_EVIDENCE_SCHEMA,
    manifest.runId,
    manifest.repo,
    String(manifest.issueNumber),
    manifest.taskId,
    manifest.outboxEventId,
    marker,
  ].map(encodeURIComponent).join(":");
}

function buildReplayKey(manifest: TerminalBriefGitHubEvidenceManifest): string {
  return [
    manifest.runId,
    manifest.taskId,
    manifest.outboxEventId,
    manifest.terminalStatus,
    manifest.terminalUpdatedAt,
  ].map(encodeURIComponent).join(":");
}

function safeString(value: unknown): string {
  const redacted = redactSensitive(value);
  const serialized = stringify(redacted)
    .replace(PRIVATE_PATH_RE, "$1[path]")
    .replace(OPENCLAW_CONTEXT_PATH_RE, "[context-file]")
    .replace(/\s+/g, " ")
    .trim();
  return serialized.length > 0 ? serialized : "[empty]";
}

function stringify(value: unknown): string {
  if (value == null) return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function boundLength(body: string): string {
  if (body.length <= MAX_GITHUB_COMMENT_LENGTH) return body;
  const headRoom = MAX_GITHUB_COMMENT_LENGTH - TRUNCATION_MARKER.length;
  return body.slice(0, Math.max(0, headRoom)) + TRUNCATION_MARKER;
}
