import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const skipParts = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const rules = [
  {
    kind: 'secret-assignment',
    re: /^\s*(?:export\s+)?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY)[A-Z0-9_]*\s*=\s*['"]?(?!<|\$\{|YOUR_|\/path\/to\/)[^'"\s#]{12,}/i,
  },
  { kind: 'github-token-shape', re: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { kind: 'aws-access-key-shape', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'absolute-private-path', re: /\/(?:home|Users)\/[^\s'")`]+|\/root\/private\/[^\s'")`]+/ },
  { kind: 'private-topology-term', re: /\b(?:15\.235\.211\.70|seoyoon-family\.com|jinon86)\b/ },
];

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.split('/').some((part) => skipParts.has(part)))
    .filter((file) => file !== 'scripts/redacted-readiness-inventory.mjs');
}

const byKind = new Map();
const byFile = new Map();
let total = 0;

for (const file of trackedFiles()) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const fileKinds = new Map();
  text.split(/\r?\n/).forEach((line) => {
    for (const rule of rules) {
      if (!rule.re.test(line)) continue;
      total += 1;
      byKind.set(rule.kind, (byKind.get(rule.kind) || 0) + 1);
      fileKinds.set(rule.kind, (fileKinds.get(rule.kind) || 0) + 1);
    }
  });
  if (fileKinds.size) byFile.set(file, Object.fromEntries([...fileKinds].sort()));
}

const summary = {
  ok: true,
  note: 'Redacted inventory only. This script does not print matched values and does not replace external secret scanners.',
  total,
  byKind: Object.fromEntries([...byKind].sort()),
  files: Object.fromEntries([...byFile].sort()),
};
console.log(JSON.stringify(summary, null, 2));
