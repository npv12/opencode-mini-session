/** @jsxImportSource @opentui/solid */
import {
  type InputRenderable,
  type ScrollBoxRenderable,
  SyntaxStyle,
} from "@opentui/core";
import type { Plugin } from "@opencode-ai/plugin/tui";
import type { ModelInfo, SessionMessageAssistantText, SessionMessageAssistantReasoning, SessionMessageAssistantTool, SessionMessageInfo } from "@opencode-ai/client";
import { createMemo, Show } from "solid-js";
import { THINKING_TEXT } from "../constants";
import type {
  AnswerDialogProps,
  AnswerDialogState,
  OverlayState,
} from "../types";
import { extractAssistantText } from "../session";
import { ActionButton } from "./ActionButton";
import { buildMiniTheme, type MiniTheme } from "../theme";

function buildSyntaxStyle(theme: MiniTheme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "markup.heading": { fg: theme.markdownHeading, bold: true },
    "markup.strong": { fg: theme.markdownStrong, bold: true },
    "markup.italic": { fg: theme.markdownEmph, italic: true },
    "markup.link": { fg: theme.markdownLink },
    "markup.link.label": { fg: theme.markdownLinkText },
    "markup.link.url": { fg: theme.markdownLink },
    "markup.raw": { fg: theme.markdownCode },
    "markup.raw.block": { fg: theme.markdownCodeBlock },
    "markup.strikethrough": { fg: theme.markdownText },
    blockquote: { fg: theme.markdownBlockQuote },
    conceal: { fg: theme.border, dim: true },
    comment: { fg: theme.syntaxComment },
    keyword: { fg: theme.syntaxKeyword },
    function: { fg: theme.syntaxFunction },
    variable: { fg: theme.syntaxVariable },
    string: { fg: theme.syntaxString },
    number: { fg: theme.syntaxNumber },
    type: { fg: theme.syntaxType },
    operator: { fg: theme.syntaxOperator },
    punctuation: { fg: theme.syntaxPunctuation },
  });
}

type MiniPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; id: string; text: string; time?: { start?: number; end?: number }; metadata?: unknown }
  | { type: "tool"; text: string; status: string }
  | { type: "meta"; text: string };

type MiniMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MiniPart[];
  modelName?: string;
};

const THINKING_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function resolveAssistantModelName(models: ModelInfo[] | undefined, agent: string, model: { providerID: string; id: string } | undefined): string | undefined {
  if (!model) return undefined;
  const found = models?.find((m) => m.providerID === model.providerID && m.id === model.id);
  return found?.name || `${model.providerID}/${model.id}`;
}

export function AnswerDialog(props: AnswerDialogProps) {
  const theme = () => buildMiniTheme(props.context.theme);
  const mdSyntaxStyle = buildSyntaxStyle(theme());
  let scroller: ScrollBoxRenderable | undefined;
  let input: InputRenderable | undefined;
  let inputValue = "";

  const screenWidth = props.context.renderer.width;
  const screenHeight = props.context.renderer.height;
  const panelWidth = Math.min(100, Math.floor(screenWidth * 0.85));
  const panelHeight = Math.max(14, Math.min(screenHeight - 6, Math.floor(screenHeight * 0.68)));
  const transcriptWidth = Math.max(20, panelWidth - 6);
  const promptContentWidth = Math.max(10, transcriptWidth - 6);
  const transcriptHeight = Math.max(1, panelHeight - 13);
  const transcriptContentWidth = Math.max(20, transcriptWidth - 5);

  const shiftLeft = Math.floor(screenWidth * 0.3);

  const messages = createMemo(() => buildMiniMessages(props.state, props.context));
  const estimatedContentHeight = createMemo(() => estimateMiniMessagesHeight(messages(), props.state, transcriptContentWidth) + 4);
  const contentOverflows = createMemo(() => estimatedContentHeight() > transcriptHeight - 2);
  const showScrollbar = createMemo(() => props.state.scrollbarVisible || contentOverflows());
  const canContinue = createMemo(() => !props.state.loading && !props.state.error && Boolean(extractAssistantText(props.state.entries) || props.state.streamingAnswer.trim()));
  const createUserMessageHint = createMemo(() => getCreateUserMessageHint(props.state));
  const footerCounter = createMemo(() => props.state.footerCounter);
  const hasFooterCounter = createMemo(() => Boolean(footerCounter().miniSession || footerCounter().copiedContext));
  const footerModelName = createMemo(() => truncateWithEllipsis(props.modelName, Math.max(0, promptContentWidth - getFooterCounterWidth(footerCounter()) - (hasFooterCounter() ? 3 : 0))));

  return (
    <box position="absolute" top={0} left={0} width={screenWidth} height={screenHeight} justifyContent="center" alignItems="center">
      <box position="absolute" top={0} left={0} width={screenWidth} height={screenHeight} backgroundColor="#000000" opacity={0.65} />
      <box marginLeft={-shiftLeft} width={panelWidth} height={panelHeight} flexDirection="column" backgroundColor={theme().backgroundPanel}>
        {/* header */}
        <box paddingTop={1} paddingLeft={3} paddingRight={3} flexDirection="row" justifyContent="flex-start" alignItems="center" marginBottom={1}>
          <text fg={theme().text}><b>{props.title}</b></text>
        </box>
        {/* transcript */}
        <box paddingLeft={3} paddingRight={3}>
          <scrollbox
            ref={(node) => { scroller = node; props.onScroller?.(node); }}
            height={transcriptHeight}
            width={transcriptWidth}
            scrollY
            stickyScroll
            stickyStart="bottom"
            verticalScrollbarOptions={{ visible: showScrollbar() }}
          >
            <box flexDirection="column" gap={1} width={transcriptContentWidth}>
              {props.state.notice ? <text fg={theme().warning}>Warning: {props.state.notice}</text> : null}
              {messages().length > 0
                ? messages().map((message) => (
                    <box flexDirection="column" gap={0}>
                      <text fg={message.role === "assistant" ? theme().primary : theme().secondary}>
                        <b>{message.role === "assistant" ? `assistant [${message.modelName ?? props.modelName}]` : message.role}</b>
                      </text>
                      {message.parts.map((part, index) => (
                        <box marginTop={getMiniPartTopMargin(message.parts, index, message.role)}>
                          {part.type === "reasoning" ? (
                            <ThinkingPart theme={theme()} part={part} expanded={isThinkingPartExpanded(props.state, part)} spinnerFrame={props.state.spinnerFrame} onToggle={() => props.onToggleThinkingPart(part.id)} />
                          ) : message.role === "assistant" && part.type === "text" && !props.state.loading ? (
                            <markdown content={part.text} syntaxStyle={mdSyntaxStyle} fg={theme().markdownText} streaming={props.state.loading} width={transcriptContentWidth} />
                          ) : (
                            <text fg={getMiniPartColor(theme(), part)}>{formatMiniPart(part)}</text>
                          )}
                        </box>
                      ))}
                    </box>
                  ))
                : props.state.loading
                  ? <text fg={theme().textMuted}>{THINKING_TEXT}</text>
                  : <text fg={theme().textMuted}>Ask a side question below.</text>
              }
              {props.state.error ? <text fg={theme().error}>Error: {props.state.error}</text> : null}
              {props.state.errorDetail ? <text fg={theme().textMuted}>{props.state.errorDetail}</text> : null}
              {createUserMessageHint() ? <text fg={theme().warning}>{createUserMessageHint()}</text> : null}
              {props.state.loading && messages().length > 0 ? <text fg={theme().textMuted}>{THINKING_TEXT}</text> : null}
            </box>
          </scrollbox>
        </box>
        <box paddingLeft={3} paddingRight={3} paddingBottom={1} flexDirection="column" gap={1} marginTop={1}>
          <box width={transcriptWidth} height={6} backgroundColor={theme().borderSubtle} flexDirection="column" paddingTop={1} paddingLeft={2} paddingRight={2} paddingBottom={1} justifyContent="space-between">
            <input
              ref={(node) => { input = node; props.onInput?.(node); }}
              width={promptContentWidth}
              placeholder={props.state.inputPlaceholder ?? (props.state.loading ? "Waiting for response..." : "Ask a question...")}
              textColor={theme().text}
              placeholderColor={theme().textMuted}
              backgroundColor={theme().borderSubtle}
              focusedTextColor={theme().text}
              cursorColor={theme().primary}
              focusedBackgroundColor={theme().borderSubtle}
              onInput={(value) => { inputValue = value; }}
              onSubmit={() => { const submitted = (input?.value || inputValue).trim(); if (!submitted || props.state.loading) return; if (!props.onSubmit(submitted)) return; inputValue = ""; if (input) input.value = ""; }}
            />
            <box flexDirection="row" justifyContent="space-between" alignItems="center" width={promptContentWidth} gap={3}>
              <text fg={theme().text}>{footerModelName()}</text>
              <Show when={hasFooterCounter()}>
                <FooterCounter theme={theme()} state={footerCounter()} />
              </Show>
            </box>
          </box>
          <box flexDirection="row" justifyContent="flex-end" alignItems="center" width={transcriptWidth} gap={2}>
            <Show when={canContinue()}>
              <ActionButton context={props.context} label="Continue" keybind="shift+enter" onPress={props.onContinue} />
            </Show>
            <ActionButton context={props.context} label="Toggle" keybind={props.hideKey || undefined} onPress={props.onHide} />
            <ActionButton context={props.context} label="Thinking" keybind={props.toggleThinkingKeybind || undefined} onPress={props.onToggleThinking} />
            <ActionButton context={props.context} label="Model" keybind="tab" onPress={props.onChangeModel} />
          </box>
        </box>
      </box>
    </box>
  );
}

function buildMiniMessages(state: AnswerDialogState, context: Plugin.Context): MiniMessage[] {
  const models = context.data.location.model.list();
  const messages: MiniMessage[] = [];
  for (const entry of state.entries) {
    const miniParts: MiniPart[] = [];
    if (entry.type === "user" && entry.text.trim()) miniParts.push({ type: "text", text: entry.text.trim() });
    if (entry.type === "assistant") {
      for (const part of entry.content) {
        miniParts.push(...toMiniParts(part));
      }
    }
    if (miniParts.length === 0) continue;
    const modelName = entry.type === "assistant" ? resolveAssistantModelName(models, entry.agent, entry.model) : undefined;
    const message: MiniMessage = { id: entry.id, role: entry.type === "assistant" ? "assistant" : "user", parts: miniParts, modelName };
    const previous = messages[messages.length - 1];
    if (shouldMergeMiniMessages(previous, message)) { previous.parts.push(...message.parts); previous.modelName ??= message.modelName; continue; }
    messages.push(message);
  }
  if (!state.streamingAnswer) return messages;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) { messages.push({ id: "streaming-assistant", role: "assistant", parts: [{ type: "text", text: state.streamingAnswer }], modelName: undefined }); return messages; }
  const lastText = [...lastAssistant.parts].reverse().find((p): p is Extract<MiniPart, { type: "text" }> => p.type === "text");
  if (lastText) {
    const s = state.streamingAnswer.trim();
    const t = lastText.text.trim();
    if (s === t) { /* identical */ }
    else if (s.startsWith(t) && s.length > t.length) lastText.text = state.streamingAnswer;
    else if (!t.endsWith(s)) lastText.text += state.streamingAnswer;
  } else {
    const lastReasoning = [...lastAssistant.parts].reverse().find((p) => p.type === "reasoning");
    if (!lastReasoning || lastReasoning.text.trim() !== state.streamingAnswer.trim()) {
      lastAssistant.parts.push({ type: "text", text: state.streamingAnswer });
    }
  }
  return messages;
}

function shouldMergeMiniMessages(previous: MiniMessage | undefined, current: MiniMessage) {
  return Boolean(previous && previous.role === "assistant" && current.role === "assistant");
}

type ThinkingMiniPart = Extract<MiniPart, { type: "reasoning" }>;

function ThinkingPart(props: { theme: MiniTheme; part: ThinkingMiniPart; expanded: boolean; spinnerFrame: number; onToggle: () => void }) {
  const header = () => formatThinkingHeader(props.part, props.expanded, props);
  const body = () => getThinkingBodyText(props.part);
  return (
    <box flexDirection="column" gap={0} opacity={props.expanded ? 0.65 : 1}>
      <box onMouseUp={props.onToggle}>
        <text fg={props.theme.warning}>
          <Show when={!props.expanded} fallback={header()}>
            <b>{header()}</b>
          </Show>
        </text>
      </box>
      <Show when={props.expanded && body()}>
        <box marginLeft={2} marginTop={1}>
          <text fg={props.theme.markdownBlockQuote}>{body()}</text>
        </box>
      </Show>
    </box>
  );
}

function estimateMiniMessagesHeight(messages: MiniMessage[], state: AnswerDialogState, width: number) {
  let lines = 0;
  for (const message of messages) {
    lines += 1;
    for (let i = 0; i < message.parts.length; i++) {
      lines += getMiniPartTopMargin(message.parts, i, message.role);
      const part = message.parts[i];
      if (part.type === "reasoning") {
        lines += estimateWrappedLines(formatThinkingHeader(part, isThinkingPartExpanded(state, part), state), width);
        if (isThinkingPartExpanded(state, part)) { const body = getThinkingBodyText(part); if (body) lines += 1 + estimateWrappedLines(body, Math.max(1, width - 2)); }
      } else lines += estimateWrappedLines(formatMiniPart(part), width);
    }
    lines += 1;
  }
  if (state.error) lines += estimateWrappedLines(`Error: ${state.error}`, width);
  if (state.errorDetail) lines += estimateWrappedLines(state.errorDetail, width);
  const hint = getCreateUserMessageHint(state);
  if (hint) lines += estimateWrappedLines(hint, width);
  if (state.notice) lines += estimateWrappedLines(`Warning: ${state.notice}`, width);
  if (state.loading && messages.length > 0) lines += 1;
  if (messages.length === 0) lines += 1;
  return lines;
}

function estimateWrappedLines(text: string, width: number) {
  return text.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / Math.max(1, width))), 0);
}

function getMiniPartTopMargin(parts: MiniPart[], index: number, role: MiniMessage["role"]) {
  if (index === 0) return parts[0]?.type === "reasoning" && role === "assistant" ? 1 : 0;
  const previous = parts[index - 1];
  const current = parts[index];
  if (current.type === "reasoning") return previous.type === "tool" || previous.type === "reasoning" ? 1 : 0;
  if (current.type === "tool") return previous.type === "tool" || previous.type === "reasoning" ? 1 : 0;
  return current.type === "text" && previous.type !== "text" ? 1 : 0;
}

function toMiniParts(part: SessionMessageAssistantText | SessionMessageAssistantReasoning | SessionMessageAssistantTool): MiniPart[] {
  if (part.type === "reasoning" && part.text.trim()) return toReasoningMiniParts(part);
  if (part.type === "text" && part.text.trim()) return [{ type: "text", text: part.text.trim() }];
  if (part.type === "tool") {
    const inputSummary = typeof part.state.input === "string" ? part.state.input : summarizeToolInput(part.state.input as { [key: string]: unknown } | undefined);
    return [{ type: "tool", status: part.state.status, text: inputSummary ? `→ ${part.name} ${inputSummary}` : `→ ${part.name}` }];
  }
  return [];
}

function toReasoningMiniParts(part: SessionMessageAssistantReasoning) {
  const baseID = part.text;
  const time = part.time;
  const segments = splitReasoningText(part.text.trim());
  return segments.map((text, i) => ({
    type: "reasoning" as const,
    id: segments.length === 1 ? baseID : `${baseID}:${i}`,
    text,
    time: i === 0 ? (time ? { start: time.created, end: time.completed } : undefined) : undefined,
  }));
}

function splitReasoningText(text: string) {
  const titlePattern = /\*\*([^*\n]+)\*\*/g;
  const matches = [...text.matchAll(titlePattern)].filter((m) => isReasoningTitleMatch(text, m.index ?? -1));
  if (matches.length <= 1) return [text];
  const segments: string[] = [];
  if ((matches[0].index ?? 0) > 0) { const intro = text.slice(0, matches[0].index).trim(); if (intro) segments.push(intro); }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = matches[i + 1]?.index ?? text.length;
    const seg = text.slice(start, end).trim();
    if (seg) segments.push(seg);
  }
  return segments.length > 0 ? segments : [text];
}

function isReasoningTitleMatch(text: string, index: number) {
  if (index < 0) return false;
  if (index === 0) return true;
  const before = text.slice(0, index).trimEnd();
  if (!before) return true;
  return /[.!?)]$/.test(before) || before.endsWith("...");
}

function summarizeToolInput(input: { [key: string]: unknown } | undefined): string {
  if (!input) return "";
  const entries = Object.entries(input).slice(0, 2);
  if (entries.length === 0) return "";
  return entries.map(([, v]) => { const s = typeof v === "string" ? v : String(v); return s.length > 60 ? `${s.slice(0, 57)}...` : s; }).join(" ");
}

function formatMiniPart(part: MiniPart) { return part.text; }

function FooterCounter(props: { theme: MiniTheme; state: AnswerDialogState["footerCounter"] }) {
  if (!props.state.miniSession && !props.state.copiedContext) return <text />;
  return (
    <box flexDirection="row" gap={1}>
      <Show when={props.state.miniSession}>{(miniSession) => <text fg={miniSession().warning ? props.theme.warning : props.theme.textMuted}>{miniSession().text}</text>}</Show>
      <Show when={props.state.miniSession && props.state.copiedContext}><text fg={props.theme.textMuted}>·</text></Show>
      <Show when={props.state.copiedContext}>{(copiedContext) => <text fg={copiedContext().truncated ? props.theme.warning : props.theme.textMuted}>{copiedContext().text}</text>}</Show>
    </box>
  );
}

function truncateWithEllipsis(text: string, maxWidth: number) {
  if (maxWidth <= 0) return "";
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return ".".repeat(maxWidth);
  return `${text.slice(0, maxWidth - 3)}...`;
}

function getFooterCounterWidth(state: AnswerDialogState["footerCounter"]) {
  return (state.miniSession?.text.length ?? 0) + (state.copiedContext?.text.length ?? 0);
}

function isThinkingPartExpanded(state: AnswerDialogState, part: ThinkingMiniPart) {
  const toggled = Boolean(state.expandedThinkingPartIDs[part.id]);
  return state.thinkingEnabled ? !toggled : toggled;
}

function formatThinkingHeader(part: ThinkingMiniPart, expanded: boolean, spinnerSource: Pick<AnswerDialogState, "spinnerFrame">) {
  const title = getThinkingTitle(part);
  const duration = formatThinkingDuration(part.time);
  const prefix = isThinkingPartLoading(part) ? `${THINKING_SPINNER_FRAMES[spinnerSource.spinnerFrame]} ` : expanded ? "- " : "+ ";
  if (title) return `${prefix}Thought: ${title}${duration ? ` · ${duration}` : ""}`;
  return `${prefix}Thought${duration ? `: ${duration}` : ""}`;
}

function isThinkingPartLoading(part: ThinkingMiniPart) {
  if (!part.time) return false;
  return Number.isFinite(part.time.start ?? NaN) && !Number.isFinite(part.time.end ?? NaN);
}

function getThinkingTitle(part: ThinkingMiniPart) {
  const line = part.text.split("\n").find((l) => l.trim().length > 0)?.trim();
  const match = line?.match(/^\*\*(.+?)\*\*/);
  const title = match?.[1]?.trim();
  return title ? truncateThinkingTitle(title) : "";
}

function truncateThinkingTitle(title: string) {
  return title.length > 80 ? `${title.slice(0, 77).trim()}...` : title;
}

function getThinkingBodyText(part: ThinkingMiniPart) {
  const lines = part.text.split("\n");
  const titleIndex = lines.findIndex((l) => l.trim().length > 0);
  if (titleIndex === -1) return "";
  const title = getThinkingTitle(part);
  if (!title) return part.text;
  lines[titleIndex] = lines[titleIndex].replace(/^\s*\*\*(.+?)\*\*/, "");
  return lines.slice(titleIndex).join("\n").replace(/^\s+/, "").trimEnd();
}

function formatThinkingDuration(time: { start?: number; end?: number } | undefined) {
  if (!time) return "";
  const start = Number(time.start);
  const end = Number(time.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const diff = end - start;
  const milliseconds = start > 10_000_000_000 || end > 10_000_000_000 ? diff : diff * 1000;
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  const seconds = milliseconds / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function getMiniPartColor(theme: MiniTheme, part: MiniPart) {
  if (part.type === "reasoning") return theme.textMuted;
  if (part.type === "meta") return theme.textMuted;
  if (part.type === "tool" && part.status === "error") return theme.error;
  if (part.type === "tool" && part.status === "running") return theme.info;
  if (part.type === "tool") return theme.textMuted;
  return theme.text;
}

function getCreateUserMessageHint(state: AnswerDialogState) {
  const text = [state.error, state.errorDetail].filter(Boolean).join("\n");
  if (!/SessionPrompt\.createUserMessage|createUserMessage|chat\.message/i.test(text)) return undefined;
  return "Hint: OpenCode failed while creating the user message. A server plugin chat.message hook may be throwing.";
}

export function createOverlaySlot(getOverlay: () => OverlayState | undefined) {
  return () => {
    return (
      <Show when={getOverlay()}>
        {(current) => (
          <AnswerDialog
            context={current().context}
            title={current().title}
            modelName={current().modelName}
            hideKey={current().hideKey}
            toggleThinkingKeybind={current().toggleThinkingKeybind}
            state={current().state}
            onScroller={current().onScroller}
            onInput={current().onInput}
            onHide={current().onHide}
            onClose={current().onClose}
            onContinue={current().onContinue}
            onChangeModel={current().onChangeModel}
            onToggleThinking={current().onToggleThinking}
            onToggleThinkingPart={current().onToggleThinkingPart}
            onSubmit={current().onSubmit}
          />
        )}
      </Show>
    );
  };
}
