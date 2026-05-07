import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const deny = [
  { kind: 'runtime-bootstrap', re: /^(AGENTS|SOUL|USER|TOOLS|HEARTBEAT|IDENTITY)\.md$/ },
  { kind: 'openclaw-state', re: /^\.openclaw\// },
  { kind: 'secret-assignment', re: /^\s*(?:export\s+)?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY)[A-Z0-9_]*\s*=\s*['\"]?(?!<|\$\{|YOUR_|\/path\/to\/)[^'"\s#]{12,}/ }, 
  { kind: 'github-token-shape', re: /\b(ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
];
function candidateFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.split('/').some((part) => ['node_modules', 'dist', 'coverage'].includes(part)));
}
const findings = [];
for (const file of candidateFiles()) {
  for (const rule of deny) {
    if (rule.re.test(file)) findings.push({ kind: rule.kind, file });
  }
  const text = fs.readFileSync(file, 'utf8');
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of deny.slice(2)) {
      if (rule.re.test(line)) findings.push({ kind: rule.kind, file, line: i + 1 });
    }
  });
}
if (findings.length) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, findings: [] }));
