import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv from "ajv";

async function loadValidator() {
  const manifest = JSON.parse(await readFile(new URL("../openclaw.plugin.json", import.meta.url), "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(manifest.configSchema);
}

test("plugin config schema accepts operatorEvents.notification target for receipt-confirmed Telegram delivery", async () => {
  const validate = await loadValidator();
  const config = {
    baseUrl: "https://broker.example.test",
    operatorEvents: {
      enabled: true,
      notification: {
        enabled: true,
        channel: "telegram",
        to: "telegram:<operator-chat-id>",
        accountId: "default",
        threadId: "round-2",
      },
    },
  };

  assert.equal(validate(config), true, JSON.stringify(validate.errors));
});

test("plugin config schema accepts chatId alias for operatorEvents.notification target", async () => {
  const validate = await loadValidator();
  const config = {
    operatorEvents: {
      enabled: true,
      notification: {
        enabled: true,
        channel: "telegram",
        chatId: "telegram:<operator-chat-id>",
      },
    },
  };

  assert.equal(validate(config), true, JSON.stringify(validate.errors));
});

test("plugin config schema rejects unknown operatorEvents.notification properties", async () => {
  const validate = await loadValidator();
  const config = {
    operatorEvents: {
      enabled: true,
      notification: {
        enabled: true,
        channel: "telegram",
        to: "telegram:<operator-chat-id>",
        botToken: "must-not-be-accepted-here",
      },
    },
  };

  assert.equal(validate(config), false);
  assert.ok(validate.errors?.some((error) => error.instancePath === "/operatorEvents/notification" && error.keyword === "additionalProperties"));
});

test("plugin config schema accepts edgeSecret as string", async () => {
  const validate = await loadValidator();
  const config = {
    baseUrl: "https://broker.example.test",
    edgeSecret: "secret-value",
  };

  assert.equal(validate(config), true, JSON.stringify(validate.errors));
});

test("plugin config schema rejects edgeSecret as object", async () => {
  const validate = await loadValidator();
  const config = {
    baseUrl: "https://broker.example.test",
    edgeSecret: { value: "secret-value" },
  };

  assert.equal(validate(config), false);
  assert.ok(
    validate.errors?.some((error) => error.instancePath === "/edgeSecret" && error.keyword === "type"),
    JSON.stringify(validate.errors),
  );
});

test("plugin config schema rejects edgeSecret as number", async () => {
  const validate = await loadValidator();
  const config = {
    baseUrl: "https://broker.example.test",
    edgeSecret: 42,
  };

  assert.equal(validate(config), false);
  assert.ok(
    validate.errors?.some((error) => error.instancePath === "/edgeSecret" && error.keyword === "type"),
    JSON.stringify(validate.errors),
  );
});
