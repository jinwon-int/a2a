import fs from 'node:fs';

const matrixPath = 'contracts/compatibility/matrix.md';
const text = fs.readFileSync(matrixPath, 'utf8');

const requiredRows = new Map([
  ['Broker', /^\| Broker \|[^\n]*\|\s*`[0-9a-f]{40}`\s*\|/m],
  ['OpenClaw plugin', /^\| OpenClaw plugin \|[^\n]*\|\s*`[0-9a-f]{40}`\s*\|/m],
  ['Docker runner', /^\| Docker runner \|[^\n]*\|\s*`[0-9a-f]{40}`\s*\|/m],
  ['Shared contracts', /^\| Shared contracts \|[^\n]*\|\s*`r[0-9]+-[a-z0-9.-]+`\s*\|/m],
  ['OpenClaw core', /^\| OpenClaw core \|[^\n]*\|\s*`[^`]+`\s*\|/m],
]);

const findings = [];
for (const [component, pattern] of requiredRows) {
  if (!pattern.test(text)) {
    findings.push(`${component}: missing exact current baseline`);
  }
}

const unsupported = [
  /\bpending\b/i,
  /\btbd\b/i,
  /\bto be decided\b/i,
  /\bunknown\b/i,
  /\bgap\b/i,
];
for (const pattern of unsupported) {
  if (pattern.test(text)) {
    findings.push(`unsupported baseline wording matched ${pattern}`);
  }
}

if (!/A public release candidate must update this table with exact source commits\/tags/.test(text)) {
  findings.push('release rule must require exact source commits/tags');
}

if (findings.length) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, matrix: matrixPath, checked: [...requiredRows.keys()] }));
