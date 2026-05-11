import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCanaryPreflightHealth, runNoLiveProof } from './canary-preflight-health.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('canary preflight health', () => {
  it('passes no-live proof without any broker contact', () => {
    const report = runNoLiveProof();

    assert.equal(report.ok, true);
    assert.equal(report.mode, 'no-live');
    assert.equal(report.brokerReachable, false);
    assert.equal(report.checks.length, 2);
    assert.ok(report.checks.every((c) => c.ok));
  });

  it('passes when all broker endpoints are healthy', async () => {
    const fetchImpl = async (url, init) => {
      const parsed = new URL(String(url));
      const signal = init?.signal;
      // Ensure signal is not already aborted for valid paths
      if (signal?.aborted) throw new Error('aborted before fetch');
      if (parsed.pathname === '/health') {
        return jsonResponse({ ok: true, service: 'a2a-broker', version: '0.1.0', build: 'test-rev' });
      }
      if (parsed.pathname === '/workers') {
        return jsonResponse({ items: [{ nodeId: 'sogyo', status: 'online' }] });
      }
      if (parsed.pathname === '/tasks/diagnostics') {
        return jsonResponse({ tasks: { byStatus: { queued: 0, claimed: 0, running: 0 }, stale: 0 } });
      }
      if (parsed.pathname === '/a2a/tasks/terminal-outbox') {
        return jsonResponse({ kind: 'task.terminal.outbox', count: 0, cursor: null, events: [] });
      }
      throw new Error(`unexpected path: ${parsed.pathname}`);
    };

    const report = await runCanaryPreflightHealth({
      baseUrl: 'http://broker.local',
      fetchImpl,
      timeoutMs: 1000,
    });

    assert.equal(report.ok, true);
    assert.equal(report.brokerReachable, true);
    assert.equal(report.checks.length, 4);
    assert.ok(report.checks.every((c) => c.ok));
    assert.match(report.checks[0].detail, /healthy/);
    assert.match(report.checks[1].detail, /1 worker/);
    assert.match(report.checks[2].detail, /queued=0/);
    assert.match(report.checks[3].detail, /outbox reachable/);
  });

  it('fails with clear diagnostic when broker is not running (connection refused)', async () => {
    const fetchImpl = async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:8787');
      err.code = 'ECONNREFUSED';
      throw err;
    };

    const report = await runCanaryPreflightHealth({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl,
      timeoutMs: 1000,
    });

    assert.equal(report.ok, false);
    assert.equal(report.brokerReachable, false);
    assert.equal(report.checks.length, 2); // health fail + remaining skipped

    const healthCheck = report.checks[0];
    assert.equal(healthCheck.ok, false);
    assert.equal(healthCheck.check, 'broker reachability');
    assert.match(healthCheck.detail, /connection refused/);
    assert.match(healthCheck.detail, /broker-docker-deployment-runbook\.md/);

    const skippedCheck = report.checks[1];
    assert.equal(skippedCheck.ok, false);
    assert.match(skippedCheck.detail, /skipped/);
  });

  it('fails with clear diagnostic when broker returns 404 on health', async () => {
    const fetchImpl = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/health') {
        return new Response('Not Found', { status: 404 });
      }
      throw new Error(`unexpected path: ${parsed.pathname}`);
    };

    const report = await runCanaryPreflightHealth({
      baseUrl: 'http://broker.local',
      fetchImpl,
      timeoutMs: 1000,
    });

    assert.equal(report.ok, false);
    assert.equal(report.brokerReachable, false);
    const healthCheck = report.checks[0];
    assert.equal(healthCheck.ok, false);
    assert.match(healthCheck.detail, /404/);
    assert.match(healthCheck.detail, /health route is missing/);
  });

  it('fails with timeout diagnostic when broker is unreachable', async () => {
    const fetchImpl = async (_url, init) => {
      if (init?.signal) {
        // Simulate a timeout by aborting
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        err.code = 'ETIMEDOUT';
        throw err;
      }
      throw new Error('unreachable');
    };

    const report = await runCanaryPreflightHealth({
      baseUrl: 'http://unreachable.local:9999',
      fetchImpl,
      timeoutMs: 500,
    });

    assert.equal(report.ok, false);
    assert.equal(report.brokerReachable, false);
    assert.match(report.checks[0].detail, /timed out|unreachable/);
  });

  it('reports health status when broker is reachable but unhealthy', async () => {
    const fetchImpl = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/health') {
        return jsonResponse({ ok: false, service: 'a2a-broker', error: 'persistence unavailable' });
      }
      throw new Error(`unexpected path: ${parsed.pathname}`);
    };

    const report = await runCanaryPreflightHealth({
      baseUrl: 'http://broker.local',
      fetchImpl,
      timeoutMs: 1000,
    });

    assert.equal(report.ok, false);
    assert.equal(report.brokerReachable, false);
    assert.match(report.checks[0].detail, /did not report ok/);
  });

  it('uses only read-only GET requests', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      const parsed = new URL(String(url));
      calls.push({ method: init?.method ?? 'GET', path: parsed.pathname, query: parsed.searchParams.toString() });
      if (parsed.pathname === '/health') {
        return jsonResponse({ ok: true, service: 'a2a-broker', version: '0.1.0', build: 'test' });
      }
      if (parsed.pathname === '/workers') {
        return jsonResponse({ items: [] });
      }
      if (parsed.pathname === '/tasks/diagnostics') {
        return jsonResponse({ tasks: { byStatus: { queued: 0, claimed: 0, running: 0 }, stale: 0 } });
      }
      if (parsed.pathname === '/a2a/tasks/terminal-outbox') {
        return jsonResponse({ kind: 'task.terminal.outbox', count: 0, cursor: null, events: [] });
      }
      throw new Error(`unexpected: ${parsed.pathname}`);
    };

    const report = await runCanaryPreflightHealth({
      baseUrl: 'http://broker.local',
      fetchImpl,
      timeoutMs: 1000,
    });

    assert.equal(report.ok, true);
    assert.equal(calls.every((c) => c.method === 'GET'), true);
    assert.deepEqual(calls.map((c) => c.path), [
      '/health',
      '/workers',
      '/tasks/diagnostics',
      '/a2a/tasks/terminal-outbox',
    ]);
  });

  it('does not expose secrets in output', async () => {
    const fetchImpl = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/health') {
        return jsonResponse({ ok: true, service: 'a2a-broker', version: '0.1.0', build: 'test' });
      }
      if (parsed.pathname === '/workers') {
        return jsonResponse({ items: [] });
      }
      if (parsed.pathname === '/tasks/diagnostics') {
        return jsonResponse({ tasks: { byStatus: { queued: 0, claimed: 0, running: 0 }, stale: 0 } });
      }
      if (parsed.pathname === '/a2a/tasks/terminal-outbox') {
        return jsonResponse({ kind: 'task.terminal.outbox', count: 0, cursor: null, events: [] });
      }
      throw new Error(`unexpected: ${parsed.pathname}`);
    };

    const report = await runCanaryPreflightHealth({
      baseUrl: 'http://broker.local',
      edgeSecret: 'super-secret-test-key-should-not-leak',
      fetchImpl,
      timeoutMs: 1000,
    });

    const json = JSON.stringify(report);
    assert.doesNotMatch(json, /super-secret-test-key-should-not-leak/);
    assert.doesNotMatch(json, /token|chat_id/);
  });
});
