import type { Plugin } from "@opencode-ai/plugin/tui";
import type { SessionMessageInfo } from "@opencode-ai/client";

export function getSessionEntries(
  context: Plugin.Context,
  sessionID: string,
): SessionMessageInfo[] {
  return context.data.session.message.list(sessionID).slice()
    .sort((a, b) => {
      const aTime = isFinite((a.time as { created?: number })?.created ?? NaN) ? (a.time as { created?: number }).created! : 0;
      const bTime = isFinite((b.time as { created?: number })?.created ?? NaN) ? (b.time as { created?: number }).created! : 0;
      return aTime - bTime;
    });
}

export function buildCopiedContext(entries: SessionMessageInfo[], tokenLimit: number) {
  const chunks = entries
    .map((entry) => {
      const text = formatEntry(entry);
      return text ? { text, tokens: estimateTokens(text) } : undefined;
    })
    .filter((chunk): chunk is { text: string; tokens: number } => Boolean(chunk));
  const totalAvailableTokens = chunks.reduce((total, chunk) => total + chunk.tokens, 0);
  const selected: string[] = [];
  let usedTokens = 0;

  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (selected.length > 0 && usedTokens + chunk.tokens > tokenLimit) break;
    selected.push(chunk.text);
    usedTokens += chunk.tokens;
    if (usedTokens >= tokenLimit) break;
  }

  if (selected.length === 0) {
    return { text: "No conversation context available.", usedTokens: 0, totalAvailableTokens };
  }

  return { text: selected.reverse().join("\n\n"), usedTokens, totalAvailableTokens };
}

function formatEntry(entry: SessionMessageInfo): string {
  if (entry.type === "user") {
    return entry.text.trim() ? `user:\n${entry.text.trim()}` : "";
  }
  if (entry.type === "assistant") {
    const lines: string[] = [];
    for (const part of entry.content) {
      if (part.type === "text" && part.text.trim()) lines.push(part.text.trim());
      if (part.type === "tool") lines.push(`[tool: ${part.name}${formatToolInput(part.state)}]`);
    }
    return lines.length > 0 ? `assistant:\n${lines.join("\n")}` : "";
  }
  return "";
}

function formatToolInput(state: { input?: string | Record<string, unknown> }): string {
  const input = state.input;
  if (!input) return "";
  if (typeof input === "string") return input ? ` ${input}` : "";
  const pairs = Object.entries(input).slice(0, 4).map(([k, v]) => `${k}=${summarizeValue(v)}`);
  return pairs.length > 0 ? ` ${pairs.join(" ")}` : "";
}

function summarizeValue(value: unknown): string {
  if (typeof value === "string") return truncate(value.replace(/\s+/g, " "), 48);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value && typeof value === "object") return "{...}";
  return String(value);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.4);
}
