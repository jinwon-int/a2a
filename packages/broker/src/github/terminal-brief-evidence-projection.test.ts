import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { TerminalTaskOutboxEvent } from "../core/terminal-event-outbox.js";
import {
  projectTerminalBriefGitHubEvidenceComment,
  planTerminalBriefGitHubEvidenceWrite,
  TERMINAL_BRIEF_GITHUB_EVIDENCE_SCHEMA,
  type TerminalBriefGitHubEvidenceManifest,
} from "./terminal-brief-evidence-projection.js";

function makeEvent(overrides: Partial<TerminalTaskOutboxEvent> = {}): TerminalTaskOutboxEvent {
  const syntheticGitHubToken = ["ghp", "deadbeefDEADBEEF1234567890"].join("_");
  return {
    id: "terminal:task-207:succeeded:2026-05-11T00%3A00%3A00.000Z",
    kind: "task.terminal",
    taskEventId: 207,
    payload: {
      taskId: "task-207",
      status: "succeeded",
      run: "a2a-terminal-brief-github-evidence-20260511T000448Z",
      worker: "soonwook",
      repo: "jinwon-int/a2a-plane",
      issue: 207,
      taskBrief: `Project Terminal Brief GitHub evidence; token=${syntheticGitHubToken} /work/repo/AGENTS.md`,
      prUrl: "https://github.com/jinwon-int/a2a-plane/pull/208",
      testSummary: "safe summary with /home/runner/private.log and SOUL.md",
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
      completedAt: "2026-05-11T00:00:00.000Z",
    },
    createdAt: "2026-05-11T00:00:01.000Z",
    receipt: {
      status: "provider_accepted",
      updatedAt: "2026-05-11T00:00:02.000Z",
    },
    attempts: 0,
    ...overrides,
  };
}

function makeManifest(event = makeEvent()): TerminalBriefGitHubEvidenceManifest {
  return {
    schemaVersion: TERMINAL_BRIEF_GITHUB_EVIDENCE_SCHEMA,
    runId: event.payload.run!,
    repo: event.payload.repo!,
    issueNumber: event.payload.issue!,
    taskId: event.payload.taskId,
    outboxEventId: event.id,
    terminalStatus: event.payload.status,
    terminalUpdatedAt: event.payload.updatedAt,
  };
}

describe("projectTerminalBriefGitHubEvidenceComment", () => {
  it("renders manifest-bound PR evidence with explicit non-ACK/non-approval boundary", () => {
    const event = makeEvent();
    const projection = projectTerminalBriefGitHubEvidenceComment({ manifest: makeManifest(event), event });

    assert.equal(projection.marker, "PR");
    assert.match(projection.body, /\[a2a:TerminalBriefGitHubEvidence:PR\]/);
    assert.match(projection.body, /schema: a2a\.terminal-brief\.github-evidence\.v1/);
    assert.match(projection.body, /dedupe_key:/);
    assert.match(projection.body, /replay_key:/);
    assert.match(projection.body, /pull_request: https:\/\/github\.com\/jinwon-int\/a2a-plane\/pull\/208/);
    assert.match(projection.body, /not Terminal Brief ACK, read receipt, operator-visible proof, or operator approval/);
    assert.deepEqual(projection.boundary, {
      githubComment: "evidence_ledger_only",
      terminalAck: false,
      readReceipt: false,
      visibilityProof: false,
      operatorApproval: false,
    });
  });

  it("redacts token-like strings, private paths, and OpenClaw context paths", () => {
    const event = makeEvent();
    const projection = projectTerminalBriefGitHubEvidenceComment({ manifest: makeManifest(event), event });

    assert.doesNotMatch(projection.body, /ghp_/);
    assert.doesNotMatch(projection.body, /\/work\/repo\/AGENTS\.md/);
    assert.doesNotMatch(projection.body, /\/home\/runner\/private\.log/);
    assert.doesNotMatch(projection.body, /SOUL\.md/);
    assert.match(projection.body, /\[REDACTED\]|\[context-file\]|\[path\]/);
  });

  it("fails closed when the manifest does not match the terminal outbox event", () => {
    const event = makeEvent();
    const manifest = { ...makeManifest(event), runId: "other-run" };

    assert.throws(
      () => projectTerminalBriefGitHubEvidenceComment({ manifest, event }),
      /manifest mismatch: runId/,
    );
  });

  it("uses a stable dedupe key and body across exact replays", () => {
    const event = makeEvent();
    const input = { manifest: makeManifest(event), event };
    const first = projectTerminalBriefGitHubEvidenceComment(input);
    const replay = projectTerminalBriefGitHubEvidenceComment(input);

    assert.equal(first.dedupeKey, replay.dedupeKey);
    assert.equal(first.replayKey, replay.replayKey);
    assert.equal(first.body, replay.body);
  });

  it("plans skip for exact replay and update instead of duplicate for changed replay", () => {
    const event = makeEvent();
    const projection = projectTerminalBriefGitHubEvidenceComment({ manifest: makeManifest(event), event });

    assert.equal(planTerminalBriefGitHubEvidenceWrite(projection, []).action, "create");
    assert.equal(planTerminalBriefGitHubEvidenceWrite(projection, [{ id: 1, body: projection.body }]).action, "skip");

    const staleBody = projection.body.replace("receipt_status: provider_accepted", "receipt_status: accepted");
    const plan = planTerminalBriefGitHubEvidenceWrite(projection, [{ id: 1, body: staleBody }]);
    assert.equal(plan.action, "update");
    assert.equal(plan.matchedComment?.id, 1);
  });

  it("renders Done and Block markers without treating comments as ACK evidence", () => {
    const doneEvent = makeEvent({
      id: "terminal:task-207:succeeded:no-pr",
      payload: { ...makeEvent().payload, prUrl: undefined },
    });
    const blockEvent = makeEvent({
      id: "terminal:task-207:blocked",
      payload: { ...makeEvent().payload, status: "blocked", prUrl: undefined },
    });

    const done = projectTerminalBriefGitHubEvidenceComment({ manifest: makeManifest(doneEvent), event: doneEvent });
    const block = projectTerminalBriefGitHubEvidenceComment({ manifest: makeManifest(blockEvent), event: blockEvent });

    assert.equal(done.marker, "Done");
    assert.equal(block.marker, "Block");
    assert.equal(done.boundary.terminalAck, false);
    assert.equal(block.boundary.operatorApproval, false);
  });
});
