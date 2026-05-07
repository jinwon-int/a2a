declare module "openclaw/plugin-sdk/gateway-runtime" {
  export type GatewayRequestHandlerOptions = {
    params: unknown;
    respond: (ok: boolean, result?: unknown, error?: unknown) => void;
  };
}

declare module "openclaw/plugin-sdk/plugin-entry" {
  type AgentWaitRunStatus = "pending" | "ok" | "error" | "timeout";

  type AgentWaitRunRecord = {
    runId: string;
    status: AgentWaitRunStatus;
    error?: string;
    replyText?: string;
    startedAt?: number;
    endedAt?: number;
  };

  export type OpenClawPluginApi = {
    config: any;
    runtime: {
      subagent: {
        run: (...args: unknown[]) => Promise<{ runId: string }>;
        waitForRun: (...args: unknown[]) => Promise<{ status: string }>;
        getSessionMessages: (...args: unknown[]) => Promise<{ messages: unknown[] }>;
        getSession?: (...args: unknown[]) => Promise<unknown>;
        deleteSession?: (...args: unknown[]) => Promise<void>;
      };
      agent: {
        waitRuns: {
          create: (params?: { runId?: string; startedAt?: number }) => AgentWaitRunRecord;
          get: (runId: string) => AgentWaitRunRecord | null;
          wait: (params: {
            runId: string;
            timeoutMs: number;
          }) => Promise<AgentWaitRunRecord | null>;
          resolve: (params: {
            runId: string;
            replyText?: string;
            startedAt?: number;
            endedAt?: number;
          }) => AgentWaitRunRecord;
          fail: (params: {
            runId: string;
            status?: "error" | "timeout";
            error?: string;
            replyText?: string;
            startedAt?: number;
            endedAt?: number;
          }) => AgentWaitRunRecord;
          cancel: (params: {
            runId: string;
            error?: string;
            replyText?: string;
            startedAt?: number;
            endedAt?: number;
          }) => AgentWaitRunRecord;
          clear: (runId: string) => boolean;
        };
        session: {
          resolveStorePath: (...args: unknown[]) => string;
          loadSessionStore: (...args: unknown[]) => Record<string, unknown>;
        };
      };
      channel: {
        outbound: {
          loadAdapter: (...args: unknown[]) => Promise<{
            sendText?: (params: Record<string, unknown>) => Promise<unknown>;
          }>;
        };
      };
    };
    registerConfigMigration: (
      migrate: (
        config: any,
      ) => { config: any; changes: string[] } | null,
    ) => void;
    registerGatewayMethod: (
      method: string,
      handler: (opts: import("openclaw/plugin-sdk/gateway-runtime").GatewayRequestHandlerOptions) => void | Promise<void>,
      opts?: { scope?: string },
    ) => void;
  };

  export function definePluginEntry<T>(entry: T): T;
}
