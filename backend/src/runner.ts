import type { ChatMessage, RunOptions, RunResult, Tool } from "./types.ts";
import { SYSTEM_PROMPT } from "./system-prompt.ts";

/**
 * Loop del agente: pide al modelo, ejecuta sus tool calls, devuelve los
 * resultados y repite. Un tool que falla no rompe el loop: su error
 * vuelve al modelo como resultado.
 */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const maxSteps = opts.maxSteps ?? 25;
  // El contrato de salida va siempre como primer mensaje del sistema;
  // el resto de la lógica del loop no cambia.
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...opts.messages,
  ];
  let steps = 0;
  while (steps < maxSteps) {
    const res = await opts.provider.complete(messages, opts.tools);
    messages.push(res.message);
    steps++;
    if (res.finishReason === "stop" || !res.message.toolCalls?.length) {
      return { messages, steps, finishReason: "stop" };
    }
    for (const call of res.message.toolCalls) {
      const tool = opts.tools.find((t) => t.name === call.name);
      let result: string;
      if (!tool) {
        result = `Error: tool desconocido: ${call.name}`;
      } else {
        try {
          result = await tool.run(JSON.parse(call.arguments || "{}"));
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      messages.push({ role: "tool", content: result, toolCallId: call.id });
    }
  }
  return { messages, steps, finishReason: "max_steps" };
}

export type { Tool };
