import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeRecoveryAction,
  validateRecoveryPayload,
  isRound13CompatPayload,
  RecoveryAdapterErrorCodes,
  type NormalizedRecoveryAction,
} from "../dist/src/recovery-action-adapter.js";

// ── Fixtures ───────────────────────────────────────────────────

function makeRecoveryPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "retry",
    reference: {
      taskId: "task-abc-123",
      runId: "run-def-456",
    },
    reason: "Previous attempt timed out",
    operator: "node-hub",
    dryRun: false,
    ...overrides,
  };
}

function makeRound13Payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    intent: "delegate",
    instructions: "Investigate the issue",
    target: { sessionKey: "worker-a", displayKey: "worker-a" },
    requester: { sessionKey: "hub", displayKey: "hub" },
    metadata: { source: "general", detectedMode: "general", originalShape: {} },
    ...overrides,
  };
}

// ── normalizeRecoveryAction: valid payloads ────────────────────

describe("normalizeRecoveryAction: retry", () => {
  it("normalizes a valid retry payload", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({ action: "retry" }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "retry");
      assert.equal(result.reference.taskId, "task-abc-123");
      assert.equal(result.reason, "Previous attempt timed out");
      assert.equal(result.dryRun, false);
      assert.equal(result.metadata.source, "broker-recovery");
    }
  });
});

describe("normalizeRecoveryAction: cancel", () => {
  it("normalizes a valid cancel payload", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      action: "cancel",
      reason: "Operator cancelled",
      dryRun: false,
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "cancel");
    }
  });
});

describe("normalizeRecoveryAction: requeue", () => {
  it("normalizes a valid requeue payload", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      action: "requeue",
      reference: { flowId: "flow-789" },
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "requeue");
      assert.equal(result.reference.flowId, "flow-789");
    }
  });
});

describe("normalizeRecoveryAction: continue", () => {
  it("normalizes a valid continue payload", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      action: "continue",
      dryRun: true,
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "continue");
      assert.equal(result.dryRun, true);
    }
  });
});

describe("normalizeRecoveryAction: inspect", () => {
  it("normalizes a valid inspect payload", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      action: "inspect",
      dryRun: true,
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "inspect");
      assert.equal(result.dryRun, true);
    }
  });

  it("inspect is always dryRun-safe even without operator", () => {
    const result = normalizeRecoveryAction({
      action: "inspect",
      reference: { taskId: "t1" },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.dryRun, true);
    }
  });
});

// ── Error handling ─────────────────────────────────────────────

describe("normalizeRecoveryAction: error handling", () => {
  it("rejects non-object input", () => {
    const result = normalizeRecoveryAction("not an object");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.INVALID_RECOVERY_SHAPE);
    }
  });

  it("rejects null input", () => {
    const result = normalizeRecoveryAction(null);
    assert.equal(result.ok, false);
  });

  it("rejects array input", () => {
    const result = normalizeRecoveryAction([1, 2]);
    assert.equal(result.ok, false);
  });

  it("rejects unknown action kind", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({ action: "explode" }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.INVALID_ACTION_KIND);
      assert.equal(result.error.field, "action");
    }
  });

  it("rejects missing action", () => {
    const { action: _, ...rest } = makeRecoveryPayload();
    void _;
    const result = normalizeRecoveryAction(rest);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.INVALID_ACTION_KIND);
    }
  });

  it("rejects missing reference entirely", () => {
    const result = normalizeRecoveryAction({
      action: "retry",
      operator: "node-hub",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.MISSING_REFERENCE);
    }
  });

  it("rejects empty reference with no identifying fields", () => {
    const result = normalizeRecoveryAction({
      action: "retry",
      reference: {},
      operator: "node-hub",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.MISSING_REFERENCE);
    }
  });

  it("rejects invalid githubIssue format", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      reference: { githubIssue: "not-a-valid-ref!!" },
    }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.INVALID_REFERENCE_FIELD);
      assert.equal(result.error.field, "reference.githubIssue");
    }
  });

  it("rejects non-URL prUrl", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      reference: { prUrl: "ftp://not-http" },
    }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.INVALID_REFERENCE_FIELD);
      assert.equal(result.error.field, "reference.prUrl");
    }
  });

  it("rejects non-dryRun without operator", () => {
    const result = normalizeRecoveryAction({
      action: "retry",
      reference: { taskId: "t1" },
      dryRun: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.MUTATION_NOT_AUTHORIZED);
      assert.equal(result.error.field, "operator");
    }
  });
});

// ── Reference field normalization ──────────────────────────────

describe("normalizeRecoveryAction: reference fields", () => {
  it("accepts githubIssue as URL", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      reference: { githubIssue: "https://github.com/org/repo/issues/42" },
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reference.githubIssue, "https://github.com/org/repo/issues/42");
    }
  });

  it("accepts githubIssue as plain number", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      reference: { githubIssue: "42" },
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reference.githubIssue, "42");
    }
  });

  it("accepts githubIssue as owner/repo#number", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      reference: { githubIssue: "jinwon-int/a2a-broker#66" },
    }));
    assert.equal(result.ok, true);
  });

  it("accepts prUrl as HTTPS URL", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      reference: { prUrl: "https://github.com/org/repo/pull/10" },
    }));
    assert.equal(result.ok, true);
  });

  it("accepts multiple reference fields", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      reference: {
        taskId: "t1",
        runId: "r1",
        sourceId: "s1",
        flowId: "f1",
        sessionKey: "sk1",
      },
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reference.taskId, "t1");
      assert.equal(result.reference.runId, "r1");
      assert.equal(result.reference.sourceId, "s1");
      assert.equal(result.reference.flowId, "f1");
      assert.equal(result.reference.sessionKey, "sk1");
    }
  });

  it("accepts childSessionKey reference", () => {
    const result = normalizeRecoveryAction(makeRecoveryPayload({
      reference: { childSessionKey: "child-session-abc" },
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reference.childSessionKey, "child-session-abc");
    }
  });
});

// ── DryRun safety ──────────────────────────────────────────────

describe("normalizeRecoveryAction: dryRun safety", () => {
  it("defaults dryRun to true", () => {
    const result = normalizeRecoveryAction({
      action: "inspect",
      reference: { taskId: "t1" },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.dryRun, true);
    }
  });

  it("respects explicit dryRun=true", () => {
    const result = normalizeRecoveryAction({
      action: "retry",
      reference: { taskId: "t1" },
      dryRun: true,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.dryRun, true);
    }
  });

  it("allows dryRun=false with operator", () => {
    const result = normalizeRecoveryAction({
      action: "retry",
      reference: { taskId: "t1" },
      dryRun: false,
      operator: "node-hub",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.dryRun, false);
    }
  });

  it("rejects dryRun=false without operator", () => {
    const result = normalizeRecoveryAction({
      action: "retry",
      reference: { taskId: "t1" },
      dryRun: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.MUTATION_NOT_AUTHORIZED);
    }
  });
});

// ── Round 13 backward compatibility ───────────────────────────

describe("normalizeRecoveryAction: Round 13 compat", () => {
  it("adapts Round 13 NormalizedA2APayload as inspect action", () => {
    const result = normalizeRecoveryAction(makeRound13Payload());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.action, "inspect");
      assert.equal(result.dryRun, true);
      assert.equal(result.metadata.source, "round13-compat");
      assert.equal(result.reference.sessionKey, "worker-a");
    }
  });

  it("preserves original instructions as reason", () => {
    const result = normalizeRecoveryAction(makeRound13Payload({
      instructions: "Debug the timeout",
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reason, "Debug the timeout");
    }
  });

  it("extracts operator from Round 13 requester", () => {
    const result = normalizeRecoveryAction(makeRound13Payload({
      requester: { sessionKey: "node-hub", displayKey: "서서" },
    }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.operator, "node-hub");
    }
  });

  it("stores Round 13 payload in context", () => {
    const payload = makeRound13Payload();
    const result = normalizeRecoveryAction(payload);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.context.round13Payload);
    }
  });
});

// ── isRound13CompatPayload ─────────────────────────────────────

describe("isRound13CompatPayload", () => {
  it("returns true for Round 13 payload", () => {
    assert.equal(isRound13CompatPayload(makeRound13Payload()), true);
  });

  it("returns false for recovery payload", () => {
    assert.equal(isRound13CompatPayload(makeRecoveryPayload()), false);
  });

  it("returns false for null", () => {
    assert.equal(isRound13CompatPayload(null), false);
  });

  it("returns false for empty object", () => {
    assert.equal(isRound13CompatPayload({}), false);
  });

  it("returns false when ok is not true", () => {
    assert.equal(isRound13CompatPayload({ ok: false, instructions: "hi", metadata: {} }), false);
  });
});

// ── validateRecoveryPayload ────────────────────────────────────

describe("validateRecoveryPayload", () => {
  it("returns compatible for valid recovery payload", () => {
    const result = validateRecoveryPayload(makeRecoveryPayload());
    assert.equal(result.compatible, true);
    assert.equal(result.isRound13Compat, false);
  });

  it("returns compatible for Round 13 payload", () => {
    const result = validateRecoveryPayload(makeRound13Payload());
    assert.equal(result.compatible, true);
    assert.equal(result.isRound13Compat, true);
  });

  it("reports incompatible for null", () => {
    const result = validateRecoveryPayload(null);
    assert.equal(result.compatible, false);
  });

  it("reports warning for missing action", () => {
    const result = validateRecoveryPayload({ reference: { taskId: "t1" } });
    assert.ok(result.warnings.some((w) => w.includes("action")));
  });

  it("reports warning for unknown action", () => {
    const result = validateRecoveryPayload({ action: "explode", reference: { taskId: "t1" } });
    assert.ok(result.warnings.some((w) => w.includes("explode")));
  });

  it("reports warning for empty reference", () => {
    const result = validateRecoveryPayload({ action: "retry", reference: {} });
    assert.ok(result.warnings.some((w) => w.includes("identifying")));
  });

  it("reports warning for non-dryRun without operator", () => {
    const result = validateRecoveryPayload({
      action: "retry",
      reference: { taskId: "t1" },
      dryRun: false,
    });
    assert.ok(result.warnings.some((w) => w.includes("operator")));
  });

  it("reports warning for unknown top-level fields", () => {
    const result = validateRecoveryPayload({
      action: "retry",
      reference: { taskId: "t1" },
      unknownExtra: true,
    });
    assert.ok(result.warnings.some((w) => w.includes("unknownExtra")));
  });
});

// ── Malformed payload handling ─────────────────────────────────

describe("normalizeRecoveryAction: malformed payloads", () => {
  it("handles reference as string gracefully", () => {
    const result = normalizeRecoveryAction({
      action: "retry",
      reference: "not-an-object",
      operator: "node-hub",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.MISSING_REFERENCE);
    }
  });

  it("handles action as number gracefully", () => {
    const result = normalizeRecoveryAction({
      action: 42,
      reference: { taskId: "t1" },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, RecoveryAdapterErrorCodes.INVALID_ACTION_KIND);
    }
  });

  it("handles extra unknown fields without crashing", () => {
    const result = normalizeRecoveryAction({
      action: "retry",
      reference: { taskId: "t1" },
      bonusField: "extra",
      nestedExtra: { deep: true },
    });
    assert.equal(result.ok, true);
  });

  it("handles context as non-object gracefully", () => {
    const result = normalizeRecoveryAction({
      action: "inspect",
      reference: { taskId: "t1" },
      context: "not-an-object",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.context, {});
    }
  });

  it("handles whitespace-only reason as empty string", () => {
    const result = normalizeRecoveryAction({
      action: "inspect",
      reference: { taskId: "t1" },
      reason: "   ",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reason, "");
    }
  });

  it("handles whitespace-only operator as empty string", () => {
    const result = normalizeRecoveryAction({
      action: "inspect",
      reference: { taskId: "t1" },
      operator: "   ",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.operator, "");
    }
  });
});
