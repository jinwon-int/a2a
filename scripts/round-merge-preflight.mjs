#!/usr/bin/env node
/**
 * Round merge preflight.
 *
 * Builds a temporary, local-only merge train for a set of PRs, then runs the
 * requested validation command against the integrated result. This catches
 * cross-PR fixture/contract drift before the operator starts merging.
 *
 * Safety: local git worktree only. No push, no merge to main, no deploy, no
 * restart, no live provider send, no terminal ACK, no DB mutation, no secrets.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage: npm run round:merge-preflight -- [--base origin/main] [--run "npm run check"] <pr> [<pr> ...]

Creates a temporary local-only git worktree, sequentially merges the supplied PR
refs in the given order, and runs the validation command on the integrated tree.

Examples:
  npm run round:merge-preflight -- 160 158 155 159 157 156 154
  npm run round:merge-preflight -- --base origin/main --run "npm run check && npm run test:release-gate" 160 158

Safety: this command never pushes, never changes main, and never performs live
provider sends, terminal ACKs, deploys, restarts, DB mutations, or secret changes.`);
  process.exit(exitCode);
}

let base = 'origin/main';
let runCommand = 'npm run check';
const prs = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') usage(0);
  if (arg === '--base') {
    base = args[++i];
  } else if (arg === '--run') {
    runCommand = args[++i];
  } else if (/^\d+$/.test(arg)) {
    prs.push(arg);
  } else {
    console.error(`unknown argument: ${arg}`);
    usage(1);
  }
}
if (prs.length === 0) usage(1);
if (!base || !runCommand) usage(1);

function run(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, {
    cwd: options.cwd,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
    shell: options.shell ?? false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${cmdArgs.join(' ')} failed with exit ${result.status}`);
  }
  return result;
}

function capture(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: options.shell ?? false,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(`${command} ${cmdArgs.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return result.stdout.trim();
}

function requireCommand(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  if (result.status !== 0) throw new Error(`required command not found or not runnable: ${command}`);
}

requireCommand('git');
requireCommand('gh');

const root = capture('git', ['rev-parse', '--show-toplevel']);
const porcelain = capture('git', ['status', '--porcelain'], { cwd: root });
if (porcelain) {
  throw new Error('working tree is not clean; commit/stash local changes before merge preflight');
}

const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-round-merge-preflight-'));
const worktree = path.join(tmpParent, 'worktree');
const tempRefs = [];
let ok = false;

try {
  run('git', ['fetch', 'origin', base.replace(/^origin\//, '')], { cwd: root });
  run('git', ['worktree', 'add', '--detach', worktree, base], { cwd: root });

  const manifest = [];
  for (const pr of prs) {
    const meta = JSON.parse(capture('gh', ['pr', 'view', pr, '--json', 'number,title,headRefOid,url,statusCheckRollup'], { cwd: root }));
    const checks = (meta.statusCheckRollup ?? []).map((check) => check.conclusion ?? check.status).filter(Boolean);
    if (checks.length && !checks.every((check) => check === 'SUCCESS' || check === 'COMPLETED')) {
      throw new Error(`PR #${pr} is not individually green: ${checks.join(', ')}`);
    }
    const ref = `refs/tmp/a2a-round-preflight-${process.pid}-${pr}`;
    tempRefs.push(ref);
    run('git', ['fetch', 'origin', `pull/${pr}/head:${ref}`], { cwd: root });
    console.log(`preflight merge: PR #${pr} ${meta.title}`);
    run('git', ['merge', '--no-ff', '--no-edit', ref], { cwd: worktree });
    manifest.push({ number: meta.number, title: meta.title, url: meta.url, headRefOid: meta.headRefOid });
  }

  fs.writeFileSync(path.join(worktree, '.round-merge-preflight.json'), `${JSON.stringify({ base, prs: manifest, runCommand }, null, 2)}\n`);
  console.log(`preflight validation: ${runCommand}`);
  run('bash', ['-lc', runCommand], { cwd: worktree });
  console.log(`round merge preflight ok: ${prs.map((pr) => `#${pr}`).join(' -> ')}`);
  ok = true;
} finally {
  for (const ref of tempRefs) {
    spawnSync('git', ['update-ref', '-d', ref], { cwd: root, stdio: 'ignore' });
  }
  spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'ignore' });
  fs.rmSync(tmpParent, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
