import type { Plugin } from "@opencode-ai/plugin/tui";
import type { Accessor } from "solid-js";
import {
  CMD_CHANGE_MODEL,
  CMD_CLOSE,
  CMD_CONTINUE,
  CMD_HIDE,
  CMD_OPEN,
  CMD_OPEN_FRESH,
  CMD_PAGE_DOWN,
  CMD_PAGE_UP,
  CMD_SCROLL_BOTTOM,
  CMD_SCROLL_DOWN,
  CMD_SCROLL_TOP,
  CMD_SCROLL_UP,
  CMD_SUBMIT,
  CMD_TOGGLE_FRESH,
  CMD_TOGGLE_MAIN,
  CMD_TOGGLE_THINKING,
  SCROLL_LINE_DELTA,
  SCROLL_PAGE_DELTA,
} from "./constants";
import type { MiniConfig, MiniMode, OverlayState } from "./types";

export type KeybindContext = {
  context: Plugin.Context;
  config: MiniConfig;
  overlay: Accessor<OverlayState | undefined>;
  modelPickerOpen: { get: () => boolean; set: (v: boolean) => void };
  triggerMiniMode: (mode: MiniMode, source: "command" | "keybind") => Promise<void>;
  openModelPicker: () => void;
};

export function buildPanelCommands(ctx: KeybindContext): Array<{
  id: string;
  title?: string;
  bind?: string;
  enabled?: boolean | (() => boolean);
  run: () => void;
}> {
  const { overlay, modelPickerOpen } = ctx;
  const closePanel = () => {
    if (modelPickerOpen.get()) {
      modelPickerOpen.set(false);
    } else {
      overlay()?.onClose();
    }
  };
  const whenOpen = () => Boolean(overlay());

  return [
    { id: CMD_HIDE, bind: "up", enabled: whenOpen, run: () => overlay()?.onHide() },
    { id: CMD_CLOSE, title: "Close", bind: "escape", enabled: whenOpen, run: closePanel },
    { id: CMD_CLOSE, bind: "ctrl+c", enabled: whenOpen, run: closePanel },
    { id: CMD_CONTINUE, title: "Continue", bind: "shift+return", enabled: whenOpen, run: () => overlay()?.onContinue() },
    { id: CMD_SUBMIT, title: "Submit", bind: "return", enabled: whenOpen, run: () => overlay()?.submit() },
    ...(ctx.config.toggleThinkingKeybind
      ? [{ id: CMD_TOGGLE_THINKING, title: "Toggle thinking", bind: ctx.config.toggleThinkingKeybind, enabled: whenOpen, run: () => overlay()?.onToggleThinking() }]
      : []),
    { id: CMD_CHANGE_MODEL, title: "Change model", bind: "tab", enabled: whenOpen, run: () => { modelPickerOpen.set(true); overlay()?.onChangeModel(); } },
    { id: CMD_SCROLL_UP, bind: "down", enabled: whenOpen, run: () => overlay()?.scrollBy(-SCROLL_LINE_DELTA) },
    { id: CMD_SCROLL_DOWN, bind: "down", enabled: whenOpen, run: () => overlay()?.scrollBy(SCROLL_LINE_DELTA) },
    { id: CMD_PAGE_UP, bind: "pageup", enabled: whenOpen, run: () => overlay()?.scrollBy(-SCROLL_PAGE_DELTA) },
    { id: CMD_PAGE_DOWN, bind: "pagedown", enabled: whenOpen, run: () => overlay()?.scrollBy(SCROLL_PAGE_DELTA) },
    { id: CMD_SCROLL_TOP, bind: "home", enabled: whenOpen, run: () => overlay()?.scrollTo(0) },
    { id: CMD_SCROLL_BOTTOM, bind: "end", enabled: whenOpen, run: () => overlay()?.scrollTo(Number.MAX_SAFE_INTEGER) },
  ];
}

export function buildGlobalCommands(ctx: KeybindContext): Array<{
  id: string;
  title: string;
  description?: string;
  group?: string;
  palette?: true;
  slash?: { name: string };
  bind?: string;
  enabled?: boolean | (() => boolean);
  run: () => void;
}> {
  const { config, triggerMiniMode, openModelPicker } = ctx;
  const onSession = () => {
    const route = ctx.context.ui.router.current();
    return route.type === "session";
  };

  const commands: Array<{
    id: string;
    title: string;
    description?: string;
    group?: string;
    palette?: true;
    slash?: { name: string };
    bind?: string;
    enabled?: boolean | (() => boolean);
    run: () => void;
  }> = [];

  if (config.keybind) {
    commands.push({
      id: CMD_TOGGLE_MAIN,
      title: "Toggle mini session",
      bind: config.keybind,
      run: () => void triggerMiniMode("main", "keybind"),
    });
  }
  if (config.freshKeybind) {
    commands.push({
      id: CMD_TOGGLE_FRESH,
      title: "Toggle mini fresh session",
      bind: config.freshKeybind,
      run: () => void triggerMiniMode("fresh", "keybind"),
    });
  }
  commands.push(
    {
      id: CMD_OPEN,
      title: "mini",
      description: "Open a mini session for side questions",
      group: "Mini",
      palette: true,
      slash: { name: "mini" },
      enabled: onSession,
      run: () => void triggerMiniMode("main", "command"),
    },
    {
      id: CMD_OPEN_FRESH,
      title: "mini fresh",
      description: "Open a mini session without copied context",
      group: "Mini",
      palette: true,
      slash: { name: "mini-fresh" },
      enabled: onSession,
      run: () => void triggerMiniMode("fresh", "command"),
    },
    {
      id: CMD_CHANGE_MODEL + ".global",
      title: "mini model",
      description: "Change the model for future mini-session questions",
      group: "Mini",
      palette: true,
      slash: { name: "mini-model" },
      enabled: onSession,
      run: openModelPicker,
    },
  );

  return commands;
}
