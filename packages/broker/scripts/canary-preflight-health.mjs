#!/usr/bin/env node
// Canary preflight health check — verifies broker is reachable before canary ops.
// Fixes the 404 issue: previous canary attempts failed because the broker wasn't
// running. This script provides clear diagnostics instead of cryptic errors.
//
// Safety: read-only GET requests only. No deploy, Gateway restart, Telegram send,
// DB mutation, or terminal-outbox ACK.

import process from 'node:process';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
const REQUESTER_ID = 'canary-preflight-health';

function ok(check, detail, extra = {}) {
  return { ok: true, check, detail, ...extra };
}

function fail(check, detail, extra = {}) {
  return { ok: false, check, detail, ...extra };
}

function parseArgs(argv) {
  const readOption = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    baseUrl: readOption('--base-url') ?? process.env.BROKER_URL ?? DEFAULT_BASE_URL,
    edgeSecret: readOption('--edge-secret') ?? process.env.BROKER_EDGE_SECRET ?? process.env.EDGE_SECRET,
    timeoutMs: Number(readOption('--timeout') ?? 5000),
    json: argv.includes('--json'),
    markdown: argv.includes('--markdown'),
  };
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function buildHeaders(edgeSecret) {
  const headers = {
    'accept': 'application/json',
    'x-a2a-requester-id': REQUESTER_ID,
    'x-a2a-requester-role': 'operator',
  };
  if (edgeSecret) {
    headers['x-a2a-edge-secret'] = edgeSecret;
    headers['x-edge-secret'] = edgeSecret;
  }
  return headers;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function checkEndpoint(fetchImpl, baseUrl, path, headers, timeoutMs, label) {
  const url = new URL(path, ensureTrailingSlash(baseUrl));
  try {
    const response = await fetchWithTimeout(fetchImpl, url, { method: 'GET', headers }, timeoutMs);
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { parseError: true, preview: text.slice(0, 160) };
    }
    return { status: response.status, body, error: null, ok: response.ok };
  } catch (err) {
    return {
      status: null,
      body: null,
      ok: false,
      error: {
        message: err.message,
        code: err.code ?? null,
        cause: err.cause?.code ?? null,
      },
    };
  }
}

export async function runCanaryPreflightHealth(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this Node runtime');
  }

  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? 5000;
  const headers = buildHeaders(options.edgeSecret);
  const checks = [];

  // 1. Health endpoint
  const health = await checkEndpoint(fetchImpl, baseUrl, '/health', headers, timeoutMs, 'health');
  if (health.error) {
    const errorDetail = health.error.code === 'ECONNREFUSED'
      ? `broker not running at ${baseUrl} — connection refused. Deploy the broker first (see broker-docker-deployment-runbook.md)`
      : health.error.code === 'ENOTFOUND' || health.error.code === 'EAI_AGAIN'
        ? `cannot resolve broker host at ${baseUrl} — check DNS/hostname`
        : health.error.code === 'ETIMEDOUT' || health.error.cause === 'UND_ERR_CONNECT_TIMEOUT'
          ? `broker at ${baseUrl} is unreachable — timed out after ${timeoutMs}ms. Check network/firewall and ensure broker is running`
          : `cannot reach broker at ${baseUrl}: ${health.error.message} (code=${health.error.code ?? 'unknown'})`;
    checks.push(fail('broker reachability', errorDetail, { baseUrl, error: health.error }));
  } else if (health.status === 404) {
    checks.push(fail('broker health endpoint', `GET ${baseUrl}/health returned 404 — broker may be deployed but /health route is missing. Verify the broker image/version includes the health endpoint.`));
  } else if (health.status !== 200) {
    checks.push(fail('broker health endpoint', `GET ${baseUrl}/health returned HTTP ${health.status} — expected 200`));
  } else if (!(health.body?.ok === true || health.body?.status === 'ok')) {
    checks.push(fail('broker health status', `health endpoint returned 200 but payload did not report ok: ${JSON.stringify(health.body).slice(0, 200)}`));
  } else {
    checks.push(ok('broker health', `healthy — ${health.body.service ?? 'a2a-broker'} v${health.body.version ?? '?'} rev=${health.body.build ?? '?'}`, {
      service: health.body.service ?? null,
      version: health.body.version ?? null,
      build: health.body.build ?? null,
      persistence: health.body.persistence?.kind ?? null,
    }));
  }

  // If health check failed, skip remaining endpoints and report early
  if (!checks[0].ok) {
    checks.push(fail('remaining endpoints', 'skipped — broker health check failed. Fix broker reachability first.'));
    return {
      kind: 'canary-preflight-health',
      baseUrl,
      timeoutMs,
      checks,
      ok: false,
      brokerReachable: false,
    };
  }

  // 2. Workers endpoint
  const workers = await checkEndpoint(fetchImpl, baseUrl, '/workers', headers, timeoutMs, 'workers');
  if (workers.status === 200 && workers.body) {
    const items = Array.isArray(workers.body?.items) ? workers.body.items
      : Array.isArray(workers.body?.workers) ? workers.body.workers
      : Array.isArray(workers.body?.byNode) ? workers.body.byNode
      : [];
    const online = items.filter((w) => w?.status === 'online' || w?.online === true);
    checks.push(ok('workers endpoint', `${items.length} worker(s) registered, ${online.length} online`, {
      total: items.length,
      online: online.length,
      onlineIds: online.map((w) => w.nodeId ?? w.id).filter(Boolean),
    }));
  } else {
    checks.push(fail('workers endpoint', `GET /workers returned ${workers.status ?? 'error'}: ${workers.error?.message ?? 'unexpected response'}`));
  }

  // 3. Diagnostics endpoint
  const diag = await checkEndpoint(fetchImpl, baseUrl, '/tasks/diagnostics', headers, timeoutMs, 'diagnostics');
  if (diag.status === 200 && diag.body) {
    const byStatus = diag.body?.tasks?.byStatus ?? diag.body?.byStatus ?? {};
    checks.push(ok('diagnostics endpoint', `queued=${byStatus.queued ?? 0}, claimed=${byStatus.claimed ?? 0}, running=${byStatus.running ?? 0}, stale=${diag.body?.tasks?.stale ?? diag.body?.stale ?? 0}`, {
      queued: byStatus.queued ?? 0,
      claimed: byStatus.claimed ?? 0,
      running: byStatus.running ?? 0,
      stale: diag.body?.tasks?.stale ?? diag.body?.stale ?? 0,
    }));
  } else {
    checks.push(fail('diagnostics endpoint', `GET /tasks/diagnostics returned ${diag.status ?? 'error'}`));
  }

  // 4. Terminal outbox endpoint
  const outbox = await checkEndpoint(fetchImpl, baseUrl, '/a2a/tasks/terminal-outbox?limit=1', headers, timeoutMs, 'outbox');
  if (outbox.status === 200 && outbox.body?.kind === 'task.terminal.outbox') {
    checks.push(ok('terminal outbox endpoint', `outbox reachable — ${outbox.body.count ?? '?'} event(s), cursor=${outbox.body.cursor ?? 'null'}`));
  } else if (outbox.status === 404) {
    checks.push(fail('terminal outbox endpoint', 'GET /a2a/tasks/terminal-outbox returned 404 — broker may not have terminal outbox support. Verify broker version includes terminal-event-outbox.'));
  } else {
    checks.push(fail('terminal outbox endpoint', `GET /a2a/tasks/terminal-outbox returned ${outbox.status ?? 'error'}: ${outbox.error?.message ?? 'unexpected response'}`));
  }

  return {
    kind: 'canary-preflight-health',
    baseUrl,
    timeoutMs,
    checks,
    ok: checks.every((c) => c.ok),
    brokerReachable: true,
  };
}

export function runNoLiveProof(options = {}) {
  return {
    kind: 'canary-preflight-health',
    mode: 'no-live',
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    checks: [
      ok('run mode', 'no-live synthetic proof; no broker HTTP requests, no deploy, no Gateway restart, no Telegram send, no DB mutation'),
      ok('safety gate', 'read-only proof only; expects broker to be deployed separately before live canary'),
    ],
    ok: true,
    brokerReachable: false,
  };
}

function renderMarkdown(report) {
  const title = report.ok ? 'PASS' : 'FAIL';
  const lines = [
    `${title}: canary preflight health check`,
    '',
    `Broker URL: ${report.baseUrl}`,
    `Broker reachable: ${report.brokerReachable ? 'yes' : 'no'}`,
    '',
    'Endpoints:',
    ...report.checks.map((c) => `- ${c.ok ? '✓' : '✗'} ${c.check}: ${c.detail}`),
  ];
  if (!report.brokerReachable && report.mode !== 'no-live') {
    lines.push(
      '',
      '⚠️  Broker is not reachable. Before running canary:',
      '  1. Deploy the broker: see broker-docker-deployment-runbook.md',
      '  2. Verify with: curl -sf <broker-url>/health',
      '  3. Re-run this preflight check',
    );
  }
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const noLive = process.argv.includes('--no-live') || process.argv.includes('--dry-run');
  const report = noLive ? runNoLiveProof(options) : await runCanaryPreflightHealth(options);

  if (options.markdown && !options.json) {
    console.log(renderMarkdown(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`canary-preflight-health: ${error.message}`);
    process.exit(2);
  });
}
