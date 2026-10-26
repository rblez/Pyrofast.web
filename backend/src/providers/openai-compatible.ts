import type { ChatMessage, ModelProvider, ProviderResponse, Tool } from "../types.ts";

export interface OpenAICompatibleOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

function toOpenAIMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  }
  const out: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.toolCalls) {
    out.tool_calls = m.toolCalls.map((t) => ({
      id: t.id,
      type: "function",
      function: { name: t.name, arguments: t.arguments },
    }));
  }
  return out;
}

/**
 * Cualquier API compatible con OpenAI: OpenAI, OpenRouter, Groq,
 * DeepSeek, Together y el endpoint OpenAI-compatible de Gemini.
 * Solo cambia el baseURL y la llave.
 */
export function openAICompatible(opts: OpenAICompatibleOptions): ModelProvider {
  const fetchFn = opts.fetchImpl ?? fetch;
  // Sin esto, un baseURL con barra final (p. ej. el de Gemini) genera
  // ".../openai//chat/completions" (doble barra).
  const baseURL = opts.baseURL.replace(/\/+$/, "");
  return {
    async complete(messages: ChatMessage[], tools: Tool[]): Promise<ProviderResponse> {
      const res = await fetchFn(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: messages.map(toOpenAIMessage),
          tools: tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }),
      });
      if (!res.ok) throw new Error(`provider ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason: string }[];
      };
      if (!data.choices?.length) throw new Error("provider: respuesta sin choices");
      const choice = data.choices[0];
      const toolCalls = (choice.message.tool_calls ?? []).map((t) => ({
        id: t.id,
        name: t.function.name,
        arguments: t.function.arguments,
      }));
      return {
        message: {
          role: "assistant",
          content: choice.message.content ?? "",
          toolCalls: toolCalls.length ? toolCalls : undefined,
        },
        finishReason: toolCalls.length ? "tool_calls" : "stop",
      };
    },
  };
}
