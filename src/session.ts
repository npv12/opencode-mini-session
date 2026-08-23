import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { Plugin } from "@opencode-ai/plugin/tui";
import type { ModelInfo, ProviderInfo, SessionCreateInput, SessionMessageInfo } from "@opencode-ai/client";
import type { Setter } from "solid-js";
import { version } from "../package.json";
import { buildFooterCounterState } from "./counter";
import {
  buildMiniPreamble,
  buildSessionCreatePayload,
  buildMiniErrorDetail,
  formatMiniNotice,
  resolveRuntimeMiniAgent,
  type ResolvedMiniAgent,
} from "./agent";
import { getSessionEntries, buildCopiedContext } from "./context";
import { getErrorMessage } from "./diagnostics";
import {
  resolveDefaultModel,
  formatResolvedModel,
  resolveModelContextWindow,
  type ResolvedModelWithSource,
  type ModelSource,
} from "./model";
import type {
  ActiveDialog,
  AnswerDialogState,
  MiniConfig,
  MiniMode,
  ModelPreferenceState,
  OverlayState,
  ResolvedModel,
  ThinkingPreferenceState,
} from "./types";

type ModelSelectValue =
  | { type: "default" }
  | {
      type: "model";
      model: ResolvedModel;
    };

type ErrorPath =
  | "promptAsync throw"
  | "session.execution.failed"
  | "session.create throw";

export function openMiniSession(
  context: Plugin.Context,
  config: MiniConfig,
  mode: MiniMode,
  setOverlay: Setter<OverlayState | undefined>,
  active: ActiveDialog,
  modelPreference: ModelPreferenceState,
  thinkingPreference: ThinkingPreferenceState,
  openPickerFn: (onAfterSelect: () => void) => void,
): boolean {
  const currentRoute = context.ui.router.current();
  if (currentRoute.type !== "session") {
    context.ui.toast.show({ variant: "error", message: "mini only works inside a session." });
    return false;
  }
  if (active.get()) {
    active.get()!.show();
    return false;
  }
  void startQuestion(context, config, mode, currentRoute.sessionID, setOverlay, active, modelPreference, thinkingPreference, openPickerFn);
  return true;
}

export async function startQuestion(
  context: Plugin.Context,
  config: MiniConfig,
  mode: MiniMode,
  originSessionID: string,
  setOverlay: Setter<OverlayState | undefined>,
  active: ActiveDialog,
  modelPreference: ModelPreferenceState,
  thinkingPreference: ThinkingPreferenceState,
  openPickerFn: (onAfterSelect: () => void) => void,
) {
  const entries = getSessionEntries(context, originSessionID);
  const copiedContext =
    mode === "main"
      ? buildCopiedContext(entries, config.tokenLimit)
      : { text: "", usedTokens: undefined, totalAvailableTokens: undefined };
  const contextText = copiedContext.text;
  const sessionInfo = context.data.session.get(originSessionID);
  const models = context.data.location.model.list(sessionInfo?.location) as ModelInfo[] | undefined;
  const providers = context.data.location.provider.list(sessionInfo?.location);
  const defaultResolvedModel = resolveDefaultModel(
    models, config.model, config.variant, sessionInfo?.model, entries,
  );
  const getResolvedModel = () => modelPreference.get() ?? defaultResolvedModel.model;
  const getModelName = () => formatResolvedModel(getResolvedModel());
  const hideKey = mode === "fresh" ? config.freshKeybind : config.keybind;
  const hiddenCommand = mode === "fresh" ? "/mini-fresh" : "/mini";
  const title = mode === "fresh" ? "mini fresh" : "mini session";
  const previousFocus = context.renderer.currentFocusedRenderable;
  let resolvedAgent: ResolvedMiniAgent;
  let system = "";
  let preamble = "";

  const dialogState: AnswerDialogState = {
    mode,
    entries: [],
    streamingAnswer: "",
    loading: false,
    scrollbarVisible: false,
    spinnerFrame: 0,
    copiedContextTokens: copiedContext.usedTokens,
    copiedContextTotalTokens: copiedContext.totalAvailableTokens,
    lastCompletedMiniInputTokens: undefined,
    modelContextWindow: undefined,
    footerCounter: {},
    inputPlaceholder: undefined,
    thinkingEnabled: thinkingPreference.get(),
    expandedThinkingPartIDs: {},
    notice: undefined,
    errorDetail: undefined,
  };

  const unsubscribers: Array<() => void> = [];
  let tempSessionID: string | undefined;
  let closed = false;
  let hidden = false;
  let continuing = false;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let spinnerTimer: ReturnType<typeof setInterval> | undefined;
  let overlayInput: InputRenderable | undefined;
  let overlayScroller: ScrollBoxRenderable | undefined;
  let followStreamingToBottom = true;
  let forceScrollToBottom = true;
  let pendingScrollToBottom = false;
  let lastScrollTop = 0;
  let lastScrollHeight = 0;
  let currentTokenMessageID: string | undefined;
  const incrementedTokenMessageIDs = new Set<string>();

  const syncCounterState = () => {
    dialogState.modelContextWindow = resolveModelContextWindow(models, getResolvedModel());
    dialogState.footerCounter = buildFooterCounterState({
      mode: dialogState.mode,
      copiedContextTokens: dialogState.copiedContextTokens,
      copiedContextTotalTokens: dialogState.copiedContextTotalTokens,
      tokenLimit: config.tokenLimit,
      lastCompletedMiniInputTokens: dialogState.lastCompletedMiniInputTokens,
      modelContextWindow: dialogState.modelContextWindow,
    });
    dialogState.inputPlaceholder = dialogState.footerCounter.placeholder;
  };

  const clearScrollTimer = () => { pendingScrollToBottom = false; if (!scrollTimer) return; clearTimeout(scrollTimer); scrollTimer = undefined; };
  const clearFocusTimer = () => { if (!focusTimer) return; clearTimeout(focusTimer); focusTimer = undefined; };
  const clearSpinnerTimer = () => { if (!spinnerTimer) return; clearInterval(spinnerTimer); spinnerTimer = undefined; };
  const startSpinnerTimer = () => {
    if (spinnerTimer || closed || hidden || !dialogState.loading) return;
    spinnerTimer = setInterval(() => {
      if (closed || hidden || !dialogState.loading) { clearSpinnerTimer(); return; }
      dialogState.spinnerFrame = (dialogState.spinnerFrame + 1) % 10;
      renderOverlay();
    }, 80);
  };
  const scheduleInputFocus = () => {
    if (closed || hidden) return;
    clearFocusTimer();
    focusTimer = setTimeout(() => { focusTimer = undefined; if (closed || hidden) return; overlayInput?.focus(); context.renderer.requestRender(); }, 0);
  };
  const isScrollerAtBottom = () => {
    if (!overlayScroller) return true;
    return overlayScroller.scrollTop >= Math.max(0, overlayScroller.scrollHeight - overlayScroller.viewport.height) - 1;
  };
  const updateScrollSnapshot = () => { lastScrollTop = overlayScroller?.scrollTop ?? 0; lastScrollHeight = overlayScroller?.scrollHeight ?? 0; };
  const scheduleScrollToBottom = () => {
    if (closed || hidden) return;
    clearScrollTimer();
    pendingScrollToBottom = true;
    scrollTimer = setTimeout(() => { scrollTimer = undefined; if (closed || hidden) { pendingScrollToBottom = false; return; } overlayScroller?.scrollTo(Number.MAX_SAFE_INTEGER); updateScrollSnapshot(); pendingScrollToBottom = false; context.renderer.requestRender(); }, 0);
  };
  const scrollBy = (delta: number) => { followStreamingToBottom = false; forceScrollToBottom = false; pendingScrollToBottom = false; clearScrollTimer(); overlayScroller?.scrollBy(delta); updateScrollSnapshot(); };
  const scrollTo = (position: number) => { followStreamingToBottom = position === Number.MAX_SAFE_INTEGER; forceScrollToBottom = position === Number.MAX_SAFE_INTEGER; pendingScrollToBottom = false; if (position !== Number.MAX_SAFE_INTEGER) clearScrollTimer(); overlayScroller?.scrollTo(position); updateScrollSnapshot(); };
  const restorePreviousFocus = () => { setTimeout(() => { if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus(); context.renderer.requestRender(); }, 0); };

  const hide = () => {
    if (closed || hidden) return;
    hidden = true;
    if (renderTimer) { clearTimeout(renderTimer); renderTimer = undefined; }
    clearScrollTimer(); clearFocusTimer(); clearSpinnerTimer();
    setOverlay(undefined);
    restorePreviousFocus();
    context.ui.toast.show({ variant: "info", message: hideKey ? `mini hidden. Press ${hideKey} to show it.` : `mini hidden. Run ${hiddenCommand} to show it.`, duration: 1000 });
  };

  const closeFromUser = async () => {
    context.ui.toast.show({ variant: "info", message: "mini session closed.", duration: 1000 });
    await cleanup();
  };

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (active.get() === controller) active.set(undefined);
    while (unsubscribers.length > 0) { try { unsubscribers.pop()?.(); } catch {} }
    if (renderTimer) clearTimeout(renderTimer);
    clearScrollTimer(); clearFocusTimer(); clearSpinnerTimer();
    setOverlay(undefined);
    restorePreviousFocus();
    if (!tempSessionID) return;
    const ephemeralSessionID = tempSessionID;
    tempSessionID = undefined;
    try { await context.client.session.interrupt({ sessionID: ephemeralSessionID }); } catch {}
    try { await context.client.session.remove({ sessionID: ephemeralSessionID }); } catch {}
  };

  const continueInMainThread = async () => {
    const transcript = buildMiniSessionTranscript(dialogState);
    if (continuing || dialogState.loading || dialogState.error || !transcript) return;
    continuing = true;
    try {
      await context.client.session.prompt({ sessionID: originSessionID, text: buildContinuePrompt(transcript) });
      context.ui.toast.show({ variant: "success", message: "Side answer added to main session." });
      await cleanup();
    } catch (cause) {
      context.ui.toast.show({ variant: "error", message: `Failed to continue in main thread: ${getErrorMessage(cause)}` });
    } finally {
      continuing = false;
    }
  };

  const toggleThinking = () => { dialogState.thinkingEnabled = !dialogState.thinkingEnabled; thinkingPreference.set(dialogState.thinkingEnabled); dialogState.expandedThinkingPartIDs = {}; renderOverlay(); };
  const toggleThinkingPart = (partID: string) => {
    if (dialogState.expandedThinkingPartIDs[partID]) delete dialogState.expandedThinkingPartIDs[partID];
    else dialogState.expandedThinkingPartIDs[partID] = true;
    renderOverlay();
  };

  const renderOverlay = (options: { focusInput?: boolean } = {}) => {
    if (closed) return;
    syncCounterState();
    const streamingActive = dialogState.loading || Boolean(dialogState.streamingAnswer);
    const currentScrollTop = overlayScroller?.scrollTop ?? 0;
    const currentScrollHeight = overlayScroller?.scrollHeight ?? 0;
    if (streamingActive && !forceScrollToBottom && !pendingScrollToBottom) {
      if (isScrollerAtBottom()) followStreamingToBottom = true;
      else if (currentScrollTop < lastScrollTop || currentScrollHeight <= lastScrollHeight) followStreamingToBottom = false;
    }
    const shouldScrollToBottom = forceScrollToBottom || (streamingActive && followStreamingToBottom);
    forceScrollToBottom = false;
    updateScrollSnapshot();
    if (renderTimer) { clearTimeout(renderTimer); renderTimer = undefined; }
    if (hidden) return;
    setOverlay({
      context,
      title,
      modelName: getModelName(),
      hideKey,
      toggleThinkingKeybind: config.toggleThinkingKeybind,
      state: dialogState,
      onScroller: (scroller) => { overlayScroller = scroller; },
      onInput: (input) => { overlayInput = input; },
      onHide: () => hide(),
      onClose: () => void closeFromUser(),
      onContinue: () => void continueInMainThread(),
      onChangeModel: () => openPickerFn(() => renderOverlay({ focusInput: true })),
      onToggleThinking: toggleThinking,
      onToggleThinkingPart: toggleThinkingPart,
      onSubmit: submitPrompt,
      scrollBy,
      scrollTo,
      submit: () => {
        const value = (overlayInput?.value || "").trim();
        if (value && !dialogState.loading && submitPrompt(value)) {
          if (overlayInput) overlayInput.value = "";
        }
      },
    });
    if (options.focusInput) scheduleInputFocus();
    if (dialogState.loading) startSpinnerTimer(); else clearSpinnerTimer();
    if (shouldScrollToBottom) scheduleScrollToBottom();
  };

  const setPromptError = (path: ErrorPath, cause: unknown) => {
    dialogState.error = getErrorMessage(cause);
    dialogState.errorDetail = buildMiniErrorDetail({ path, sessionID: tempSessionID, resolvedModel: getResolvedModel(), resolvedAgent });
    dialogState.loading = false;
    clearSpinnerTimer();
  };

  const show = () => { if (closed) return; hidden = false; renderOverlay({ focusInput: true }); };
  const controller = { close: cleanup, hide, show, isVisible: () => !hidden };
  const scheduleRenderOverlay = () => { if (closed || renderTimer) return; renderTimer = setTimeout(() => { renderTimer = undefined; renderOverlay(); }, 50); };
  active.set(controller);
  renderOverlay({ focusInput: true });

  try { resolvedAgent = await resolveRuntimeMiniAgent(context, config); }
  catch (cause) {
    if (closed) return;
    context.ui.toast.show({ variant: "error", message: `Failed to open mini session: ${getErrorMessage(cause)}` });
    await cleanup();
    return;
  }
  if (closed) return;
  preamble = buildMiniPreamble(contextText, resolvedAgent, mode);
  dialogState.notice = formatMiniNotice(defaultResolvedModel.notice, ...resolvedAgent.notices);
  renderOverlay();

  function submitPrompt(value: string) {
    const prompt = value.trim();
    if (!prompt || closed) return false;
    if (dialogState.loading) { context.ui.toast.show({ variant: "warning", message: "Wait for the current response." }); return false; }
    if (!tempSessionID) { context.ui.toast.show({ variant: "warning", message: "mini session is still opening." }); return false; }
    const promptSessionID = tempSessionID;
    dialogState.error = undefined;
    dialogState.errorDetail = undefined;
    dialogState.loading = true;
    dialogState.spinnerFrame = 0;
    dialogState.streamingAnswer = "";
    followStreamingToBottom = true;
    forceScrollToBottom = true;
    renderOverlay({ focusInput: true });
    void (async () => {
      try {
        const isFirst = !dialogState.lastCompletedMiniInputTokens;
        const text = isFirst ? `${preamble}\n\n---\n\n${prompt}` : prompt;
        await context.client.session.prompt({ sessionID: promptSessionID, text });
      } catch (cause) {
        if (closed) return;
        setPromptError("promptAsync throw", cause);
        renderOverlay();
      }
    })();
    return true;
  }

  try {
    const resolvedModel = getResolvedModel();
    const created = await context.client.session.create(
      buildSessionCreatePayload(resolvedAgent, {
        title: "mini session",
        directory: context.location?.directory ?? "",
        model: resolvedModel,
      }) as SessionCreateInput,
    );
    tempSessionID = created.id;
    const ephemeralSessionID = tempSessionID;

    const refreshSession = () => {
      dialogState.entries = getSessionEntries(context, ephemeralSessionID);
      dialogState.streamingAnswer = "";
      refreshLastCompletedMiniInputTokens();
    };
    const refreshLastCompletedMiniInputTokens = () => {
      const latest = getLastCompletedMiniInputUsage(dialogState.entries);
      if (!latest) return;
      const current = dialogState.lastCompletedMiniInputTokens;
      if (current === undefined || latest.totalTokens > current) { dialogState.lastCompletedMiniInputTokens = latest.totalTokens; currentTokenMessageID = latest.messageID; return; }
      if (latest.messageID === currentTokenMessageID) return;
      if (incrementedTokenMessageIDs.has(latest.messageID)) return;
      incrementedTokenMessageIDs.add(latest.messageID);
      dialogState.lastCompletedMiniInputTokens = current + latest.inputTokens;
      currentTokenMessageID = latest.messageID;
    };

    if (closed) { try { await context.client.session.remove({ sessionID: ephemeralSessionID }); } catch {} return; }

    unsubscribers.push(
      context.data.on("session.idle" as never, (event: { data: { sessionID: string } }) => {
        if (event.data.sessionID !== tempSessionID) return;
        refreshSession();
        if (!extractAssistantText(dialogState.entries)) dialogState.streamingAnswer = "No response generated.";
        dialogState.loading = false;
        clearSpinnerTimer();
        renderOverlay();
      }),
    );
    unsubscribers.push(
      context.data.on("session.text.delta" as never, (event: { data: { sessionID: string; delta: string } }) => {
        if (event.data.sessionID !== tempSessionID) return;
        dialogState.streamingAnswer += event.data.delta;
        scheduleRenderOverlay();
      }),
    );
    unsubscribers.push(
      context.data.on("session.step.ended" as never, (event: { data: { sessionID: string } }) => {
        if (event.data.sessionID !== tempSessionID) return;
        refreshSession();
        renderOverlay();
      }),
    );
    unsubscribers.push(
      context.data.on("session.execution.failed" as never, (event: { data: { sessionID: string; error: { message: string } } }) => {
        if (event.data.sessionID !== tempSessionID) return;
        setPromptError("session.execution.failed", event.data.error.message);
        renderOverlay();
      }),
    );
  } catch (cause) {
    if (closed) return;
    setPromptError("session.create throw", cause);
    renderOverlay();
  }
}

export function openModelPicker(
  context: Plugin.Context,
  config: MiniConfig,
  sessionID: string,
  modelPreference: ModelPreferenceState,
  onAfterSelect?: () => void,
) {
  const sessionInfo = context.data.session.get(sessionID);
  const models = context.data.location.model.list(sessionInfo?.location) as ModelInfo[] | undefined;
  const providers = context.data.location.provider.list(sessionInfo?.location);
  const { model: defaultModel, source: defaultSource } = resolveDefaultModel(
    models, config.model, config.variant, sessionInfo?.model,
    getSessionEntries(context, sessionID),
  );
  const options = buildModelOptions(models, providers, defaultModel, defaultSource);
  const sourceLabel: Record<ModelSource, string> = { config: "config", session: "main session", default: "default" };
  void (async () => {
    const result = await context.ui.dialog.select<ModelSelectValue>({
      title: "mini model",
      placeholder: "Select model for future mini-session questions",
      options: options.map((o) => ({ title: o.title, value: o.value, description: o.description, category: o.category })),
    });
    if (!result) return;
    if (result.type === "default") {
      modelPreference.set(undefined);
      context.ui.toast.show({ variant: "success", message: "mini model reset to default." });
    } else {
      modelPreference.set(result.model);
      context.ui.toast.show({ variant: "success", message: `mini model set to ${formatResolvedModel(result.model)}.` });
    }
    onAfterSelect?.();
  })();
}

function buildModelOptions(
  models: ModelInfo[] | undefined,
  providers: readonly { id: string; name: string }[] | undefined,
  defaultModel: ResolvedModel,
  defaultSource: ModelSource,
): Array<{ title: string; value: ModelSelectValue; description: string; category: string }> {
  const sourceLabel: Record<ModelSource, string> = { config: "config", session: "main session", default: "default" };
  const providerName = (id: string) => providers?.find((p) => p.id === id)?.name ?? id;
  const defaultModelName = defaultModel.providerID && defaultModel.id
    ? (models?.find((m) => m.providerID === defaultModel.providerID && m.id === defaultModel.id)?.name ?? defaultModel.id)
    : "default";

  const options: Array<{ title: string; value: ModelSelectValue; description: string; category: string }> = [
    {
      title: defaultModelName + (defaultModel.variant ? ` (${defaultModel.variant})` : ""),
      value: { type: "default" },
      description: formatResolvedModel(defaultModel),
      category: `Default [${sourceLabel[defaultSource]}]`,
    },
  ];

  if (!models) return options;
  const byProvider = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const arr = byProvider.get(m.providerID) ?? [];
    arr.push(m);
    byProvider.set(m.providerID, arr);
  }

  for (const [providerID, providerModels] of [...byProvider.entries()].sort((a, b) => providerName(a[0]).localeCompare(providerName(b[0])))) {
    for (const m of providerModels.sort((a, b) => a.name.localeCompare(b.name))) {
      const value: ResolvedModel = { providerID: m.providerID, id: m.id };
      options.push({
        title: m.name || m.id,
        value: { type: "model", model: value },
        description: `${providerID}/${m.id}`,
        category: providerName(providerID),
      });
      for (const variant of [...(m.variants ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
        options.push({
          title: `${m.name || m.id} (${variant.id})`,
          value: { type: "model", model: { ...value, variant: variant.id } },
          description: `${providerID}/${m.id}`,
          category: providerName(providerID),
        });
      }
    }
  }
  return options;
}

export function extractAssistantText(entries: SessionMessageInfo[]): string {
  const chunks: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    for (const part of entry.content) {
      if (part.type === "text" && part.text.trim()) chunks.push(part.text);
    }
  }
  return chunks.join("\n\n").trim();
}

function buildMiniSessionTranscript(state: AnswerDialogState) {
  const lines: string[] = [];
  for (const entry of state.entries) {
    const chunks: string[] = [];
    if (entry.type === "user" && entry.text.trim()) chunks.push(entry.text.trim());
    if (entry.type === "assistant") {
      for (const part of entry.content) {
        if (part.type === "text" && part.text.trim()) chunks.push(part.text.trim());
      }
    }
    if (chunks.length > 0) {
      const role = entry.type === "assistant" ? "assistant" : entry.type === "user" ? "user" : "system";
      lines.push(`${role}:\n${chunks.join("\n\n")}`);
    }
  }
  if (state.streamingAnswer.trim()) lines.push(`assistant:\n${state.streamingAnswer.trim()}`);
  return lines.join("\n\n").trim();
}

function buildContinuePrompt(transcript: string) {
  return ["[Context from a mini session]", transcript, "---\n"].join("\n\n");
}

function getLastCompletedMiniInputUsage(entries: SessionMessageInfo[]) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "assistant") continue;
    if (!entry.time.completed) continue;
    if (entry.tokens) {
      return {
        messageID: entry.id,
        inputTokens: entry.tokens.input + (entry.tokens.cache?.read ?? 0) + (entry.tokens.cache?.write ?? 0),
        totalTokens: entry.tokens.input + entry.tokens.output + entry.tokens.reasoning + (entry.tokens.cache?.read ?? 0) + (entry.tokens.cache?.write ?? 0),
      };
    }
  }
  return undefined;
}
