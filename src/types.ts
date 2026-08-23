import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { Plugin } from "@opencode-ai/plugin/tui";
import type { ModelRef, SessionMessageInfo } from "@opencode-ai/client";
import type { FooterCounterState } from "./counter";

export type MiniConfig = {
  model: string | null;
  variant: string | null;
  agent: string | null;
  tokenLimit: number;
  keybind: string | false;
  freshKeybind: string | false;
  enableThinking: boolean;
  toggleThinkingKeybind: string | false;
};

export type MiniMode = "main" | "fresh";

export type ResolvedModel = {
  providerID?: string;
  id?: string;
  variant?: string;
};

export type ModelPreference = ResolvedModel | undefined;

export type ModelPreferenceState = {
  get: () => ModelPreference;
  set: (model: ModelPreference) => void;
};

export type ThinkingPreferenceState = {
  get: () => boolean;
  set: (enabled: boolean) => void;
};

export type ActiveDialog = {
  get: () => ActiveDialogController | undefined;
  set: (dialog: ActiveDialogController | undefined) => void;
};

export type ActiveDialogController = {
  close: () => Promise<void>;
  hide: () => void;
  show: () => void;
  isVisible: () => boolean;
};

export type AnswerDialogState = {
  mode: MiniMode;
  entries: SessionMessageInfo[];
  streamingAnswer: string;
  loading: boolean;
  scrollbarVisible: boolean;
  spinnerFrame: number;
  copiedContextTokens?: number;
  copiedContextTotalTokens?: number;
  lastCompletedMiniInputTokens?: number;
  modelContextWindow?: number;
  footerCounter: FooterCounterState;
  inputPlaceholder?: string;
  thinkingEnabled: boolean;
  expandedThinkingPartIDs: Record<string, true>;
  notice?: string;
  error?: string;
  errorDetail?: string;
};

export type AnswerDialogProps = {
  context: Plugin.Context;
  title: string;
  modelName: string;
  hideKey: string | false;
  toggleThinkingKeybind: string | false;
  state: AnswerDialogState;
  onScroller?: (scroller: ScrollBoxRenderable | undefined) => void;
  onInput?: (input: InputRenderable | undefined) => void;
  onHide: () => void;
  onClose: () => void;
  onContinue: () => void;
  onChangeModel: () => void;
  onToggleThinking: () => void;
  onToggleThinkingPart: (partID: string) => void;
  onSubmit: (value: string) => boolean;
};

export type OverlayState = AnswerDialogProps & {
  scrollBy: (delta: number) => void;
  scrollTo: (position: number) => void;
  submit: () => void;
};
