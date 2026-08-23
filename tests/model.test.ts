import { describe, expect, it } from "vitest";
import { resolveModel, resolveDefaultModel, formatResolvedModel, parseModelOverride, resolveModelContextWindow } from "../src/model";
import type { SessionMessageInfo, ModelInfo } from "@opencode-ai/client";

const models: ModelInfo[] = [
  { id: "claude-sonnet", modelID: "claude-sonnet", providerID: "anthropic", name: "Claude Sonnet", family: undefined, package: "@opencode-ai/provider-anthropic", status: "active", enabled: true, capabilities: { tools: true, input: ["text"], output: ["text"] }, variants: [], time: { released: 0 }, cost: [], limit: { context: 200_000, output: 8_192 } },
  { id: "gpt-4o", modelID: "gpt-4o", providerID: "openai", name: "GPT-4o", family: undefined, package: "@opencode-ai/provider-openai", status: "active", enabled: true, capabilities: { tools: true, input: ["text"], output: ["text"] }, variants: [{ id: "snapshot" }], time: { released: 0 }, cost: [], limit: { context: 128_000, output: 4_096 } },
];

describe("resolveModel", () => {
  it("returns config when model override set", () => {
    const result = resolveModel("anthropic/claude-sonnet", null, []);
    expect(result.source).toBe("config");
    expect(result.model?.providerID).toBe("anthropic");
    expect(result.model?.id).toBe("claude-sonnet");
  });
  it("returns unknown when no entries", () => {
    const result = resolveModel(null, null, []);
    expect(result.source).toBe("default");
  });
});

describe("formatResolvedModel", () => {
  it("returns default for undefined", () => expect(formatResolvedModel({})).toBe("default"));
  it("formats provider/id", () => expect(formatResolvedModel({ providerID: "a", id: "b" })).toBe("a/b"));
  it("formats variant", () => expect(formatResolvedModel({ providerID: "a", id: "b", variant: "snap" })).toBe("a/b (snap)"));
});

describe("resolveModelContextWindow", () => {
  it("returns context limit when model found", () => expect(resolveModelContextWindow(models, { providerID: "anthropic", id: "claude-sonnet" })).toBe(200_000));
  it("returns undefined for unknown model", () => expect(resolveModelContextWindow(models, { providerID: "nope", id: "nope" })).toBeUndefined());
});

describe("resolveDefaultModel", () => {
  it("falls back when configured model not found", () => {
    const result = resolveDefaultModel(models, "openai/notreal", null, undefined, []);
    expect(result.source).toBe("default");
    expect(result.notice).toContain("not found");
  });
});

describe("parseModelOverride", () => {
  it("parses provider/model", () => {
    const result = parseModelOverride("anthropic/claude-sonnet");
    expect(result?.providerID).toBe("anthropic");
    expect(result?.id).toBe("claude-sonnet");
  });
  it("returns undefined for invalid format", () => expect(parseModelOverride("no-slash")).toBeUndefined());
});
