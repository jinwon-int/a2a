/**
 * Terminal Brief routing contract for broker-prepared operator notices.
 *
 * This is a pure broker-side guard: it classifies a prepared Terminal Brief
 * transport envelope without sending it. The broker may prepare replayable
 * OpenClaw-routed notices for a notifier/Gateway, but it must not bless a
 * direct Telegram Bot API/curl path as a Terminal Brief transport.
 *
 * Receipt safety is intentionally stricter than provider send success:
 * `providerAccepted` or a provider message id only means the provider accepted
 * the send request. It is not a terminal ACK unless manual operator receipt or
 * another explicit ACK-safe evidence path is supplied through the terminal
 * outbox ACK contract.
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

export interface TerminalBriefRoutingDecision {
  routeAllowed: boolean;
  ackAllowed: boolean;
  providerAcceptedIsAck: false;
  reason: string;
  requiredRoute: "openclaw_outbound_lifecycle";
  receiptGate: "a2a-terminal-evidence-manual-or-ack-safe";
}

const ALLOWED_ROUTES = new Set<string>(TERMINAL_BRIEF_ROUTING_ALLOWED_VIA);
const FORBIDDEN_ROUTES = new Set<string>(TERMINAL_BRIEF_ROUTING_FORBIDDEN_VIA);

export function evaluateTerminalBriefRouting(input: TerminalBriefRoutingInput): TerminalBriefRoutingDecision {
  const base = {
    providerAcceptedIsAck: false as const,
    requiredRoute: "openclaw_outbound_lifecycle" as const,
    receiptGate: "a2a-terminal-evidence-manual-or-ack-safe" as const,
  };

  if (FORBIDDEN_ROUTES.has(input.via)) {
    return {
      ...base,
      routeAllowed: false,
      ackAllowed: false,
      reason: "direct Telegram/provider transport is not a valid Terminal Brief path; use OpenClaw outbound lifecycle routing",
    };
  }

  if (!ALLOWED_ROUTES.has(input.via)) {
    return {
      ...base,
      routeAllowed: false,
      ackAllowed: false,
      reason: "unknown Terminal Brief transport route; fail closed until mapped to OpenClaw outbound lifecycle routing",
    };
  }

  const hasOpenClawRoutingProof = Boolean(input.openclawLifecycleId || input.terminalOutboxId);
  if (!hasOpenClawRoutingProof) {
    return {
      ...base,
      routeAllowed: false,
      ackAllowed: false,
      reason: "OpenClaw-routed Terminal Brief requires lifecycle or terminal-outbox proof before dispatch",
    };
  }

  if (input.currentSessionVisible && input.receiptProofId) {
    return {
      ...base,
      routeAllowed: true,
      ackAllowed: true,
      reason: "explicit ACK-safe receipt proof is present; Terminal Brief ACK may be considered by the terminal outbox contract",
    };
  }

  return {
    ...base,
    routeAllowed: true,
    ackAllowed: false,
    reason: input.providerAccepted
      ? "provider accepted/sent success or message id is non-ACK; wait for manual operator receipt or explicit ACK-safe proof"
      : "OpenClaw route is prepared best-effort, but Terminal Brief ACK remains gated on manual operator receipt or explicit ACK-safe proof",
  };
}
