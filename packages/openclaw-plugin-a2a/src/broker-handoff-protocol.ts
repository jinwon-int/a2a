export type BrokerHandoffPermission = "handoff:create" | "handoff:status" | "handoff:evidence" | "handoff:comment";

export type BrokerHandoffState =
  | "requested"
  | "accepted"
  | "running"
  | "succeeded"
  | "blocked"
  | "refused"
  | "timed_out"
  | "canceled";

export interface BrokerPeerIdentity {
  brokerId: string;
  teamId: string;
  permissions: readonly BrokerHandoffPermission[];
}

export interface BrokerHandoffRequest {
  sourceBrokerId: string;
  destinationBrokerId: string;
  brokerOfRecord: string;
  idempotencyKey: string;
  sourceTaskUrl?: string;
  sourceIssueUrl?: string;
  requestedTeamId: string;
  requestedTaskId?: string;
  summary: string;
}

export interface BrokerHandoffRecord extends BrokerHandoffRequest {
  destinationTaskId: string;
  state: BrokerHandoffState;
  createdAt: string;
  updatedAt: string;
  terminalEvidence?: RedactedTerminalEvidence;
}

export interface RedactedTerminalEvidence {
  kind: "pr" | "done" | "block";
  url?: string;
  summary: string;
  redacted: true;
}

export type BrokerHandoffDecision =
  | { status: "accepted"; record: BrokerHandoffRecord }
  | { status: "replayed"; record: BrokerHandoffRecord }
  | { status: "conflict"; reason: string; record: BrokerHandoffRecord }
  | { status: "refused"; reason: string };

export interface BrokerHandoffLedgerSnapshot {
  records?: readonly BrokerHandoffRecord[];
  now?: () => string;
  destinationTaskId?: (request: BrokerHandoffRequest) => string;
}

const TOKEN_RE = /\b(?:gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]+|[A-Za-z0-9_]*(?:token|secret|password|api[_-]?key)[A-Za-z0-9_]*\s*[=:]\s*[^\s,;]+)/gi;
const PRIVATE_PATH_RE = /(?:^|\s)(?:\/[\w.-]+)+(?:\/[\w.-]+)*(?=\s|$|[),.;:])/g;

export function hasBrokerHandoffPermission(peer: BrokerPeerIdentity | undefined, permission: BrokerHandoffPermission): boolean {
  return Boolean(peer?.permissions.includes(permission));
}

export function redactBrokerHandoffText(value: string): string {
  return value.replace(TOKEN_RE, "[redacted]").replace(PRIVATE_PATH_RE, (match) => {
    const prefix = match.startsWith(" ") ? " " : "";
    const path = match.trim();
    if (path.startsWith("/repos/") || path.startsWith("/issues/") || path.startsWith("/pull/")) return match;
    return `${prefix}[path]`;
  });
}

export function redactTerminalEvidence(evidence: Omit<RedactedTerminalEvidence, "redacted">): RedactedTerminalEvidence {
  return {
    kind: evidence.kind,
    url: evidence.url,
    summary: redactBrokerHandoffText(evidence.summary),
    redacted: true,
  };
}

export function createBrokerHandoffLedger(snapshot: BrokerHandoffLedgerSnapshot = {}) {
  const records = new Map<string, BrokerHandoffRecord>();
  for (const record of snapshot.records ?? []) records.set(record.idempotencyKey, { ...record });
  const now = snapshot.now ?? (() => new Date().toISOString());
  const destinationTaskId = snapshot.destinationTaskId ?? ((request: BrokerHandoffRequest) => `handoff:${request.destinationBrokerId}:${request.idempotencyKey}`);

  return {
    request(peer: BrokerPeerIdentity | undefined, request: BrokerHandoffRequest): BrokerHandoffDecision {
      const authFailure = validatePeer(peer, request, "handoff:create");
      if (authFailure) return authFailure;
      if (request.brokerOfRecord !== request.destinationBrokerId) {
        return { status: "refused", reason: `broker-of-record must be destination broker ${request.destinationBrokerId}` };
      }

      const existing = records.get(request.idempotencyKey);
      if (existing) {
        if (!sameLogicalHandoff(existing, request)) {
          return { status: "conflict", reason: "idempotency key already belongs to a different logical handoff", record: { ...existing } };
        }
        return { status: "replayed", record: { ...existing } };
      }

      const stamp = now();
      const record: BrokerHandoffRecord = {
        ...request,
        destinationTaskId: request.requestedTaskId ?? destinationTaskId(request),
        state: "accepted",
        createdAt: stamp,
        updatedAt: stamp,
      };
      records.set(record.idempotencyKey, record);
      return { status: "accepted", record: { ...record } };
    },

    status(peer: BrokerPeerIdentity | undefined, idempotencyKey: string): BrokerHandoffDecision {
      const record = records.get(idempotencyKey);
      if (!record) return { status: "refused", reason: "unknown handoff" };
      const authFailure = validatePeer(peer, record, "handoff:status");
      if (authFailure) return authFailure;
      return { status: "replayed", record: { ...record } };
    },

    relayTerminalEvidence(peer: BrokerPeerIdentity | undefined, idempotencyKey: string, evidence: Omit<RedactedTerminalEvidence, "redacted">): BrokerHandoffDecision {
      const record = records.get(idempotencyKey);
      if (!record) return { status: "refused", reason: "unknown handoff" };
      const authFailure = validatePeer(peer, record, "handoff:evidence");
      if (authFailure) return authFailure;
      const next: BrokerHandoffRecord = {
        ...record,
        state: evidence.kind === "block" ? "blocked" : "succeeded",
        terminalEvidence: redactTerminalEvidence(evidence),
        updatedAt: now(),
      };
      records.set(idempotencyKey, next);
      return { status: "accepted", record: { ...next } };
    },

    snapshot(): BrokerHandoffRecord[] {
      return Array.from(records.values()).map((record) => ({ ...record }));
    },
  };
}

function validatePeer(
  peer: BrokerPeerIdentity | undefined,
  request: Pick<BrokerHandoffRequest, "sourceBrokerId" | "requestedTeamId">,
  permission: BrokerHandoffPermission,
): Extract<BrokerHandoffDecision, { status: "refused" }> | undefined {
  if (!peer) return { status: "refused", reason: "missing peer auth" };
  if (peer.brokerId !== request.sourceBrokerId) return { status: "refused", reason: `peer broker mismatch: expected ${request.sourceBrokerId}` };
  if (peer.teamId !== request.requestedTeamId) return { status: "refused", reason: `peer team mismatch: expected ${request.requestedTeamId}` };
  if (!hasBrokerHandoffPermission(peer, permission)) return { status: "refused", reason: `missing required scope: ${permission}` };
  return undefined;
}

function sameLogicalHandoff(existing: BrokerHandoffRecord, request: BrokerHandoffRequest): boolean {
  return existing.sourceBrokerId === request.sourceBrokerId
    && existing.destinationBrokerId === request.destinationBrokerId
    && existing.brokerOfRecord === request.brokerOfRecord
    && existing.requestedTeamId === request.requestedTeamId
    && existing.sourceTaskUrl === request.sourceTaskUrl
    && existing.sourceIssueUrl === request.sourceIssueUrl;
}
