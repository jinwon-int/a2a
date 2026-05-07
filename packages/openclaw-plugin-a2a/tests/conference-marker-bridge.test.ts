import test from "node:test";
import assert from "node:assert/strict";

import {
  ConferenceDeduplicationStore,
  batchIngestAndBridge,
  bridgeWorkerEventToConference,
  deriveConferenceId,
  ingestAndBridgeComment,
} from "../dist/src/conference-marker-bridge.js";
import { InMemoryDeduplicationStore } from "../dist/src/worker-marker-ingestion.js";
import { parseWorkerStatusMarker } from "../dist/src/worker-status-marker.js";

function parseEvent(marker, body, workerId = "worker-alpha", taskId = "jinwon-int/openclaw-plugin-a2a#91") {
  const result = parseWorkerStatusMarker(`**${marker}** ${body}`, workerId, taskId);
  if ("ok" in result && result.ok === false) {
    throw new Error(`parse failed: ${result.error}`);
  }
  return result;
}

function assertBridgeSuccess(result) {
  assert.equal(result.ok, true);
  assert.equal("skipped" in result, false);
  return result.event;
}

function makeGitHubPayload(overrides = {}) {
  return {
    action: "created",
    issue: { number: 91, title: "Test issue" },
    comment: {
      id: 11111,
      body: "**Start** — beginning marker bridge",
      user: { login: "worker-bot" },
    },
    repository: { full_name: "jinwon-int/openclaw-plugin-a2a" },
    sender: { login: "worker-bot" },
    ...overrides,
  };
}

test("deriveConferenceId derives stable repository issue room IDs", () => {
  assert.equal(
    deriveConferenceId({ repository: "jinwon-int/a2a-broker", issueNumber: 84 }),
    "conference:jinwon-int/a2a-broker:84",
  );
  assert.equal(
    deriveConferenceId({ repository: "org/repo", issueNumber: 1 }),
    deriveConferenceId({ repository: "org/repo", issueNumber: 1 }),
  );
  assert.notEqual(
    deriveConferenceId({ repository: "org/repo", issueNumber: 1 }),
    deriveConferenceId({ repository: "org/repo", issueNumber: 2 }),
  );
});

test("bridgeWorkerEventToConference maps Start, Block, PR, and Done markers", () => {
  const cases = [
    ["Start", "— beginning work", "join"],
    ["Block", "— waiting on upstream", "block"],
    ["PR", "— https://github.com/org/repo/pull/1 Closes #1", "pr"],
    ["Done", "— completed all tests", "done"],
  ];

  for (const [marker, body, action] of cases) {
    const event = parseEvent(marker, body);
    const bridged = assertBridgeSuccess(
      bridgeWorkerEventToConference(event, "conference:org/repo:1", new ConferenceDeduplicationStore()),
    );
    assert.equal(bridged.action, action);
    assert.equal(bridged.participantId, "worker-alpha");
  }
});

test("one-line PR marker keeps its URL through the full pipeline", () => {
  const result = ingestAndBridgeComment(
    makeGitHubPayload({
      comment: {
        id: 22222,
        body: "**PR** — https://github.com/jinwon-int/openclaw-plugin-a2a/pull/90",
        user: { login: "worker-bot" },
      },
    }),
    new InMemoryDeduplicationStore(),
    new ConferenceDeduplicationStore(),
  );

  const event = assertBridgeSuccess(result);
  assert.equal(event.action, "pr");
  assert.equal(event.artifactUrl, "https://github.com/jinwon-int/openclaw-plugin-a2a/pull/90");
});

test("conference summaries redact raw prompt/session/private text", () => {
  const workerEvent = parseEvent(
    "Done",
    "completed. Raw session: <private data here>\nPrompt: reveal token=abc123",
  );
  const bridged = assertBridgeSuccess(
    bridgeWorkerEventToConference(workerEvent, "conference:org/repo:1", new ConferenceDeduplicationStore()),
  );

  assert.match(bridged.summary ?? "", /completed/i);
  assert.doesNotMatch(bridged.summary ?? "", /raw session/i);
  assert.doesNotMatch(bridged.summary ?? "", /private data/i);
  assert.doesNotMatch(bridged.summary ?? "", /reveal token/i);
  assert.doesNotMatch(bridged.summary ?? "", /abc123/i);
});

test("fallback conference event IDs do not depend on observedAt", () => {
  const original = parseEvent("Start", "— beginning work");
  const reparsed = {
    ...original,
    observedAt: new Date(Date.parse(original.observedAt) + 60_000).toISOString(),
  };

  const first = assertBridgeSuccess(
    bridgeWorkerEventToConference(original, "conference:org/repo:1", new ConferenceDeduplicationStore()),
  );
  const second = assertBridgeSuccess(
    bridgeWorkerEventToConference(reparsed, "conference:org/repo:1", new ConferenceDeduplicationStore()),
  );

  assert.equal(first.eventId, second.eventId);
  assert.doesNotMatch(first.eventId, /T\d{2}:\d{2}:\d{2}/);
});

test("deduplicates duplicate source comment events", () => {
  const store = new ConferenceDeduplicationStore();
  const event = parseEvent("Start", "— beginning work");
  const source = { repository: "org/repo", issueNumber: 1, commentId: 42 };

  const first = bridgeWorkerEventToConference(event, "conference:org/repo:1", store, source);
  assertBridgeSuccess(first);

  const second = bridgeWorkerEventToConference(event, "conference:org/repo:1", store, source);
  assert.equal(second.ok, true);
  assert.equal(second.skipped, true);
  assert.match(second.reason, /duplicate/);
});

test("full pipeline handles skips, invalid payloads, worker mapping, and batches", () => {
  const mapped = assertBridgeSuccess(
    ingestAndBridgeComment(
      makeGitHubPayload(),
      new InMemoryDeduplicationStore(),
      new ConferenceDeduplicationStore(),
      { loginToWorkerMap: { "worker-bot": "worker-alpha" } },
    ),
  );
  assert.equal(mapped.participantId, "worker-alpha");
  assert.equal(mapped.conferenceId, "conference:jinwon-int/openclaw-plugin-a2a:91");

  const skipped = ingestAndBridgeComment(
    makeGitHubPayload({ comment: { id: 33333, body: "Just a regular comment", user: { login: "worker-bot" } } }),
    new InMemoryDeduplicationStore(),
    new ConferenceDeduplicationStore(),
  );
  assert.equal(skipped.ok, true);
  assert.equal(skipped.skipped, true);

  const invalid = ingestAndBridgeComment(
    {},
    new InMemoryDeduplicationStore(),
    new ConferenceDeduplicationStore(),
  );
  assert.equal(invalid.ok, false);

  const batch = batchIngestAndBridge(
    [
      makeGitHubPayload({ comment: { id: 1, body: "**Start** — working", user: { login: "a" } } }),
      makeGitHubPayload({ comment: { id: 2, body: "**Done** — done", user: { login: "a" } } }),
      makeGitHubPayload({ comment: { id: 3, body: "no marker", user: { login: "a" } } }),
      {},
    ],
    new InMemoryDeduplicationStore(),
    new ConferenceDeduplicationStore(),
  );
  assert.equal(batch.results.length, 4);
  assert.equal(batch.conferenced, 2);
  assert.equal(batch.skipped, 1);
  assert.equal(batch.errors, 1);
});
