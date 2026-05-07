import { definePluginEntry, type OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { A2A_BROKER_ADAPTER_PLUGIN_ID } from "./plugin-id.js";
import { createA2AGatewayHandlers } from "./src/gateway-handlers.js";
import { createA2AMonitoringHandlers } from "./src/gateway-monitoring-handlers.js";
import { createA2ASessionsSendHook } from "./src/sessions-send-hook.js";

export {
  buildTeamAssignmentRequests,
  normalizeTeamAssignment,
  validateTeamAssignmentInput,
  TeamAssignmentErrorCodes,
  TeamAssignmentModes,
} from "./src/team-assignment-normalizer.js";
export type {
  TeamAssignmentMode,
  TeamAssignmentInput,
  TeamAssignmentResult,
  TeamAssignmentRequester,
  TeamAssignmentConstraints,
  TeamAssignmentValidation,
  TeamAssignmentValidationError,
  TeamAssignmentErrorCode,
  TeamAssignmentBuildResult,
} from "./src/team-assignment-normalizer.js";

type SessionsSendHookApi = OpenClawPluginApi & {
  on: (
    hookName: "sessions_send",
    handler: ReturnType<typeof createA2ASessionsSendHook>,
    opts?: { priority?: number },
  ) => void;
};

function registerSessionsSendHook(
  api: OpenClawPluginApi,
  hook: ReturnType<typeof createA2ASessionsSendHook>,
): void {
  // The sessions_send hook is an OpenClaw integration seam used by this plugin,
  // but some published SDK typings do not list it yet. Keep this adapter buildable
  // against those hosts while still registering the hook when the runtime supports it.
  (api as SessionsSendHookApi).on("sessions_send", hook);
}

export default definePluginEntry({
  id: A2A_BROKER_ADAPTER_PLUGIN_ID,
  name: "A2A Broker Adapter",
  description: "Standalone A2A broker gateway method registration and broker routing",
  register(api: OpenClawPluginApi) {
    const handlers = createA2AGatewayHandlers(api.config);
    const monitoringHandlers = createA2AMonitoringHandlers(api.config, { runtime: api.runtime });
    const sessionsSendHook = createA2ASessionsSendHook(api.config, api.runtime);

    // Config migration: preserve explicit activation for existing A2A config.
    // Environments that already set broker config should keep working after
    // core a2a.task.* ownership moves behind the plugin gate.
    api.registerConfigMigration((config) => {
      const entry = config.plugins?.entries?.[A2A_BROKER_ADAPTER_PLUGIN_ID];
      if (!entry?.config || entry.enabled === false) {
        return null;
      }

      const allow = config.plugins?.allow;
      const shouldEnable = entry.enabled !== true;
      const shouldAllowlist = Array.isArray(allow) && !allow.includes(A2A_BROKER_ADAPTER_PLUGIN_ID);
      if (!shouldEnable && !shouldAllowlist) {
        return null;
      }

      const migrated = structuredClone(config);
      const plugins = { ...migrated.plugins };
      const entries = { ...plugins.entries };
      entries[A2A_BROKER_ADAPTER_PLUGIN_ID] = {
        ...entries[A2A_BROKER_ADAPTER_PLUGIN_ID],
        enabled: true,
      };
      plugins.entries = entries;
      if (shouldAllowlist) {
        plugins.allow = [...allow, A2A_BROKER_ADAPTER_PLUGIN_ID];
      }
      migrated.plugins = plugins;

      const changes: string[] = [];
      if (shouldEnable) {
        changes.push("a2a-broker-adapter: auto-enabled (existing config detected)");
      }
      if (shouldAllowlist) {
        changes.push("a2a-broker-adapter: added to plugins.allow (existing config detected)");
      }
      return {
        config: migrated,
        changes,
      };
    });

    registerSessionsSendHook(api, sessionsSendHook);

    // Start broker operator monitoring as part of plugin activation. Previously
    // terminal-outbox notification draining only started after an explicit
    // a2a.monitor.status call with operatorEvents.enabled=true, so completed
    // worker tasks could remain unacknowledged and invisible in Telegram until
    // an operator manually queried status.
    monitoringHandlers.startOperatorEventBridge();

    // Gateway method registration (ownership from core)
    // Scopes match the original core classification:
    //   a2a.task.status          -> operator.read
    //   a2a.task.request         -> operator.write
    //   a2a.task.update          -> operator.write
    //   a2a.task.cancel          -> operator.write
    //   a2a.task.approve         -> operator.approvals
    //   a2a.task.reject_approval -> operator.approvals
    api.registerGatewayMethod("a2a.task.request", handlers.handleA2ATaskRequest, {
      scope: "operator.write",
    });
    api.registerGatewayMethod("a2a.task.update", handlers.handleA2ATaskUpdate, {
      scope: "operator.write",
    });
    api.registerGatewayMethod("a2a.task.cancel", handlers.handleA2ATaskCancel, {
      scope: "operator.write",
    });
    api.registerGatewayMethod("a2a.task.approve", handlers.handleA2ATaskApprove, {
      scope: "operator.approvals",
    });
    api.registerGatewayMethod("a2a.task.reject_approval", handlers.handleA2ATaskRejectApproval, {
      scope: "operator.approvals",
    });
    api.registerGatewayMethod("a2a.task.status", handlers.handleA2ATaskStatus, {
      scope: "operator.read",
    });

    // Peer status gateway method (read-only)
    api.registerGatewayMethod("a2a.peer.status", handlers.handleA2APeerStatus, {
      scope: "operator.read",
    });

    // Monitoring gateway methods (operator.read scope)
    api.registerGatewayMethod("a2a.alerts.list", monitoringHandlers.handleA2AAlertsList, {
      scope: "operator.read",
    });
    api.registerGatewayMethod("a2a.monitor.status", monitoringHandlers.handleA2AMonitorStatus, {
      scope: "operator.read",
    });
  },
});
