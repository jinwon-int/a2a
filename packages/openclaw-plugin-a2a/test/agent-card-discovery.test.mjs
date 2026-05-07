import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredCapabilityFlags = [
  "send",
  "status",
  "cancel",
  "list",
  "streaming",
  "pushNotifications",
  "artifacts",
  "githubEvidenceProjection",
  "taskDelegation",
];

async function loadLocalAgentCard() {
  return JSON.parse(await readFile(new URL("../docs/a2a-agent-card.local.json", import.meta.url), "utf8"));
}

test("local/dev A2A agent-card fixture includes required discovery fields", async () => {
  const card = await loadLocalAgentCard();

  assert.equal(typeof card.name, "string");
  assert.ok(card.name.includes("OpenClaw"));
  assert.equal(typeof card.description, "string");
  assert.match(card.version, /alpha|\d+\.\d+\.\d+/);
  assert.equal(card.protocol?.target, "A2A 1.0 discovery profile");
  assert.ok(Array.isArray(card.protocol?.compatibility));
  assert.equal(typeof card.endpoints?.baseUrl, "string");
  assert.equal(typeof card.endpoints?.agentCard, "string");
  assert.ok(Array.isArray(card.inputModes));
  assert.ok(card.inputModes.includes("text/plain"));
  assert.ok(card.inputModes.includes("application/json"));
  assert.ok(Array.isArray(card.outputModes));
  assert.ok(card.outputModes.includes("application/json"));
  assert.ok(Array.isArray(card.securitySchemes));
  assert.ok(Array.isArray(card.skills));
  assert.ok(card.skills.length >= 4);
  assert.ok(Array.isArray(card.limitations));
  assert.ok(card.limitations.some((limitation) => /alpha/i.test(limitation)));
});

test("local/dev A2A agent-card fixture declares supported capability flags", async () => {
  const card = await loadLocalAgentCard();

  for (const flag of requiredCapabilityFlags) {
    assert.equal(card.capabilities?.[flag], true, `expected capability ${flag} to be true`);
  }

  assert.equal(card.artifactSupport?.links, true);
  assert.equal(card.artifactSupport?.inlineBinary, false);
  assert.ok(card.artifactSupport?.evidence?.includes("sanitizedGitHubMergeGate"));
});

test("local/dev A2A agent-card fixture keeps production exposure opt-in and redacted", async () => {
  const card = await loadLocalAgentCard();
  const serialized = JSON.stringify(card);

  assert.equal(card.exposure?.productionDefault, "disabled");
  assert.equal(card.exposure?.operatorActionRequired, true);
  assert.ok(card.limitations.some((limitation) => /Production agent-card exposure is opt-in/i.test(limitation)));

  assert.doesNotMatch(serialized, /gh[pousr]_[A-Za-z0-9_]+/);
  assert.doesNotMatch(serialized, /botToken|sessionCookie|privateKey|clientSecret/i);
  assert.doesNotMatch(serialized, /telegram:\d{5,}|chatId|operatorId/i);
  assert.doesNotMatch(serialized, /https?:\/\/(?!127\.0\.0\.1|localhost)[^/]*(internal|corp|lan|localdomain)/i);
});
