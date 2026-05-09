import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateTerminalBriefRouting } from "./terminal-brief-routing-contract.js";

describe("Terminal Brief routing contract", () => {
  it("rejects direct Telegram Bot API and curl/provider paths", () => {
    for (const via of ["telegram_bot_api", "telegram_curl", "direct_provider_send"]) {
      const decision = evaluateTerminalBriefRouting({
        via,
        providerAccepted: true,
        providerMessageId: "provider-message-1",
      });

      assert.equal(decision.routeAllowed, false);
      assert.equal(decision.ackAllowed, false);
      assert.equal(decision.providerAcceptedIsAck, false);
      assert.match(decision.reason, /direct Telegram\/provider transport/);
    }
  });

  it("allows prepared OpenClaw outbound lifecycle routing without treating it as ACK", () => {
    const decision = evaluateTerminalBriefRouting({
      via: "openclaw_outbound_lifecycle",
      openclawLifecycleId: "ocl-brief-1",
      providerAccepted: true,
      providerMessageId: "provider-message-1",
    });

    assert.equal(decision.routeAllowed, true);
    assert.equal(decision.ackAllowed, false);
    assert.equal(decision.providerAcceptedIsAck, false);
    assert.equal(decision.receiptGate, "a2a-terminal-evidence-manual-or-ack-safe");
    assert.equal(decision.receiptLevel, 1);
    assert.match(decision.reason, /receipt level 1/);
    assert.match(decision.reason, /non-ACK/);
    assert.match(decision.reason, /accepted-send evidence/);
  });

  it("fails closed when an OpenClaw route lacks lifecycle or outbox proof", () => {
    const decision = evaluateTerminalBriefRouting({
      via: "openclaw_gateway_notifier",
      providerAccepted: true,
    });

    assert.equal(decision.routeAllowed, false);
    assert.equal(decision.ackAllowed, false);
    assert.match(decision.reason, /requires lifecycle or terminal-outbox proof/);
  });

  it("records provider message id as non-ACK accepted-send evidence, never terminal ACK", () => {
    const decision = evaluateTerminalBriefRouting({
      via: "openclaw_outbound_lifecycle",
      openclawLifecycleId: "ocl-brief-2",
      providerAccepted: true,
      providerMessageId: "tg-msg-88291",
    });

    // providerAcceptedIsAck is always false — enforced by the type system (literal false)
    assert.equal(decision.providerAcceptedIsAck, false);

    // accepted-send evidence is recorded as non-ACK lifecycle evidence
    assert.equal(decision.acceptedSendEvidence.accepted, true);
    assert.equal(decision.acceptedSendEvidence.messageId, "tg-msg-88291");

    // route is allowed but ACK is NOT — evidence ≠ ACK
    assert.equal(decision.routeAllowed, true);
    assert.equal(decision.ackAllowed, false);

    // receipt level is 1 (accepted-send), not 4 (terminal ACK)
    assert.equal(decision.receiptLevel, 1);
  });

  it("records accepted-send evidence as false when provider did not accept", () => {
    const decision = evaluateTerminalBriefRouting({
      via: "openclaw_gateway_notifier",
      openclawLifecycleId: "ocl-brief-3",
      // providerAccepted is intentionally omitted/undefined
    });

    assert.equal(decision.acceptedSendEvidence.accepted, false);
    assert.equal(decision.acceptedSendEvidence.messageId, undefined);
    assert.equal(decision.providerAcceptedIsAck, false);
  });

  it("returns receipt level 4 only with explicit ACK-safe proof, not on providerAccepted alone", () => {
    // providerAccepted + messageId alone → level 1, not 4
    const decision1 = evaluateTerminalBriefRouting({
      via: "openclaw_outbound_lifecycle",
      openclawLifecycleId: "ocl-brief-4",
      providerAccepted: true,
      providerMessageId: "tg-msg-99201",
    });

    assert.equal(decision1.receiptLevel, 1);
    assert.equal(decision1.ackAllowed, false);
    assert.equal(decision1.acceptedSendEvidence.messageId, "tg-msg-99201");

    // explicit ACK-safe proof → level 4
    const decision2 = evaluateTerminalBriefRouting({
      via: "terminal_outbox_replay",
      terminalOutboxId: "terminal:task-3:acked:2026-05-08T00%3A00%3A00.000Z",
      currentSessionVisible: true,
      receiptProofId: "current-session-visible:terminal:task-3",
      providerAccepted: true,
      providerMessageId: "tg-msg-99202",
    });

    assert.equal(decision2.receiptLevel, 4);
    assert.equal(decision2.ackAllowed, true);
    // Even at receipt level 4, provider accepted-send evidence is still not ACK
    assert.equal(decision2.providerAcceptedIsAck, false);
    assert.equal(decision2.acceptedSendEvidence.messageId, "tg-msg-99202");
  });

  it("distinguishes accepted-send evidence from terminal ACK in routing reason", () => {
    const decision = evaluateTerminalBriefRouting({
      via: "openclaw_outbound_lifecycle",
      openclawLifecycleId: "ocl-brief-5",
      providerAccepted: true,
      providerMessageId: "tg-msg-33201",
    });

    // reason must mention receipt level and explicit non-ACK of provider message id
    assert.match(decision.reason, /receipt level 1/);
    assert.match(decision.reason, /non-ACK lifecycle evidence/);
    assert.match(decision.reason, /accepted-send evidence only/);
    assert.match(decision.reason, /never terminal ACK/);
  });

  it("only allows ACK with explicit ACK-safe receipt proof", () => {
    const decision = evaluateTerminalBriefRouting({
      via: "terminal_outbox_replay",
      terminalOutboxId: "terminal:task-1:succeeded:2026-05-08T00%3A00%3A00.000Z",
      currentSessionVisible: true,
      receiptProofId: "current-session-visible:terminal:task-1",
      providerAccepted: true,
    });

    assert.equal(decision.routeAllowed, true);
    assert.equal(decision.ackAllowed, true);
    assert.equal(decision.providerAcceptedIsAck, false);
    assert.match(decision.reason, /ACK-safe receipt proof/);
  });
});
