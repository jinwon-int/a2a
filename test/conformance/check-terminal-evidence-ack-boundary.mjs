import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const fixturePath = path.join(root, 'fixtures', 'terminal-evidence', 'accepted-send-non-ack.json');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');
const fixture = JSON.parse(fixtureText);

const githubProjectionFixturePath = path.join(root, 'fixtures', 'terminal-evidence', 'github-comment-projection.json');
const githubProjectionFixtureText = fs.readFileSync(githubProjectionFixturePath, 'utf8');
const githubProjectionFixture = JSON.parse(githubProjectionFixtureText);

const secretLikePatterns = [
  /ghp_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]+/,
  /xox[baprs]-[A-Za-z0-9-]+/,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  /\/home\/[A-Za-z0-9._-]+\//,
  /\/Users\/[A-Za-z0-9._-]+\//,
];

for (const pattern of secretLikePatterns) {
  assert.ok(!pattern.test(fixtureText), `terminal evidence fixture matched forbidden pattern ${pattern}`);
  assert.ok(!pattern.test(githubProjectionFixtureText), `github projection fixture matched forbidden pattern ${pattern}`);
}

const forbiddenBootstrapPaths = [
  'AGENTS.md',
  'SOUL.md',
  'USER.md',
  'TOOLS.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  '.openclaw/',
];

for (const forbiddenPath of forbiddenBootstrapPaths) {
  assert.ok(
    !githubProjectionFixtureText.includes(forbiddenPath),
    `github projection fixture must not include runtime/bootstrap context path ${forbiddenPath}`,
  );
}

assert.equal(fixture.contract, 'contracts/compatibility/terminal-evidence-ack-boundary.md');

// Contract v0: fixture must carry v0Freeze marker
assert.ok(fixture.v0Freeze, 'accepted-send non-ack fixture must carry v0Freeze marker');
assert.ok(fixture.v0Freeze.frozenAt, 'v0Freeze must include frozenAt');
assert.ok(fixture.v0Freeze.round, 'v0Freeze must include round');

assert.deepEqual(fixture.ackSafeReceiptTypes.sort(), [
  'current_session_visible',
  'manual_operator_receipt',
]);
assert.ok(fixture.nonAckSignals.includes('providerMessageId'));
assert.ok(fixture.nonAckSignals.includes('providerAccepted'));
assert.ok(fixture.nonAckSignals.includes('sendStatus:accepted'));
assert.ok(fixture.nonAckSignals.includes('sendStatus:sent'));

const scenarios = new Map(fixture.scenarios.map((scenario) => [scenario.name, scenario]));
const nonAckScenarioNames = [
  'provider-message-id-is-accepted-send-only',
  'sent-status-with-message-id-is-still-non-ack',
];
const ackSafeScenarioNames = [
  'manual-operator-receipt-is-ack-safe',
  'current-session-visible-receipt-is-ack-safe',
];

for (const name of nonAckScenarioNames) {
  const scenario = scenarios.get(name);
  assert.ok(scenario, `missing scenario ${name}`);
  assert.equal(scenario.given.deliveryAttempt.providerAccepted, true);
  assert.match(scenario.given.deliveryAttempt.providerMessageId, /^msg_fixture_/);
  assert.equal(scenario.given.receiptEvidence, null);
  assert.equal(scenario.expect.evidenceClass, 'accepted-send');
  assert.equal(scenario.expect.terminalAckMayBeRecorded, false);
  assert.equal(scenario.expect.terminalOutboxAckMutated, false);
  assert.ok(
    scenario.expect.reasonCodes.some((code) => code.includes('non-ack')),
    `${name} must explicitly classify provider evidence as non-ACK`,
  );
  assert.ok(
    scenario.expect.reasonCodes.includes('manual-or-visible-receipt-required'),
    `${name} must require manual or visible receipt proof`,
  );
}

for (const name of ackSafeScenarioNames) {
  const scenario = scenarios.get(name);
  assert.ok(scenario, `missing scenario ${name}`);
  assert.match(scenario.given.deliveryAttempt.providerMessageId, /^msg_fixture_/);
  assert.ok(scenario.given.receiptEvidence, `${name} must carry receipt evidence`);
  assert.equal(scenario.given.receiptEvidence.redacted, true);
  assert.ok(
    fixture.ackSafeReceiptTypes.includes(scenario.given.receiptEvidence.type),
    `${name} receipt type must be ACK-safe`,
  );
  assert.equal(scenario.expect.evidenceClass, 'ack-safe-receipt');
  assert.equal(scenario.expect.terminalAckMayBeRecorded, true);
  assert.equal(scenario.expect.terminalOutboxAckMutated, false);
  assert.equal(scenario.expect.requiredReceiptType, scenario.given.receiptEvidence.type);
}

for (const [key, value] of Object.entries(fixture.safetyConfirmations)) {
  assert.equal(value, true, `safety confirmation ${key} must be true`);
}

assert.equal(githubProjectionFixture.schemaVersion, 'a2a.terminal-brief.github-comment-projection.v1');
assert.equal(githubProjectionFixture.contract, 'contracts/a2a/terminal-semantics.md');
assert.equal(githubProjectionFixture.extension?.terminalBriefExtension, true);
assert.deepEqual(githubProjectionFixture.extension?.allowedTargets.sort(), [
  'github_issue_comment',
  'github_pull_request_comment',
]);
assert.equal(githubProjectionFixture.manifestBinding?.required, true);
assert.equal(githubProjectionFixture.manifestBinding?.projectionMustReferenceManifestDigest, true);
assert.ok(githubProjectionFixture.manifestBinding?.requiredFields?.includes('evidence'));
assert.equal(githubProjectionFixture.idempotency?.required, true);
assert.ok(githubProjectionFixture.idempotency?.dedupeKeyFields?.includes('manifestDigest'));
assert.equal(githubProjectionFixture.idempotency?.mustNotCreateDuplicateTerminalMarkers, true);
assert.equal(githubProjectionFixture.redaction?.required, true);
assert.ok(githubProjectionFixture.redaction?.forbiddenContent?.includes('raw_session_dumps'));
assert.equal(githubProjectionFixture.replaySafety?.required, true);
assert.equal(githubProjectionFixture.replaySafety?.staleManifestPolicy, 'block_projection');
assert.equal(githubProjectionFixture.replaySafety?.replayMustNotMutateTerminalAck, true);
assert.equal(githubProjectionFixture.replaySafety?.replayMustNotInferApproval, true);
assert.equal(githubProjectionFixture.receiptAndApprovalBoundary?.githubCommentReceiptLevel, 'requester-visible');
assert.equal(githubProjectionFixture.receiptAndApprovalBoundary?.githubCommentIsTerminalAck, false);
assert.equal(githubProjectionFixture.receiptAndApprovalBoundary?.githubCommentIsReadReceipt, false);
assert.equal(githubProjectionFixture.receiptAndApprovalBoundary?.githubCommentIsVisibilityProof, false);
assert.equal(githubProjectionFixture.receiptAndApprovalBoundary?.githubCommentIsOperatorApproval, false);
assert.equal(githubProjectionFixture.receiptAndApprovalBoundary?.terminalOutboxAckMayBeRecorded, false);
assert.equal(githubProjectionFixture.receiptAndApprovalBoundary?.operatorApprovalRequiredSeparately, true);
assert.equal(githubProjectionFixture.exampleProjection?.safetyState?.noLiveProviderSend, true);
assert.equal(githubProjectionFixture.exampleProjection?.safetyState?.terminalAck, 'not_attempted');
assert.equal(githubProjectionFixture.exampleProjection?.safetyState?.operatorApproval, 'not_granted');

for (const [key, value] of Object.entries(githubProjectionFixture.safetyConfirmations)) {
  assert.equal(value, true, `github projection safety confirmation ${key} must be true`);
}

console.log(JSON.stringify({
  ok: true,
  checkedFixtures: [
    'fixtures/terminal-evidence/accepted-send-non-ack.json',
    'fixtures/terminal-evidence/github-comment-projection.json',
  ],
  nonAckScenarios: nonAckScenarioNames,
  ackSafeReceiptScenarios: ackSafeScenarioNames,
  githubCommentProjection: {
    manifestBound: githubProjectionFixture.manifestBinding.required,
    idempotent: githubProjectionFixture.idempotency.required,
    replaySafe: githubProjectionFixture.replaySafety.required,
    terminalAck: githubProjectionFixture.receiptAndApprovalBoundary.githubCommentIsTerminalAck,
    operatorApproval: githubProjectionFixture.receiptAndApprovalBoundary.githubCommentIsOperatorApproval,
  },
}));
