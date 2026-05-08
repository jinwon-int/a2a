import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!['node_modules', 'dist', 'coverage'].includes(ent.name)) out.push(...walk(p));
    } else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(ent.name)) {
      out.push(path.relative(root, p).replaceAll('\\', '/'));
    }
  }
  return out;
}

const routingFiles = [
  ...walk(path.join(root, 'packages/openclaw-plugin-a2a/src')),
  ...walk(path.join(root, 'packages/docker-runner/src')),
].filter((file) => !/\.test\.(?:ts|js|mjs)$/.test(file));

const directDeliveryPatterns = [
  { name: 'Telegram Bot API URL', re: /api\.telegram\.org/i },
  { name: 'Telegram sendMessage primitive', re: /\bsendMessage\b/ },
  { name: 'curl process spawn', re: /\b(?:execFile|execFileSync|spawn|spawnSync|exec|execSync)\s*\([^\n;]*(?:['"]curl['"]|`curl\b)/ },
];

for (const file of routingFiles) {
  const text = read(file);
  for (const { name, re } of directDeliveryPatterns) {
    if (re.test(text)) {
      fail(`${file}: production Terminal Brief routing must not use direct ${name}; use OpenClaw outbound adapter routing only`);
    }
  }
}

const adapterPath = 'packages/openclaw-plugin-a2a/src/operator-notification-adapter.ts';
const adapter = read(adapterPath);
const requiredAdapterGuards = [
  ['receiptRequired: "current_session_visible"', 'live Terminal Brief send requests current-session-visible receipt proof'],
  ['userVisibleReceiptRequired: true', 'live Terminal Brief send requests user-visible receipt proof'],
  ['receipt_confirmation_missing', 'provider acceptance without receipt is recorded as non-ACK failure'],
  ['candidateIsAcceptedButNotAcknowledged(candidate)', 'provider accepted/sent candidates are filtered before receipt confirmation'],
  ['providerAccepted', 'providerAccepted is explicitly handled as accepted-only, not an ACK'],
  ['status === "sent"', 'sent status is explicitly handled as accepted-only, not an ACK'],
];

for (const [needle, description] of requiredAdapterGuards) {
  if (!adapter.includes(needle)) {
    fail(`${adapterPath}: missing guard for ${description}`);
  }
}

const eventBridgePath = 'packages/openclaw-plugin-a2a/src/operator-event-bridge.ts';
const eventBridge = read(eventBridgePath);
if (!eventBridge.includes('ackRequires: ["current_session_visible", "manual_operator_receipt"]')) {
  fail(`${eventBridgePath}: terminal outbox ACK metadata must require current-session-visible or manual operator receipt proof`);
}
if (!eventBridge.includes('provider send success')) {
  fail(`${eventBridgePath}: terminal ACK decision must document provider send success as non-ACK evidence`);
}

if (failures.length) {
  console.error(`terminal brief routing guard failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`terminal brief routing guard ok: ${routingFiles.length} production routing files checked; direct Telegram/curl sends blocked; provider acceptance remains non-ACK`);
