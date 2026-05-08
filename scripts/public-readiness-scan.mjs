import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const deny = [
  { kind: 'runtime-bootstrap', re: /^(AGENTS|SOUL|USER|TOOLS|HEARTBEAT|IDENTITY)\.md$/ },
  { kind: 'openclaw-state', re: /^\.openclaw\// },
  { kind: 'secret-assignment', re: /^\s*(?:export\s+)?[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY)[A-Z0-9_]*\s*=\s*['"]?(?!<|\$\{|YOUR_|\/path\/to\/)[^'"\s#]{12,}/ },
  { kind: 'github-token-shape', re: /\b(ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { kind: 'old-monorepo-surface', re: /(?:github\.com\/jinwon-int\/a2a(?:[\/#]|$)|\bjinwon-int\/a2a(?:[#\s`]|$)|@jinwon-int\/a2a-monorepo\b)/ },
];
const skipDirs = new Set(['.git', 'node_modules', 'dist', 'coverage']);

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    const rel = path.relative(process.cwd(), p).replaceAll('\\', '/');
    if (ent.isDirectory()) {
      if (!skipDirs.has(ent.name)) out.push(...walk(p));
    } else out.push(rel);
  }
  return out;
}

function candidateFiles() {
  try {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => !file.split('/').some((part) => skipDirs.has(part)))
      .sort();
  } catch {
    return walk(process.cwd()).sort();
  }
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
