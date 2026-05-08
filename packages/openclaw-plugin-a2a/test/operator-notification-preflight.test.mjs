import assert from "node:assert/strict";
import test from "node:test";

import {
  createA2AOperatorNotificationAdapter,
  preflightA2AOperatorNotificationRuntime,
} from "../dist/src/operator-notification-adapter.js";

function activatedConfig(notification = { enabled: true, channel: "telegram", to: "operator-chat" }) {
  return {
    plugins: {
      entries: {
        "a2a-broker-adapter": {
          enabled: true,
          config: {
            operatorEvents: {
              enabled: true,
              notification,
            },
          },
        },
      },
    },
  };
}

test("operator notification preflight confirms config and runtime adapter without live send", async () => {
  const sends = [];
  const runtime = {
    channel: {
      outbound: {
        async loadAdapter(channel) {
          assert.equal(channel, "telegram");
          return {
            capabilities: { currentSessionVisibleReceipt: true },
            async sendText(payload) {
              sends.push(payload);
            },
          };
        },
      },
    },
  };

  const result = await preflightA2AOperatorNotificationRuntime(activatedConfig(), runtime);

  assert.equal(result.ok, true);
  assert.equal(result.safeToRestartGateway, true);
  assert.deepEqual(result.target, { channel: "telegram", to: "operator-chat" });
  assert.deepEqual(result.notificationTarget, {
    status: "ready",
    enabled: true,
    configured: true,
    channel: "telegram",
    to: "operator-chat",
    reason: "operatorEvents.notification resolves to telegram; runtime preflight does not send live messages",
  });
  assert.equal(sends.length, 0, "preflight must not send live Telegram messages");
  assert.ok(result.checks.some((check) => check.code === "runtime_adapter" && check.ok));
});

test("operator notification preflight blocks Gateway restart on config/runtime drift", async () => {
  const result = await preflightA2AOperatorNotificationRuntime(
    {
      plugins: {
        entries: {
          "a2a-broker-adapter": {
            config: {
              operatorEvents: {
                enabled: false,
                notification: { enabled: true, channel: "telegram" },
              },
            },
          },
        },
      },
    },
    { channel: { outbound: { async loadAdapter() { return undefined; } } } },
  );

  assert.equal(result.ok, false);
  assert.equal(result.safeToRestartGateway, false);
  assert.equal(result.notificationTarget.status, "blocked");
  assert.match(result.notificationTarget.reason, /operator events are not fully enabled/);
  assert.ok(result.checks.some((check) => check.code === "plugin_activation" && !check.ok));
  assert.ok(result.checks.some((check) => check.code === "operator_events_enabled" && !check.ok));
  assert.ok(result.checks.some((check) => check.code === "notification_target" && !check.ok));
  assert.equal(result.checks.some((check) => check.code === "runtime_adapter"), false);
});


test("operator notification preflight explicitly reports disabled stale targets as ignored", async () => {
  const runtime = {
    channel: {
      outbound: {
        async loadAdapter() {
          throw new Error("disabled stale target must not resolve runtime adapter");
        },
      },
    },
  };

  const result = await preflightA2AOperatorNotificationRuntime(
    activatedConfig({ enabled: false, channel: "telegram", to: "stale-operator-chat" }),
    runtime,
  );

  assert.equal(result.ok, false);
  assert.equal(result.safeToRestartGateway, false);
  assert.equal(result.target, undefined);
  assert.deepEqual(result.notificationTarget, {
    status: "disabled",
    enabled: false,
    configured: false,
    channel: "telegram",
    reason: "operatorEvents.notification.enabled is not true; stale notification.to/chatId is ignored and no live send will occur",
  });
  assert.equal(result.checks.some((check) => check.code === "runtime_adapter"), false);
});

test("operator notification preflight distinguishes enabled notification with missing target", async () => {
  const result = await preflightA2AOperatorNotificationRuntime(
    activatedConfig({ enabled: true, channel: "telegram" }),
    {},
  );

  assert.equal(result.ok, false);
  assert.equal(result.target, undefined);
  assert.deepEqual(result.notificationTarget, {
    status: "missing",
    enabled: true,
    configured: false,
    channel: "telegram",
    reason: "operatorEvents.notification.enabled=true but notification.to/chatId is missing; terminal ACK remains receipt-gated",
  });
});

test("operator notification preflight blocks configured target when runtime route is unavailable", async () => {
  const result = await preflightA2AOperatorNotificationRuntime(activatedConfig(), {
    channel: { outbound: {} },
  });

  assert.equal(result.ok, false);
  assert.equal(result.safeToRestartGateway, false);
  assert.deepEqual(result.target, { channel: "telegram", to: "operator-chat" });
  assert.deepEqual(result.notificationTarget, {
    status: "blocked",
    enabled: true,
    configured: true,
    channel: "telegram",
    to: "operator-chat",
    reason: "operatorEvents.notification resolves to telegram, but no runtime route is available; preflight did not send a live message",
  });
  assert.ok(result.checks.some((check) => check.code === "runtime_adapter" && !check.ok));
});

test("operator notification preflight blocks runtime adapter without current-session receipt capability", async () => {
  const sends = [];
  const result = await preflightA2AOperatorNotificationRuntime(activatedConfig(), {
    channel: {
      outbound: {
        async loadAdapter(channel) {
          assert.equal(channel, "telegram");
          return {
            async sendText(payload) {
              sends.push(payload);
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.safeToRestartGateway, false);
  assert.deepEqual(result.target, { channel: "telegram", to: "operator-chat" });
  assert.deepEqual(result.notificationTarget, {
    status: "blocked",
    enabled: true,
    configured: true,
    channel: "telegram",
    to: "operator-chat",
    reason: "operatorEvents.notification resolves to telegram, but runtime does not advertise current-session-visible receipt support; preflight did not send a live message",
  });
  assert.equal(sends.length, 0, "preflight must not live-send to discover receipt support");
  assert.ok(result.checks.some((check) => check.code === "runtime_adapter" && check.ok));
  assert.ok(result.checks.some((check) => check.code === "receipt_runtime" && !check.ok));
});

test("operator notification adapter refuses live send without current-session receipt capability", async () => {
  const sends = [];
  const adapter = createA2AOperatorNotificationAdapter(activatedConfig(), {
    channel: {
      outbound: {
        async loadAdapter(channel) {
          assert.equal(channel, "telegram");
          return {
            async sendText(payload) {
              sends.push(payload);
              return { accepted: true, status: "sent", channel: "telegram", to: "operator-chat" };
            },
          };
        },
      },
    },
  }, { now: () => Date.parse("2026-05-06T04:00:00.000Z") });

  assert.ok(adapter, "expected configured adapter");
  const receipt = await adapter.notify({
    kind: "a2a.operator.notification",
    version: 1,
    id: "operator-notify:no-receipt-runtime",
    dedupeKey: "no-receipt-runtime",
    type: "success",
    severity: "info",
    deliveryOwner: "openclaw.plugin-notifier",
    deliveryTarget: "operator-main-session",
    title: "A2A Terminal Brief 완료: task no-receipt-runtime",
    text: "A2A Terminal Brief 완료: task no-receipt-runtime",
    evidence: {
      schema: "a2a.operator.notification.evidence",
      version: 1,
      taskId: "no-receipt-runtime",
    },
    taskId: "no-receipt-runtime",
  });

  assert.equal(sends.length, 0, "runtime without receipt capability must not send a live provider message");
  assert.equal(receipt, undefined);
  assert.deepEqual(adapter.listReceipts(), []);
  assert.deepEqual(adapter.getLastFailure("no-receipt-runtime"), {
    dedupeKey: "no-receipt-runtime",
    code: "receipt_runtime_unsupported",
    reason: "receipt_runtime_unsupported: Gateway runtime telegram adapter does not advertise current-session-visible receipt support; live provider send skipped and terminal ACK remains receipt-gated",
    outboundLifecycle: {
      state: "not_attempted",
      terminalAckEligible: false,
      reason: "outbound_lifecycle: live Gateway/provider send was not attempted; terminal ACK remains receipt-gated",
    },
  });
});

test("operator notification adapter maps Telegram-visible operator evidence to current-session receipt", async () => {
  const adapter = createA2AOperatorNotificationAdapter(activatedConfig(), {
    channel: {
      outbound: {
        async loadAdapter(channel) {
          assert.equal(channel, "telegram");
          return {
            capabilities: { currentSessionVisibleReceipt: true },
            async sendText() {
              return {
                receipt: {
                  channel: "telegram",
                  to: "operator-chat",
                  status: "receipt_confirmed",
                  evidence: "operator_visible",
                  receiptId: "telegram:7360371189:message:47146",
                },
              };
            },
          };
        },
      },
    },
  }, { now: () => Date.parse("2026-05-05T23:00:00.000Z") });

  assert.ok(adapter, "expected configured adapter");
  const receipt = await adapter.notify({
    kind: "a2a.operator.notification",
    version: 1,
    id: "operator-notify:telegram-visible",
    dedupeKey: "telegram-visible",
    type: "success",
    severity: "info",
    deliveryOwner: "openclaw.plugin-notifier",
    deliveryTarget: "operator-main-session",
    title: "A2A Terminal Brief 완료: task telegram-visible",
    text: "A2A Terminal Brief 완료: task telegram-visible",
    evidence: {
      schema: "a2a.operator.notification.evidence",
      version: 1,
      taskId: "telegram-visible",
    },
    taskId: "telegram-visible",
  });

  assert.equal(receipt.confirmationSource, "current_session_visible");
  assert.equal(receipt.dedupeKey, "telegram-visible");
  assert.equal(adapter.listReceipts().length, 1);
});

test("operator notification adapter treats provider send success as non-ACK", async () => {
  const sends = [];
  const adapter = createA2AOperatorNotificationAdapter(activatedConfig(), {
    channel: {
      outbound: {
        async loadAdapter(channel) {
          assert.equal(channel, "telegram");
          return {
            capabilities: { currentSessionVisibleReceipt: true },
            async sendText(payload) {
              sends.push(payload);
              return { accepted: true, status: "sent", channel: "telegram", to: "operator-chat" };
            },
          };
        },
      },
    },
  }, { now: () => Date.parse("2026-05-05T22:55:00.000Z") });

  assert.ok(adapter, "expected configured adapter");
  const receipt = await adapter.notify({
    kind: "a2a.operator.notification",
    version: 1,
    id: "operator-notify:provider-only",
    dedupeKey: "provider-only",
    type: "success",
    severity: "info",
    deliveryOwner: "openclaw.plugin-notifier",
    deliveryTarget: "operator-main-session",
    title: "A2A Terminal Brief 완료: task provider-only",
    text: "A2A Terminal Brief 완료: task provider-only",
    evidence: {
      schema: "a2a.operator.notification.evidence",
      version: 1,
      taskId: "provider-only",
    },
    taskId: "provider-only",
  });

  assert.equal(sends.length, 1);
  assert.equal(sends[0].receiptRequired, "current_session_visible");
  assert.equal(sends[0].userVisibleReceiptRequired, true);
  assert.equal(receipt, undefined, "provider accepted/sent is not operator-visible ACK evidence");
  assert.deepEqual(adapter.listReceipts(), []);
  assert.deepEqual(adapter.getLastFailure("provider-only")?.outboundLifecycle, {
    state: "accepted_non_ack",
    terminalAckEligible: false,
    reason: "outbound_lifecycle: Gateway/provider accepted the best-effort Terminal Brief notice; this is non-ACK evidence until current-session-visible receipt proof is available",
  });
});
