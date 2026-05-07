import { spawnSync } from 'node:child_process';

const steps = [
  ['layout', 'npm', ['run', 'check:layout']],
  ['packages', 'npm', ['run', 'check:packages']],
  ['public-readiness', 'npm', ['run', 'scan:public-readiness']],
  ['compatibility-baselines', 'node', ['scripts/check-compatibility-baselines.mjs']],
];

for (const [name, command, args] of steps) {
  console.log(`release gate: ${name}`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('release gate ok');
