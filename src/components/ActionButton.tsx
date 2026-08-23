/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode-ai/plugin/tui";
import { Show } from "solid-js";

type ActionButtonProps = {
  context: Plugin.Context;
  label: string;
  keybind?: string;
  disabled?: boolean;
  onPress: () => void;
};

export function ActionButton(props: ActionButtonProps) {
  return (
    <box
      flexDirection="row"
      onMouseUp={() => {
        if (!props.disabled) props.onPress();
      }}
    >
      <text fg={props.disabled ? props.context.theme.text.subdued : props.context.theme.text.default}>
        <b>{props.label}</b>
      </text>
      <Show when={props.keybind}>
        <text fg={props.context.theme.text.subdued}> {props.keybind}</text>
      </Show>
    </box>
  );
}
