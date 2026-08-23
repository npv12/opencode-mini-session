import { describe, expect, it } from "vitest";
import { resolveMiniAgent, buildSessionCreatePayload, buildMiniErrorDetail, formatMiniNotice, buildMiniPreamble } from "../src/agent";
import { parseConfig } from "../src/config";
import type { MiniConfig } from "../src/types";

function config(overrides: Partial<MiniConfig> = {}): MiniConfig {
  return { model: null, variant: null, agent: null, tokenLimit: 50_000, keybind: "alt+b", freshKeybind: "alt+n", enableThinking: false, toggleThinkingKeybind: "ctrl+t", ...overrides };
}

describe("resolveMiniAgent", () => {
  it("plugin-managed when no agent configured", () => {
    const result = resolveMiniAgent(config(), null);
    expect(result.mode).toBe("plugin-managed");
  });
  it("custom-agent when agent name found", () => {
    const result = resolveMiniAgent(config({ agent: "research" }), [{ name: "research" }]);
    expect(result.mode).toBe("custom-agent");
    if (result.mode === "custom-agent") expect(result.agent).toBe("research");
  });
  it("plugin-managed fallback when agent not found", () => {
    const result = resolveMiniAgent(config({ agent: "unknown" }), [{ name: "research" }]);
    expect(result.mode).toBe("plugin-managed");
    if (result.mode === "plugin-managed") expect(result.missingAgent).toBe("unknown");
  });
});

describe("buildSessionCreatePayload", () => {
  it("returns title and location", () => {
    const payload = buildSessionCreatePayload(
      { mode: "plugin-managed", requestedAgent: null, notices: [] },
      { title: "mini", directory: "/tmp" }
    );
    expect(payload.title).toBe("mini");
    expect(payload.location?.directory).toBe("/tmp");
  });
});

describe("formatMiniNotice", () => {
  it("returns undefined for all empty", () => expect(formatMiniNotice(undefined, undefined)).toBeUndefined());
  it("joins non-empty notices", () => expect(formatMiniNotice("a", "b")).toBe("a b"));
});

describe("buildMiniPreamble", () => {
  it("includes instructions", () => {
    const preamble = buildMiniPreamble("context", { mode: "plugin-managed", requestedAgent: null, notices: [] }, "main");
    expect(preamble).toContain("session-context");
    expect(preamble).toContain("context");
  });
});
