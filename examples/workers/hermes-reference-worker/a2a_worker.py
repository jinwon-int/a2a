#!/usr/bin/env python3
"""Hermes-style A2A HTTP polling worker reference.

This script is intentionally dependency-free and local-dry-run first. It is a
reference implementation for the broker-agnostic worker contract, not a
production worker service.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


SAFE_LOCAL_MODES = {"hermes-reference-dry-run", "local-hermes-smoke"}
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value is not None and value != "" else default


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_json_object(name: str) -> dict[str, Any]:
    raw = os.environ.get(name)
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"{name} must be a JSON object")
    return parsed


def broker_url() -> str:
    return env("A2A_BROKER_URL", "http://127.0.0.1:18787").rstrip("/")


def worker_id() -> str:
    return env("A2A_WORKER_ID", "hermes-agent-reference-worker")


def worker_role() -> str:
    return env("A2A_WORKER_ROLE", "analyst")


def assert_safe_broker_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise SystemExit(f"unsupported broker URL scheme: {parsed.scheme}")
    if parsed.hostname in LOOPBACK_HOSTS:
        return
    if env_bool("A2A_HERMES_REFERENCE_ALLOW_NON_LOOPBACK"):
        return
    raise SystemExit(
        "refusing non-loopback broker URL without "
        "A2A_HERMES_REFERENCE_ALLOW_NON_LOOPBACK=1"
    )


def request_json(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    base = broker_url()
    assert_safe_broker_url(base)
    url = base + path
    payload = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-A2A-Requester-Id": worker_id(),
        "X-A2A-Requester-Kind": "node",
        "X-A2A-Requester-Role": worker_role(),
    }
    edge_secret = os.environ.get("A2A_EDGE_SECRET")
    if edge_secret:
        headers["X-A2A-Edge-Secret"] = edge_secret
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=float(env("A2A_HTTP_TIMEOUT_SEC", "10"))) as res:
            data = res.read().decode("utf-8")
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed: HTTP {error.code} {details}") from error


def registration_payload() -> dict[str, Any]:
    metadata = {
        "runtime": "hermes-agent",
        "openClawRequired": "false",
        "transport": "http-poll",
        "reference": "phase-2-dry-run",
    }
    metadata.update({str(key): str(value) for key, value in env_json_object("A2A_WORKER_METADATA_JSON").items()})
    return {
        "nodeId": worker_id(),
        "role": worker_role(),
        "displayName": env("A2A_WORKER_DISPLAY_NAME", "Hermes Agent Reference Worker"),
        "brokerUrl": broker_url(),
        "workerMode": env("A2A_WORKER_MODE", "mobile"),
        "capabilities": {
            "canAnalyze": True,
            "canBackfill": False,
            "canPatchWorkspace": True,
            "canPromoteLive": False,
            "workspaceIds": [env("A2A_WORKER_WORKSPACE_ID", "public-safe-reference")],
            "environments": [env("A2A_WORKER_ENVIRONMENT", "research")],
        },
        "metadata": metadata,
    }


def register() -> Any:
    return request_json("POST", "/workers/register", registration_payload())


def heartbeat() -> Any:
    return request_json(
        "POST",
        f"/workers/{urllib.parse.quote(worker_id(), safe='')}/heartbeat",
        {
            "displayName": env("A2A_WORKER_DISPLAY_NAME", "Hermes Agent Reference Worker"),
            "metadata": {
                "runtime": "hermes-agent",
                "transport": "http-poll",
                "heartbeat": "ok",
                "heartbeatAtEpochMs": str(int(time.time() * 1000)),
            },
        },
    )


def poll() -> list[dict[str, Any]]:
    params = urllib.parse.urlencode({"worker": worker_id(), "status": "pending", "detail": "full"})
    payload = request_json("GET", f"/tasks?{params}")
    items = payload.get("items", [])
    if not isinstance(items, list):
        raise RuntimeError("unexpected broker task poll response")
    return [item for item in items if isinstance(item, dict)]


def task_payload(task: dict[str, Any]) -> dict[str, Any]:
    payload = task.get("payload")
    return payload if isinstance(payload, dict) else {}


def is_safe_local_task(task: dict[str, Any]) -> bool:
    payload = task_payload(task)
    return payload.get("noLive") is True and str(payload.get("mode", "")) in SAFE_LOCAL_MODES


def run_once() -> dict[str, Any]:
    register()
    heartbeat()
    tasks = poll()
    if not tasks:
        return {"status": "idle", "workerId": worker_id(), "processed": 0}

    task = tasks[0]
    task_id = str(task.get("id", ""))
    if not task_id:
        raise RuntimeError("polled task has no id")
    if not is_safe_local_task(task):
        return {
            "status": "refused",
            "workerId": worker_id(),
            "taskId": task_id,
            "reason": "task payload is not a local noLive Hermes reference dry-run task",
            "processed": 0,
        }

    encoded_task_id = urllib.parse.quote(task_id, safe="")
    body = {"workerId": worker_id()}
    request_json("POST", f"/tasks/{encoded_task_id}/claim", body)
    request_json("POST", f"/tasks/{encoded_task_id}/start", body)
    evidence = {
        "workerId": worker_id(),
        "outcome": "done",
        "result": {
            "summary": "Hermes reference worker completed local dry-run evidence",
            "output": {
                "referenceWorker": "hermes-agent",
                "mode": task_payload(task).get("mode"),
                "openClawRequired": False,
                "liveProviderSend": False,
                "productionMutation": False,
            },
        },
    }
    completed = request_json("POST", f"/tasks/{encoded_task_id}/evidence", evidence)
    return {"status": "processed", "workerId": worker_id(), "taskId": task_id, "task": completed, "processed": 1}


def main() -> int:
    parser = argparse.ArgumentParser(description="Hermes-style A2A worker local dry-run reference")
    parser.add_argument("--action", choices=["register", "heartbeat", "poll", "run-once"], default="run-once")
    args = parser.parse_args()
    if args.action == "register":
        result = register()
    elif args.action == "heartbeat":
        result = heartbeat()
    elif args.action == "poll":
        result = {"items": poll()}
    else:
        result = run_once()
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
