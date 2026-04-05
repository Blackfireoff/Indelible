/**
 * Config + transport LLM partagés entre extraction de statements et raffinement.
 */

import type OpenAI from "openai";
import { ensureZerogLlmClient, zerogChatCompletion } from "./zerogLlmClient.js";

export type LlmRefinementProvider = "local" | "0g";

export interface LlmRefinementConfig {
  provider?: LlmRefinementProvider;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  windowSize?: number;
  maxWindowRetries?: number;
}

export interface ResolvedLlmRefinementConfig {
  provider: LlmRefinementProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  windowSize: number;
  maxWindowRetries: number;
  zerogMaxTokens: number;
}

export function parseProvider(envVal: string | undefined): LlmRefinementProvider {
  const v = (envVal ?? process.env.LLM_REFINEMENT_PROVIDER ?? "local").trim().toLowerCase();
  if (v === "0g" || v === "zerog" || v === "0g-compute") return "0g";
  return "local";
}

export function resolveLlmConfig(cfg: LlmRefinementConfig = {}): ResolvedLlmRefinementConfig {
  const provider = cfg.provider ?? parseProvider(undefined);
  const model =
    cfg.model ??
    (provider === "0g"
      ? (process.env.LLM_0G_MODEL ?? process.env.LOCAL_LLM_MODEL ?? "").trim() || "service-default"
      : (process.env.LOCAL_LLM_MODEL ?? "local-model"));

  return {
    provider,
    baseUrl: cfg.baseUrl ?? process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
    apiKey: cfg.apiKey ?? process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
    model,
    timeoutMs: cfg.timeoutMs ?? parseInt(process.env.LOCAL_LLM_TIMEOUT_MS ?? "60000", 10),
    windowSize: cfg.windowSize ?? 5,
    maxWindowRetries: cfg.maxWindowRetries ?? 2,
    zerogMaxTokens: parseInt(process.env.LLM_0G_MAX_TOKENS ?? "2048", 10),
  };
}

export async function completeLlmChat(
  cfg: ResolvedLlmRefinementConfig,
  localClient: OpenAI | null,
  systemPrompt: string,
  userMsg: string,
): Promise<{ rawContent: string; modelUsed: string }> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMsg },
  ];

  if (cfg.provider === "0g") {
    const modelArg =
      cfg.model && cfg.model !== "service-default" ? cfg.model : undefined;
    const out = await zerogChatCompletion({
      messages,
      model: modelArg,
      temperature: 0,
      max_tokens: cfg.zerogMaxTokens,
    });
    return { rawContent: out.content, modelUsed: out.modelUsed };
  }

  if (!localClient) {
    throw new Error("completeLlmChat: OpenAI client missing for local provider");
  }

  const response = await localClient.chat.completions.create({
    model: cfg.model,
    temperature: 0,
    max_tokens: 2048,
    messages,
  });
  const rawContent = response.choices[0]?.message?.content ?? "";
  return { rawContent, modelUsed: cfg.model };
}

/**
 * Extrait un objet JSON du texte modèle (fences markdown, bruit avant/après).
 */
export function extractJsonFromOutput(raw: string): string | null {
  const text = raw.replace(/^\uFEFF/, "").trim();

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    if (inner.startsWith("{") || inner.startsWith("[")) return inner;
  }

  const startBrace = text.indexOf("{");
  const startBracket = text.indexOf("[");
  let start = -1;
  let openChar: string;
  let closeChar: string;

  if (startBrace === -1 && startBracket === -1) return null;
  if (startBrace === -1) {
    start = startBracket;
    openChar = "[";
    closeChar = "]";
  } else if (startBracket === -1) {
    start = startBrace;
    openChar = "{";
    closeChar = "}";
  } else if (startBrace < startBracket) {
    start = startBrace;
    openChar = "{";
    closeChar = "}";
  } else {
    start = startBracket;
    openChar = "[";
    closeChar = "]";
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}
