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
    assert.match(decision.reason, /provider accepted\/sent success or message id is non-ACK/);
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
