import fs from 'node:fs';
import path from 'node:path';
const deny = [
  { kind: 'runtime-bootstrap', re: /^(AGENTS|SOUL|USER|TOOLS|HEARTBEAT|IDENTITY)\.md$/ },
  { kind: 'openclaw-state', re: /^\.openclaw\// },
  { kind: 'secret-assignment', re: /\b(token|secret|password|api[_-]?key)\s*=\s*['\"]?[A-Za-z0-9_./:+-]{12,}/i },
  { kind: 'github-token-shape', re: /\b(ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
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
const findings = [];
for (const file of walk(process.cwd())) {
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
