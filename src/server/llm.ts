import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";

class UnknownLlmProviderError extends Error {
  override name = "UnknownLlmProviderError";
  constructor(provider: string) {
    super(`Unknown LLM provider: ${provider}`);
  }
}

interface LlmConfig {
  provider: "google" | "anthropic";
  model: string;
}

function loadConfig(): LlmConfig {
  const configPath = resolve(process.cwd(), "llm-config.json");
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as LlmConfig;
}

let cachedModel: LanguageModel | null = null;

export function getLlm(): LanguageModel {
  if (cachedModel) return cachedModel;
  const config = loadConfig();
  if (config.provider === "google") {
    const google = createGoogleGenerativeAI();
    cachedModel = google(config.model);
  } else if (config.provider === "anthropic") {
    const anthropic = createAnthropic();
    cachedModel = anthropic(config.model);
  } else {
    throw new UnknownLlmProviderError(config.provider);
  }
  return cachedModel;
}
