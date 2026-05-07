// Plugin-side detection for whether a `sessions_send` target key looks like a
// remote A2A node-id rather than a locally-visible session key. Stays out of
// any core (openclaw) imports so the plugin can ship the heuristic ahead of the
// core pre-visibility hook landing (see openclaw#50 / openclaw#51).

export type RemoteNodeResolution =
  | { remote: false }
  | { remote: true; nodeId: string; delegatable: boolean };

export type ResolveRemoteNodeIdOptions = {
  knownLocalAgents?: ReadonlyArray<string> | ReadonlySet<string>;
};

const LOCAL_AGENT_PREFIX_SEPARATOR = ":";

function asSet(
  value: ReadonlyArray<string> | ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Set) {
    return value;
  }
  return new Set(value);
}

export function resolveRemoteNodeId(
  key: string,
  options: ResolveRemoteNodeIdOptions = {},
): RemoteNodeResolution {
  if (typeof key !== "string") {
    return { remote: false };
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return { remote: false };
  }
  // Local session keys carry an agent prefix separator (e.g.
  // "agent:main:telegram:..."), so anything containing ":" is treated as a
  // local session reference and left alone.
  if (trimmed.includes(LOCAL_AGENT_PREFIX_SEPARATOR)) {
    return { remote: false };
  }
  const knownLocal = asSet(options.knownLocalAgents);
  if (knownLocal?.has(trimmed)) {
    return { remote: false };
  }
  return { remote: true, nodeId: trimmed, delegatable: true };
}

export function isRemoteNodeKey(key: string, options?: ResolveRemoteNodeIdOptions): boolean {
  return resolveRemoteNodeId(key, options).remote;
}
