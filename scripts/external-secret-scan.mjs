import { spawnSync } from 'node:child_process';

function hasCommand(command) {
  return spawnSync(command, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).status === 0;
}

const scanners = [];
if (hasCommand('gitleaks')) {
  scanners.push({
    name: 'gitleaks-history',
    command: 'gitleaks',
    args: ['detect', '--source', '.', '--redact', '--no-banner', '--verbose'],
  });
}
if (hasCommand('trufflehog')) {
  scanners.push({
    name: 'trufflehog-filesystem-verified',
    command: 'trufflehog',
    args: ['filesystem', '.', '--only-verified', '--no-update'],
  });
}

if (scanners.length === 0) {
  console.error([
    'external secret/history scan blocked: no supported external scanner found.',
    'Install gitleaks or trufflehog in the operator environment, then re-run:',
    '  npm run scan:external-secrets',
    'This script intentionally fails closed instead of substituting the local public-readiness scanner for external evidence.',
  ].join('\n'));
  process.exit(2);
}

for (const scanner of scanners) {
  console.log(`external scan: ${scanner.name}`);
  const result = spawnSync(scanner.command, scanner.args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('external secret/history scan ok');
