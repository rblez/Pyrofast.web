import type { ModelProvider } from "./types.ts";
import { openAICompatible } from "./openai-compatible.ts";
import { anthropic } from "./anthropic.ts";

export interface Preset {
  id: string;
  label: string;
  /** null = provider nativo (Anthropic), no OpenAI-compatible. */
  baseURL: string | null;
  defaultModel: string;
  freeTier: string;
}

export const PRESETS: Preset[] = [
  { id: "openrouter", label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", defaultModel: "openrouter/auto", freeTier: "Modelos gratis con el prefijo :free y llaves de otros providers" },
  { id: "groq", label: "Groq", baseURL: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", freeTier: "Tier gratis con límites por minuto/día" },
  { id: "gemini", label: "Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", defaultModel: "gemini-2.5-flash", freeTier: "Tier gratis de Google AI Studio" },
  { id: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", freeTier: "Precios bajos; sin tier gratis permanente" },
  { id: "anthropic", label: "Claude (Anthropic)", baseURL: null, defaultModel: "claude-opus-4-5", freeTier: "Sin tier gratis; de pago por uso" },
  { id: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", defaultModel: "gpt-5-mini", freeTier: "Sin tier gratis; de pago por uso" },
];

/**
 * Fabrica el provider por nombre de preset. La llave la trae el usuario
 * (BYOK): el backend nunca guarda llaves, llegan por request.
 */
export function providerFor(presetId: string, apiKey: string, model?: string, fetchImpl?: typeof fetch): ModelProvider {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`provider desconocido: ${presetId}`);
  const chosen = model ?? preset.defaultModel;
  if (preset.baseURL === null) return anthropic({ apiKey, model: chosen, fetchImpl });
  return openAICompatible({ baseURL: preset.baseURL, apiKey, model: chosen, fetchImpl });
}
