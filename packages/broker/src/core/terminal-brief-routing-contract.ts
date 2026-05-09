/**
 * Terminal Brief routing contract for broker-prepared operator notices.
 *
 * This is a pure broker-side guard: it classifies a prepared Terminal Brief
 * transport envelope without sending it. The broker may prepare replayable
 * OpenClaw-routed notices for a notifier/Gateway, but it must not bless a
 * direct Telegram Bot API/curl path as a Terminal Brief transport.
 *
 * ## Receipt-level distinctions
 *
 * This contract distinguishes four receipt levels, in increasing order of
 * assurance:
 *
 * 1. **accepted-send** — the provider accepted the send request and returned a
 *    message id. This is lifecycle evidence only; it does not prove the message
 *    was delivered, rendered, or seen by anyone. Provider message ids and
 *    `providerAccepted` are recorded as non-ACK lifecycle evidence.
 *
 * 2. **requester-visible receipt** — the message appeared in a GitHub
 *    issue/PR comment that the requesting system can observe. This is stronger
 *    than accepted-send but still not terminal ACK: the comment could be
 *    collapsed, hidden by rate-limiting, or missed by automation.
 *
 * 3. **operator-visible receipt** — a human operator has explicitly confirmed
 *    seeing the Terminal Brief (e.g., manual operator receipt, Telegram
 *    delivery confirmation with operator acknowledgment). This is
 *    acknowledged-delivery evidence but not terminal-outbox ACK.
 *
 * 4. **terminal ACK** — the terminal outbox ACK contract has been satisfied
 *    through an explicit ACK-safe evidence path (manual operator receipt,
 *    current-session-visible proof, or another approved ACK path). Only this
 *    level may mutate the terminal outbox ACK column.
 *
 * Receipt safety is intentionally stricter than provider send success:
 * `providerAccepted` or a provider message id only means the provider accepted
 * the send request (level 1). It is never terminal ACK (level 4) unless manual
 * operator receipt or another explicit ACK-safe evidence path is supplied
 * through the terminal outbox ACK contract.
 */

export const TERMINAL_BRIEF_ROUTING_ALLOWED_VIA = [
  "openclaw_outbound_lifecycle",
  "openclaw_gateway_notifier",
  "terminal_outbox_replay",
] as const;

export const TERMINAL_BRIEF_ROUTING_FORBIDDEN_VIA = [
  "telegram_bot_api",
  "telegram_curl",
  "direct_provider_send",
] as const;

export type TerminalBriefAllowedRoute = (typeof TERMINAL_BRIEF_ROUTING_ALLOWED_VIA)[number];
export type TerminalBriefForbiddenRoute = (typeof TERMINAL_BRIEF_ROUTING_FORBIDDEN_VIA)[number];
export type TerminalBriefRoute = TerminalBriefAllowedRoute | TerminalBriefForbiddenRoute | string;

export interface TerminalBriefRoutingInput {
  via: TerminalBriefRoute;
  providerAccepted?: boolean;
  providerMessageId?: string;
  openclawLifecycleId?: string;
  terminalOutboxId?: string;
  currentSessionVisible?: boolean;
  receiptProofId?: string;
}

/**
 * Non-ACK lifecycle evidence recorded from the provider send attempt.
 * These fields are evidence only — they never imply terminal ACK.
 */
export interface AcceptedSendEvidence {
  /** Whether the provider accepted the send request. true ≠ delivered, rendered, or seen. */
  accepted: boolean;
  /** Provider-assigned message id, if returned. Non-ACK lifecycle evidence only. */
  messageId?: string;
}

export interface TerminalBriefRoutingDecision {
  routeAllowed: boolean;
  ackAllowed: boolean;
  /** Always false: provider accepted-send is never terminal ACK. */
  providerAcceptedIsAck: false;
  /** Non-ACK lifecycle evidence from the provider send attempt. */
  acceptedSendEvidence: AcceptedSendEvidence;
  reason: string;
  requiredRoute: "openclaw_outbound_lifecycle";
  receiptGate: "a2a-terminal-evidence-manual-or-ack-safe";
  /** Receipt level assigned by this contract: 1=accepted-send, 2=requester-visible, 3=operator-visible, 4=terminal-ACK. */
  receiptLevel: 1 | 2 | 3 | 4;
}

const ALLOWED_ROUTES = new Set<string>(TERMINAL_BRIEF_ROUTING_ALLOWED_VIA);
const FORBIDDEN_ROUTES = new Set<string>(TERMINAL_BRIEF_ROUTING_FORBIDDEN_VIA);

function buildEvidence(input: TerminalBriefRoutingInput): AcceptedSendEvidence {
  return {
    accepted: Boolean(input.providerAccepted),
    messageId: input.providerMessageId,
  };
}

export function evaluateTerminalBriefRouting(input: TerminalBriefRoutingInput): TerminalBriefRoutingDecision {
  const acceptedSendEvidence = buildEvidence(input);

  const base = {
    providerAcceptedIsAck: false as const,
    acceptedSendEvidence,
    requiredRoute: "openclaw_outbound_lifecycle" as const,
    receiptGate: "a2a-terminal-evidence-manual-or-ack-safe" as const,
  };

  if (FORBIDDEN_ROUTES.has(input.via)) {
    return {
      ...base,
      routeAllowed: false,
      ackAllowed: false,
      receiptLevel: 1,
      reason: "direct Telegram/provider transport is not a valid Terminal Brief path; use OpenClaw outbound lifecycle routing",
    };
  }

  if (!ALLOWED_ROUTES.has(input.via)) {
    return {
      ...base,
      routeAllowed: false,
      ackAllowed: false,
      receiptLevel: 1,
      reason: "unknown Terminal Brief transport route; fail closed until mapped to OpenClaw outbound lifecycle routing",
    };
  }

  const hasOpenClawRoutingProof = Boolean(input.openclawLifecycleId || input.terminalOutboxId);
  if (!hasOpenClawRoutingProof) {
    return {
      ...base,
      routeAllowed: false,
      ackAllowed: false,
      receiptLevel: 1,
      reason: "OpenClaw-routed Terminal Brief requires lifecycle or terminal-outbox proof before dispatch",
    };
  }

  if (input.currentSessionVisible && input.receiptProofId) {
    return {
      ...base,
      routeAllowed: true,
      ackAllowed: true,
      receiptLevel: 4,
      reason: "explicit ACK-safe receipt proof is present; Terminal Brief ACK may be considered by the terminal outbox contract",
    };
  }

  return {
    ...base,
    routeAllowed: true,
    ackAllowed: false,
    receiptLevel: input.providerAccepted ? 1 : 1,
    reason: input.providerAccepted
      ? "provider accepted/sent success (receipt level 1) is non-ACK lifecycle evidence; provider message id is accepted-send evidence only, never terminal ACK — wait for manual operator receipt (level 3) or explicit ACK-safe proof (level 4)"
      : "OpenClaw route is prepared best-effort, but Terminal Brief ACK remains gated on manual operator receipt (level 3) or explicit ACK-safe proof (level 4)",
  };
}
