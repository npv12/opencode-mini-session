import { describe, expect, it } from "vitest";
import { buildCopiedContext, estimateTokens } from "../src/context";
import type { SessionMessageInfo } from "@opencode-ai/client";

function userMsg(text: string, created = 0): SessionMessageInfo {
  return { id: "u-" + Math.random(), type: "user", text, time: { created }, metadata: {} };
}

function assistantMsg(text: string, created = 1): SessionMessageInfo {
  return { id: "a-" + Math.random(), type: "assistant", agent: "default", model: { id: "test", providerID: "test" }, content: [{ type: "text", text }], time: { created }, metadata: {} };
}

describe("buildCopiedContext", () => {
  it("returns fallback for empty entries", () => {
    const result = buildCopiedContext([], 500);
    expect(result.text).toContain("No conversation context");
    expect(result.usedTokens).toBe(0);
  });
  it("builds context from entries", () => {
    const result = buildCopiedContext([userMsg("hello"), assistantMsg("hi there")], 50000);
    expect(result.text).toContain("user:");
    expect(result.text).toContain("assistant:");
    expect(result.usedTokens).toBeGreaterThan(0);
  });
  it("truncates by token budget", () => {
    const entries = Array.from({ length: 20 }, (_, i) => assistantMsg(`Message ${i} `.repeat(10), i));
    const result = buildCopiedContext(entries, 50);
    expect(result.usedTokens).toBeGreaterThan(0);
    expect(result.usedTokens).toBeLessThanOrEqual(50 + 100); // generous upper bound
  });
});

describe("estimateTokens", () => {
  it("returns positive for non-empty text", () => expect(estimateTokens("hello world")).toBeGreaterThan(0));
  it("returns 0 for empty string", () => expect(estimateTokens("")).toBe(0));
});
