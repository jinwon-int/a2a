import fs from 'node:fs';
const required = [
  'packages/broker',
  'packages/openclaw-plugin-a2a',
  'packages/docker-runner',
  'contracts/a2a',
  'contracts/compatibility',
  'docs',
  'examples',
];
const missing = required.filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error(`Missing required paths: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`layout ok: ${required.length} paths`);
