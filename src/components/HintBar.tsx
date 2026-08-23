/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode-ai/plugin/tui";
import { For } from "solid-js";

export type HintBarItem = {
  keybind: string | false;
  label: string;
};

export function HintBar(props: {
  context: Plugin.Context;
  items: HintBarItem[];
}) {
  return (
    <box flexDirection="row" gap={2}>
      <For each={props.items.filter((item) => item.keybind)}>
        {(item) => (
          <text fg={props.context.theme.text.subdued}>
            <b>{item.keybind}</b> {item.label}
          </text>
        )}
      </For>
    </box>
  );
}
