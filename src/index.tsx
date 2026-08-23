/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode-ai/plugin/tui";
import { createEffect, createSignal, untrack, onCleanup } from "solid-js";
import { createOverlaySlot } from "./components/AnswerDialog";
import { parseConfig } from "./config";
import { PLUGIN_ID } from "./constants";
import { buildGlobalCommands, buildPanelCommands } from "./keybinds";
import { openMiniSession, openModelPicker } from "./session";
import { resolveMiniRouteAction, runMiniRouteAction } from "./routing";
import type { ActiveDialogController, MiniMode, ModelPreference, OverlayState, ThinkingPreferenceState } from "./types";

function KeymapManager(props: {
  context: Plugin.Context;
  overlay: () => OverlayState | undefined;
  globalCmds: ReturnType<typeof buildGlobalCommands>;
  panelCmds: ReturnType<typeof buildPanelCommands>;
}) {
  props.context.keymap.layer(() => ({
    mode: "global",
    commands: props.globalCmds.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      group: c.group,
      palette: c.palette,
      slash: c.slash,
      bind: c.bind,
      enabled: c.enabled,
      run: c.run,
    })),
  }));

  props.context.keymap.layer(() => ({
    mode: "global",
    priority: 1000,
    enabled: () => Boolean(props.overlay()),
    commands: props.panelCmds.map((c) => ({
      id: c.id,
      title: c.title,
      bind: c.bind,
      enabled: c.enabled,
      run: c.run,
    })),
  }));

  return <></>;
}

export default {
  id: PLUGIN_ID,
  setup(context: Plugin.Context) {
    const config = parseConfig(context.options);
    const [overlay, setOverlay] = createSignal<OverlayState | undefined>(undefined, { equals: false });
    const [selectedModel, setSelectedModel] = createSignal<ModelPreference>(undefined, { equals: false });
    const [thinkingEnabled, setThinkingEnabled] = createSignal(config.enableThinking);
    let activeDialog: ActiveDialogController | undefined;
    let activeMode: MiniMode | undefined;
    let modelPickerOpen = false;
    const thinkingPreference: ThinkingPreferenceState = { get: thinkingEnabled, set: setThinkingEnabled };

    const globalCmds = buildGlobalCommands({
      context, config, overlay,
      modelPickerOpen: { get: () => modelPickerOpen, set: (v) => { modelPickerOpen = v; } },
      triggerMiniMode: (mode, source) => triggerMiniMode(mode, source),
      openModelPicker: () => {
        const route = context.ui.router.current();
        if (route.type !== "session") return;
        openModelPicker(context, config, route.sessionID, { get: selectedModel, set: setSelectedModel });
      },
    });

    const panelCmds = buildPanelCommands({
      context, config, overlay,
      modelPickerOpen: { get: () => modelPickerOpen, set: (v) => { modelPickerOpen = v; } },
      triggerMiniMode: (mode, source) => triggerMiniMode(mode, source),
      openModelPicker: () => {
        const route = context.ui.router.current();
        if (route.type !== "session") return;
        openModelPicker(context, config, route.sessionID, { get: selectedModel, set: setSelectedModel });
      },
    });

    context.ui.slot({
      append: "app",
      render: () => (
        <>
          <KeymapManager context={context} overlay={overlay} globalCmds={globalCmds} panelCmds={panelCmds} />
          {createOverlaySlot(overlay)()}
        </>
      ),
    });

    createEffect(() => {
      const route = context.ui.router.current();
      if (route.type === "session") return;
      if (!activeDialog) return;
      setOverlay(undefined);
      context.ui.toast.show({ variant: "info", message: "mini session closed.", duration: 1000 });
      void activeDialog.close();
    });

    async function triggerMiniMode(mode: MiniMode, source: "command" | "keybind") {
      const route = context.ui.router.current();
      if (route.type !== "session") return;
      const nextAction = resolveMiniRouteAction({
        source, requestedMode: mode, activeMode, isVisible: activeDialog?.isVisible(),
      });
      await runMiniRouteAction({
        action: nextAction, activeDialog,
        open: () => {
          const opened = openMiniSession(context, config, mode, setOverlay,
            { get: () => activeDialog, set: (d) => { activeDialog = d; if (!d) { activeMode = undefined; } } },
            { get: selectedModel, set: setSelectedModel },
            thinkingPreference,
            (onAfterSelect) => openModelPicker(context, config, route.sessionID, { get: selectedModel, set: setSelectedModel }, () => { modelPickerOpen = false; onAfterSelect(); }),
          );
          if (opened) activeMode = mode;
        },
      });
    }

    return () => void activeDialog?.close();
  },
} satisfies Plugin.Definition;
