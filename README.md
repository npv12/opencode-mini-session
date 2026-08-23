# opencode-mini-session

OpenCode V2 TUI plugin that creates ephemeral mini sessions for side questions. Ask quick questions without disrupting your main conversation.

## Features

- **Mini sessions** — ephemeral child sessions that auto-clean on close
- **Context copying** — optionally copies main session context into the mini prompt
- **Model picker** — switch between models for mini-session questions (Tab)
- **Streaming answers** — real-time streaming with markdown rendering
- **Continue in main thread** — paste mini session transcript back into main session
- **Thinking mode** — toggle extended thinking with Ctrl+T
- **Hide/show** — toggle the overlay without closing the session

## Installation

Requires OpenCode `0.0.0-beta-17963` or compatible.

```bash
opencode2 plugin add @npv12/opencode-mini-session
```

Or add to your `cli.json`:

```json
{
  "plugins": ["@npv12/opencode-mini-session"]
}
```

## Configuration

Pass options in your `opencode.json(c)`:

```json
{
  "plugins": [
    {
      "package": "@npv12/opencode-mini-session",
      "options": {
        "model": "anthropic/claude-sonnet-4-5",
        "keybind": "alt+b",
        "freshKeybind": "alt+n",
        "enableThinking": false,
        "tokenLimit": 50000
      }
    }
  ]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `model` | (session default) | Override model for mini sessions (`provider/model`) |
| `variant` | — | Model variant to use |
| `agent` | — | Custom agent name (falls back to plugin-managed mode if not found) |
| `keybind` | `alt+b` | Global keybind to toggle mini session (set `false` to disable) |
| `freshKeybind` | `alt+n` | Keybind for mini session without copied context |
| `enableThinking` | `false` | Default thinking state for mini sessions |
| `toggleThinkingKeybind` | `ctrl+t` | Keybind to toggle thinking in the mini dialog |
| `tokenLimit` | `50000` | Max tokens to copy from main session context |

## Commands

| Command | Slash | Description |
|---------|-------|-------------|
| `mini` | `/mini` | Open mini session with main session context |
| `mini fresh` | `/mini-fresh` | Open mini session without copied context |
| `mini model` | `/mini-model` | Change model for future mini sessions |

## Attribution

Based on [karamanliev/opencode-mini-session](https://github.com/karamanliev/opencode-mini-session).

## License

MIT
