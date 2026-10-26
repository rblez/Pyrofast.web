import type { ChatMessage, ModelProvider, ProviderResponse, Tool } from "../types.ts";

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
  fetchImpl?: typeof fetch;
}

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

function toAnthropicMessage(m: ChatMessage): { role: "user" | "assistant"; content: Block[] } {
  if (m.role === "tool") {
    return { role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content }] };
  }
  if (m.role === "assistant") {
    const blocks: Block[] = [];
    if (m.content) blocks.push({ type: "text", text: m.content });
    for (const t of m.toolCalls ?? []) {
      blocks.push({ type: "tool_use", id: t.id, name: t.name, input: JSON.parse(t.arguments) });
    }
    return { role: "assistant", content: blocks };
  }
  return { role: "user", content: [{ type: "text", text: m.content }] };
}

/**
 * Claude vía la API de mensajes de Anthropic (formato nativo, no
 * OpenAI-compatible): tool_use / tool_result y stop_reason.
 */
export function anthropic(opts: AnthropicOptions): ModelProvider {
  const fetchFn = opts.fetchImpl ?? fetch;
  const baseURL = opts.baseURL ?? "https://api.anthropic.com";
  return {
    async complete(messages: ChatMessage[], tools: Tool[]): Promise<ProviderResponse> {
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
      const rest = messages.filter((m) => m.role !== "system");
      const res = await fetchFn(`${baseURL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: 4096,
          system: system || undefined,
          messages: rest.map(toAnthropicMessage),
          tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        content: Block[];
        stop_reason: string;
      };
      if (!Array.isArray(data.content)) throw new Error("anthropic: respuesta sin content");
      const text = data.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");
      const toolCalls = data.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, arguments: JSON.stringify(b.input) }));
      return {
        message: { role: "assistant", content: text, toolCalls: toolCalls.length ? toolCalls : undefined },
        finishReason: toolCalls.length ? "tool_calls" : "stop",
      };
    },
  };
}
