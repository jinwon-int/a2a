import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createBrokerHandoffLedger,
  redactBrokerHandoffText,
  type BrokerHandoffRequest,
  type BrokerPeerIdentity,
} from "../dist/src/broker-handoff-protocol.js";

const seoseoPeer: BrokerPeerIdentity = {
  brokerId: "seoseo",
  teamId: "team1",
  permissions: ["handoff:create", "handoff:status", "handoff:evidence"],
};

const baseRequest: BrokerHandoffRequest = {
  sourceBrokerId: "seoseo",
  destinationBrokerId: "gwakga",
  brokerOfRecord: "gwakga",
  idempotencyKey: "issue-23:team2:docs-slice",
  sourceIssueUrl: "https://github.com/jinwon-int/a2a-plane/issues/23",
  requestedTeamId: "team1",
  summary: "Team1 requests a Team2 review lane without cross-registering workers.",
};

describe("broker handoff protocol contract", () => {
  it("creates one destination task and replays duplicate idempotent requests", () => {
    const ledger = createBrokerHandoffLedger({ now: () => "2026-05-07T00:00:00.000Z" });

    const first = ledger.request(seoseoPeer, baseRequest);
    assert.equal(first.status, "accepted");
    assert.equal(first.record.destinationTaskId, "handoff:gwakga:issue-23:team2:docs-slice");
    assert.equal(first.record.brokerOfRecord, "gwakga");

    const duplicate = ledger.request(seoseoPeer, { ...baseRequest });
    assert.equal(duplicate.status, "replayed");
    assert.equal(duplicate.record.destinationTaskId, first.record.destinationTaskId);
    assert.equal(ledger.snapshot().length, 1);
  });

  it("rejects idempotency-key reuse for a different logical handoff", () => {
    const ledger = createBrokerHandoffLedger();
    const first = ledger.request(seoseoPeer, baseRequest);
    assert.equal(first.status, "accepted");

    const conflict = ledger.request(seoseoPeer, {
      ...baseRequest,
      sourceIssueUrl: "https://github.com/jinwon-int/a2a-plane/issues/999",
    });
    assert.equal(conflict.status, "conflict");
    assert.match(conflict.reason, /different logical handoff/);
    assert.equal(ledger.snapshot().length, 1);
  });

  it("requires peer auth and scoped handoff permissions", () => {
    const ledger = createBrokerHandoffLedger();

    assert.deepEqual(ledger.request(undefined, baseRequest), { status: "refused", reason: "missing peer auth" });

    const missingCreate = ledger.request({ ...seoseoPeer, permissions: ["handoff:status"] }, baseRequest);
    assert.deepEqual(missingCreate, { status: "refused", reason: "missing required scope: handoff:create" });

    const wrongBroker = ledger.request({ ...seoseoPeer, brokerId: "gwakga" }, baseRequest);
    assert.deepEqual(wrongBroker, { status: "refused", reason: "peer broker mismatch: expected seoseo" });

    const destinationTeamAsSource = ledger.request({ ...seoseoPeer, teamId: "team2" }, baseRequest);
    assert.deepEqual(destinationTeamAsSource, { status: "refused", reason: "peer team mismatch: expected team1" });
  });

  it("enforces destination broker as broker of record", () => {
    const ledger = createBrokerHandoffLedger();

    const refused = ledger.request(seoseoPeer, {
      ...baseRequest,
      brokerOfRecord: "seoseo",
    });

    assert.deepEqual(refused, {
      status: "refused",
      reason: "broker-of-record must be destination broker gwakga",
    });
    assert.equal(ledger.snapshot().length, 0);
  });

  it("relays terminal evidence as redacted metadata without terminal ACK scope", () => {
    const ledger = createBrokerHandoffLedger({ now: () => "2026-05-07T00:00:00.000Z" });
    assert.equal(ledger.request(seoseoPeer, baseRequest).status, "accepted");

    const relayPeer: BrokerPeerIdentity = { ...seoseoPeer, permissions: ["handoff:evidence"] };
    const result = ledger.relayTerminalEvidence(relayPeer, baseRequest.idempotencyKey, {
      kind: "block",
      url: "https://github.com/jinwon-int/a2a-plane/issues/23#issuecomment-1",
      summary: "Block from /work/private/repo with token=ghp_do_not_leak and no terminal-outbox ACK.",
    });

    assert.equal(result.status, "accepted");
    assert.equal(result.record.state, "blocked");
    assert.deepEqual(result.record.terminalEvidence, {
      kind: "block",
      url: "https://github.com/jinwon-int/a2a-plane/issues/23#issuecomment-1",
      summary: "Block from [path] with [redacted] and no terminal-outbox ACK.",
      redacted: true,
    });
    assert.equal(result.record.terminalEvidence?.summary.includes("ghp_do_not_leak"), false);
    assert.equal(result.record.terminalEvidence?.summary.includes("/work/private"), false);
  });

  it("keeps terminal relay scoped to handoff:evidence", () => {
    const ledger = createBrokerHandoffLedger();
    assert.equal(ledger.request(seoseoPeer, baseRequest).status, "accepted");

    const refused = ledger.relayTerminalEvidence(
      { ...seoseoPeer, permissions: ["handoff:status"] },
      baseRequest.idempotencyKey,
      { kind: "done", summary: "Done safely" },
    );

    assert.deepEqual(refused, { status: "refused", reason: "missing required scope: handoff:evidence" });
  });
});

describe("broker handoff redaction", () => {
  it("redacts token-like evidence and host-specific absolute paths", () => {
    assert.equal(
      redactBrokerHandoffText("see /home/operator/a2a token=github_pat_1234567890abcdef and /work/repo"),
      "see [path] [redacted] and [path]",
    );
  });
});
