import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageRoot = path.join(root, 'packages');
if (!fs.existsSync(packageRoot)) {
  console.log('package checks skipped: packages/ missing');
  process.exit(0);
}

const packages = fs
  .readdirSync(packageRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join('packages', entry.name))
  .filter((dir) => fs.existsSync(path.join(root, dir, 'package.json')))
  .sort();

if (!packages.length) {
  console.error('package checks failed: no package manifests found under packages/');
  process.exit(1);
}

const missingChecks = [];
for (const dir of packages) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
  if (!manifest.scripts?.check) {
    missingChecks.push(dir);
    continue;
  }
  console.log(`package check: ${dir}`);
  const result = spawnSync('npm', ['--workspace', dir, 'run', 'check'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (missingChecks.length) {
  console.error(`package checks failed: missing check script in ${missingChecks.join(', ')}`);
  process.exit(1);
}

console.log(`package checks ok: ${packages.length} packages`);
