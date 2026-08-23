import type { ModelInfo, ModelRef, SessionMessageInfo } from "@opencode-ai/client";
import type { ResolvedModel } from "./types";

export type ModelSource = "config" | "session" | "default";

export type ResolvedModelWithSource = {
  model: ResolvedModel;
  source: ModelSource;
  notice?: string;
};

export function parseModelOverride(value: string): ResolvedModel | undefined {
  const [providerID, ...rest] = value.split("/");
  const id = rest.join("/");
  if (!providerID || !id) return undefined;
  return { providerID, id };
}

export function resolveModel(
  modelOverride: string | null,
  variantOverride: string | null,
  entries: SessionMessageInfo[],
  sessionModel?: ModelRef,
): ResolvedModelWithSource {
  if (modelOverride) {
    const model = parseModelOverride(modelOverride);
    if (model) return { model: { ...model, ...(variantOverride ? { variant: variantOverride } : {}) }, source: "config" };
  }

  if (sessionModel) {
    return {
      model: { providerID: sessionModel.providerID, id: sessionModel.id, variant: sessionModel.variant },
      source: "session",
    };
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "assistant" && entry.model) {
      return {
        model: { providerID: entry.model.providerID, id: entry.model.id, variant: entry.model.variant },
        source: "session",
      };
    }
  }

  return { model: {}, source: "default" };
}

export function resolveDefaultModel(
  models: ModelInfo[] | undefined,
  configuredModel: string | null,
  configuredVariant: string | null,
  sessionModel: ModelRef | undefined,
  entries: SessionMessageInfo[],
): ResolvedModelWithSource {
  const resolved = resolveModel(configuredModel, configuredVariant, entries, sessionModel);
  if (resolved.source !== "config") return resolved;
  if (isAvailableModel(models, resolved.model)) return resolved;

  return {
    ...resolveModel(null, null, entries, sessionModel),
    notice: `Configured mini model ${formatResolvedModel(resolved.model)} was not found. The main session model will be used.`,
  };
}

function isAvailableModel(models: ModelInfo[] | undefined, resolved: ResolvedModel) {
  if (!resolved.providerID || !resolved.id) return false;
  const model = models?.find((m) => m.providerID === resolved.providerID && m.id === resolved.id);
  if (!model) return false;
  if (!resolved.variant) return true;
  return model.variants.some((v) => v.id === resolved.variant);
}

export function formatResolvedModel(resolved: ResolvedModel) {
  if (!resolved.providerID || !resolved.id) return "default";
  const base = `${resolved.providerID}/${resolved.id}`;
  return resolved.variant ? `${base} (${resolved.variant})` : base;
}

export function resolveModelContextWindow(
  models: ModelInfo[] | undefined,
  resolved: ResolvedModel,
): number | undefined {
  if (!resolved.providerID || !resolved.id) return undefined;
  return models?.find((m) => m.providerID === resolved.providerID && m.id === resolved.id)?.limit?.context;
}
