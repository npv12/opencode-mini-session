import type { Plugin } from "@opencode-ai/plugin/tui";
import type { AgentInfo, SessionMessageInfo } from "@opencode-ai/client";
import { DEFAULT_FULL_TOKEN_LIMIT } from "./constants";
import { formatResolvedModel } from "./model";
import type { MiniConfig, MiniMode, ResolvedModel } from "./types";

const MINI_SIDE_QUESTION_INSTRUCTION =
  "You are answering a quick side question about an ongoing coding session. Below is the conversation context from the session. Answer concisely based on what you can see.";

const MINI_FRESH_INSTRUCTION =
  "You are answering a quick side question about an ongoing coding session. No conversation context from the main session has been copied into this mini session. Answer concisely based only on the current mini-session messages and any tools or files you inspect.";

const MINI_TOOL_NOTE = " You may only use the following tools: glob, grep, list, read, webfetch. Do not attempt to use any other tools.";

export type MiniAgentModeResolution =
  | { mode: "plugin-managed"; requestedAgent: string | null; missingAgent?: string; unavailableAgent?: string }
  | { mode: "custom-agent"; requestedAgent: string; agent: string };

export type ResolvedMiniAgent =
  | { mode: "plugin-managed"; requestedAgent: string | null; missingAgent?: string; unavailableAgent?: string; notices: string[] }
  | { mode: "custom-agent"; requestedAgent: string; agent: string; notices: string[] };

export function resolveRuntimeMiniAgent(
  context: Plugin.Context,
  config: MiniConfig,
): ResolvedMiniAgent {
  const agents = context.data.location.agent.list();
  const mode = resolveMiniAgentMode(config, agents ? [...agents] : null);
  return buildResolvedMiniAgent(config, mode);
}

export function resolveMiniAgent(
  config: MiniConfig,
  agents: Pick<AgentInfo, "name">[] | null,
): ResolvedMiniAgent {
  return buildResolvedMiniAgent(config, resolveMiniAgentMode(config, agents));
}

export function resolveMiniAgentMode(
  config: MiniConfig,
  agents: Pick<AgentInfo, "name">[] | null,
): MiniAgentModeResolution {
  if (!config.agent) return { mode: "plugin-managed", requestedAgent: null };
  if (agents === null) return { mode: "plugin-managed", requestedAgent: config.agent, unavailableAgent: config.agent };
  const match = agents.find((a) => a.name === config.agent);
  if (match) return { mode: "custom-agent", requestedAgent: config.agent, agent: match.name };
  return { mode: "plugin-managed", requestedAgent: config.agent, missingAgent: config.agent };
}

export function buildResolvedMiniAgent(config: MiniConfig, mode: MiniAgentModeResolution): ResolvedMiniAgent {
  if (mode.mode === "custom-agent") {
    return { mode: "custom-agent", requestedAgent: mode.requestedAgent, agent: mode.agent, notices: buildMiniAgentNotices(config, mode) };
  }
  return {
    mode: "plugin-managed",
    requestedAgent: mode.requestedAgent,
    missingAgent: mode.missingAgent,
    unavailableAgent: mode.unavailableAgent,
    notices: buildMiniAgentNotices(config, mode),
  };
}

export function buildMiniPreamble(
  contextText: string,
  resolved: ResolvedMiniAgent,
  mode: MiniMode = "main",
): string {
  const intro = buildMiniIntro(resolved, mode);
  const toolNote = resolved.mode === "plugin-managed" ? MINI_TOOL_NOTE : "";
  const sessionContext = contextText.trim()
    ? `\n\n<session-context>\n${contextText}\n</session-context>`
    : "";
  return `${intro}${toolNote}${sessionContext}`;
}

function buildMiniIntro(resolved: ResolvedMiniAgent, mode: MiniMode): string {
  if (resolved.mode !== "custom-agent") {
    return mode === "fresh" ? MINI_FRESH_INSTRUCTION : MINI_SIDE_QUESTION_INSTRUCTION;
  }
  if (mode === "fresh") {
    return `You are answering a quick side question about an ongoing coding session and you are running as the configured OpenCode agent "${resolved.agent}". Follow that agent's own instructions, role, tone, and constraints closely while answering this as a mini side question. No conversation context from the main session has been copied into this mini session.`;
  }
  return `You are answering a quick side question about an ongoing coding session and you are running as the configured OpenCode agent "${resolved.agent}". Follow that agent's own instructions, role, tone, and constraints closely while answering this as a mini side question. Below is the conversation context from the session.`;
}

export function buildSessionCreatePayload(
  resolved: ResolvedMiniAgent,
  base: { title: string; directory: string; agent?: string; model?: NonNullable<ResolvedModel> & { variant?: string } },
): {
  title: string;
  agent?: string;
  model?: NonNullable<ResolvedModel> & { variant?: string };
  location?: { directory: string };
} {
  return {
    title: base.title,
    location: { directory: base.directory },
    ...(resolved.mode === "custom-agent" ? { agent: resolved.agent } : {}),
    ...(base.model?.providerID && base.model?.id
      ? { model: { providerID: base.model.providerID, id: base.model.id, ...(base.model.variant ? { variant: base.model.variant } : {}) } }
      : {}),
  };
}

export function formatMiniNotice(...notices: Array<string | undefined>): string | undefined {
  const filtered = notices.filter((n): n is string => typeof n === "string" && n.length > 0);
  return filtered.length > 0 ? filtered.join(" ") : undefined;
}

export function buildMiniErrorDetail(options: {
  path: string;
  sessionID?: string;
  resolvedModel: ResolvedModel;
  resolvedAgent: ResolvedMiniAgent;
}): string {
  return [
    `Diagnostics: path=${options.path}`,
    `session=${options.sessionID ?? "pending"}`,
    `mode=${options.resolvedAgent.mode}`,
    `agent=${options.resolvedAgent.mode === "custom-agent" ? options.resolvedAgent.agent : "(plugin-managed)"}`,
    `model=${formatResolvedModel(options.resolvedModel)}`,
  ].join(", ");
}

function buildMiniAgentNotices(config: MiniConfig, mode: MiniAgentModeResolution): string[] {
  const notices: string[] = [];
  if (mode.mode === "plugin-managed" && mode.missingAgent) {
    notices.push(`Configured mini agent ${mode.missingAgent} was not found. Falling back to plugin-managed mini mode.`);
  }
  if (mode.mode === "plugin-managed" && mode.unavailableAgent) {
    notices.push(`Could not verify configured mini agent ${mode.unavailableAgent} because the agent list is unavailable. Falling back to plugin-managed mini mode.`);
  }
  return notices;
}
