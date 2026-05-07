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
  console.log('package checks skipped: no package manifests yet');
  process.exit(0);
}

for (const dir of packages) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
  if (!manifest.scripts?.check) {
    console.log(`package check skipped: ${dir} has no check script`);
    continue;
  }
  console.log(`package check: ${dir}`);
  const result = spawnSync('npm', ['--workspace', dir, 'run', 'check', '--if-present'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
