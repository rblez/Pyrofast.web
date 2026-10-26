import test from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "../src/runner.ts";
import type { ChatMessage, ModelProvider, ProviderResponse, Tool } from "../src/types.ts";

function tool(name: string, run: (args: Record<string, unknown>) => Promise<string> | string): Tool {
  return { name, description: `tool de prueba ${name}`, parameters: { type: "object" }, run: async (a) => run(a) };
}

/** Provider guionado: devuelve las respuestas en orden; si se agotan, repite la última. */
function scripted(responses: ProviderResponse[]): ModelProvider & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  let i = 0;
  return {
    calls,
    async complete(messages) {
      // Copia en el momento: el runner sigue empujando sobre su propio array.
      calls.push(JSON.parse(JSON.stringify(messages)) as ChatMessage[]);
      const res = responses[Math.min(i, responses.length - 1)];
      i++;
      return JSON.parse(JSON.stringify(res)) as ProviderResponse;
    },
  };
}

const stop = (content: string): ProviderResponse => ({
  message: { role: "assistant", content },
  finishReason: "stop",
});

const toolTurn = (calls: { id: string; name: string; args: unknown }[]): ProviderResponse => ({
  message: {
    role: "assistant",
    content: "",
    toolCalls: calls.map((c) => ({ id: c.id, name: c.name, arguments: JSON.stringify(c.args) })),
  },
  finishReason: "tool_calls",
});

test("runner: stop inmediato sin tool calls devuelve 1 paso", async () => {
  const provider = scripted([stop("hola")]);
  const result = await runAgent({
    provider,
    tools: [],
    messages: [{ role: "user", content: "hola" }],
  });
  assert.equal(result.finishReason, "stop");
  assert.equal(result.steps, 1);
  // El runner antepone el contrato de salida como mensaje system.
  assert.deepEqual(
    result.messages.map((m) => m.role),
    ["system", "user", "assistant"],
  );
  assert.match(result.messages[0].content, /UN SOLO ARCHIVO HTML/);
  assert.equal(result.messages[2].content, "hola");
});

test("runner: ejecuta un tool call y su resultado vuelve como mensaje tool", async () => {
  const seen: unknown[] = [];
  const tools = [
    tool("eco", async (args) => {
      seen.push(args);
      return `eco:${args.text}`;
    }),
  ];
  const provider = scripted([
    toolTurn([{ id: "c1", name: "eco", args: { text: "ping" } }]),
    stop("listo"),
  ]);
  const result = await runAgent({
    provider,
    tools,
    messages: [{ role: "user", content: "di ping" }],
  });
  assert.equal(result.finishReason, "stop");
  assert.equal(result.steps, 2);
  assert.deepEqual(seen, [{ text: "ping" }]);
  const toolMsg = result.messages[3];
  assert.equal(toolMsg.role, "tool");
  assert.equal(toolMsg.content, "eco:ping");
  assert.equal(toolMsg.toolCallId, "c1");
  assert.equal(result.messages[4].content, "listo");
});

test("runner: varias tool calls en un turno se ejecutan en orden", async () => {
  const order: string[] = [];
  const tools = [
    tool("a", async () => {
      order.push("a");
      return "ra";
    }),
    tool("b", async () => {
      order.push("b");
      return "rb";
    }),
  ];
  const provider = scripted([
    toolTurn([
      { id: "c1", name: "a", args: {} },
      { id: "c2", name: "b", args: {} },
    ]),
    stop("fin"),
  ]);
  const result = await runAgent({ provider, tools, messages: [{ role: "user", content: "x" }] });
  assert.deepEqual(order, ["a", "b"]);
  // Un solo paso de provider para las dos calls, más el stop: 2 pasos, no 3.
  assert.equal(result.steps, 2);
  assert.deepEqual(
    result.messages.filter((m) => m.role === "tool").map((m) => [m.toolCallId, m.content]),
    [
      ["c1", "ra"],
      ["c2", "rb"],
    ],
  );
});

test("runner: el resultado de un tool llega al provider en la siguiente llamada", async () => {
  const provider = scripted([
    toolTurn([{ id: "c1", name: "eco", args: { text: "abc" } }]),
    stop("fin"),
  ]);
  await runAgent({
    provider,
    tools: [tool("eco", async () => "resultado-abc")],
    messages: [{ role: "user", content: "x" }],
  });
  const secondCall = provider.calls[1];
  const toolMsg = secondCall.find((m) => m.role === "tool");
  assert.equal(toolMsg?.content, "resultado-abc");
  assert.equal(toolMsg?.toolCallId, "c1");
});

test("runner: tool desconocido no rompe el loop y deja un error como resultado", async () => {
  const provider = scripted([
    toolTurn([{ id: "c9", name: "no_existe", args: {} }]),
    stop("seguimos"),
  ]);
  const result = await runAgent({ provider, tools: [], messages: [{ role: "user", content: "x" }] });
  assert.equal(result.finishReason, "stop");
  assert.equal(result.steps, 2);
  const toolMsg = result.messages.find((m) => m.role === "tool");
  assert.equal(toolMsg?.content, "Error: tool desconocido: no_existe");
  assert.equal(toolMsg?.toolCallId, "c9");
});

test("runner: tool que lanza Error no rompe el loop", async () => {
  const provider = scripted([
    toolTurn([{ id: "c1", name: "falla", args: {} }]),
    stop("fin"),
  ]);
  const result = await runAgent({
    provider,
    tools: [tool("falla", async () => { throw new Error("se cayó"); })],
    messages: [{ role: "user", content: "x" }],
  });
  assert.equal(result.finishReason, "stop");
  assert.equal(result.messages.find((m) => m.role === "tool")?.content, "Error: se cayó");
});

test("runner: tool que lanza un valor no-Error también se convierte en mensaje de error", async () => {
  const provider = scripted([
    toolTurn([{ id: "c1", name: "falla", args: {} }]),
    stop("fin"),
  ]);
  const result = await runAgent({
    provider,
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    tools: [tool("falla", async () => { throw "falla plana"; })],
    messages: [{ role: "user", content: "x" }],
  });
  assert.equal(result.messages.find((m) => m.role === "tool")?.content, "Error: falla plana");
});

test("runner: argumentos JSON inválidos no ejecutan el tool y no rompen el loop", async () => {
  let executed = 0;
  const provider = scripted([
    {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "eco", arguments: "{no-json" }],
      },
      finishReason: "tool_calls",
    },
    stop("fin"),
  ]);
  const result = await runAgent({
    provider,
    tools: [tool("eco", async () => { executed++; return "ok"; })],
    messages: [{ role: "user", content: "x" }],
  });
  assert.equal(executed, 0);
  assert.equal(result.finishReason, "stop");
  assert.match(result.messages.find((m) => m.role === "tool")?.content ?? "", /^Error:/);
});

test("runner: argumentos ausentes o vacíos llegan al tool como objeto vacío", async () => {
  const seen: unknown[] = [];
  const provider = scripted([
    {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "c1", name: "eco", arguments: "" },
          { id: "c2", name: "eco", arguments: undefined as unknown as string },
        ],
      },
      finishReason: "tool_calls",
    },
    stop("fin"),
  ]);
  await runAgent({
    provider,
    tools: [tool("eco", async (args) => { seen.push(args); return "ok"; })],
    messages: [{ role: "user", content: "x" }],
  });
  assert.deepEqual(seen, [{}, {}]);
});

test("runner: maxSteps personalizado corta el loop con max_steps", async () => {
  const alwaysTool: ModelProvider = {
    async complete() {
      return toolTurn([{ id: "c1", name: "eco", args: {} }]);
    },
  };
  const result = await runAgent({
    provider: alwaysTool,
    tools: [tool("eco", async () => "ok")],
    messages: [{ role: "user", content: "x" }],
    maxSteps: 3,
  });
  assert.equal(result.finishReason, "max_steps");
  assert.equal(result.steps, 3);
  // system + 1 mensaje inicial + 3 turnos (assistant + tool cada uno).
  assert.equal(result.messages.length, 8);
});

test("runner: sin maxSteps el límite por defecto es 25", async () => {
  let calls = 0;
  const alwaysTool: ModelProvider = {
    async complete() {
      calls++;
      return toolTurn([{ id: `c${calls}`, name: "eco", args: {} }]);
    },
  };
  const result = await runAgent({
    provider: alwaysTool,
    tools: [tool("eco", async () => "ok")],
    messages: [{ role: "user", content: "x" }],
  });
  assert.equal(result.finishReason, "max_steps");
  assert.equal(result.steps, 25);
});

test("runner: maxSteps 0 no llama al provider y devuelve max_steps", async () => {
  let calls = 0;
  const provider: ModelProvider = {
    async complete() {
      calls++;
      return stop("nunca");
    },
  };
  const input: ChatMessage[] = [{ role: "user", content: "x" }];
  const result = await runAgent({ provider, tools: [], messages: input, maxSteps: 0 });
  assert.equal(calls, 0);
  assert.equal(result.steps, 0);
  assert.equal(result.finishReason, "max_steps");
  // Aunque no se llama al provider, el mensaje system ya está antepuesto.
  assert.equal(result.messages[0].role, "system");
  assert.deepEqual(result.messages.slice(1), input);
});

test("runner: finishReason stop con toolCalls no ejecuta los tools", async () => {
  let executed = 0;
  const provider = scripted([
    {
      message: {
        role: "assistant",
        content: "paro aquí",
        toolCalls: [{ id: "c1", name: "eco", arguments: "{}" }],
      },
      finishReason: "stop",
    },
  ]);
  const result = await runAgent({
    provider,
    tools: [tool("eco", async () => { executed++; return "ok"; })],
    messages: [{ role: "user", content: "x" }],
  });
  assert.equal(executed, 0);
  assert.equal(result.finishReason, "stop");
  assert.equal(result.steps, 1);
});

test("runner: finishReason tool_calls con lista vacía se trata como stop", async () => {
  let executed = 0;
  const provider = scripted([
    { message: { role: "assistant", content: "nada", toolCalls: [] }, finishReason: "tool_calls" },
  ]);
  const result = await runAgent({
    provider,
    tools: [tool("eco", async () => { executed++; return "ok"; })],
    messages: [{ role: "user", content: "x" }],
  });
  assert.equal(executed, 0);
  assert.equal(result.finishReason, "stop");
  assert.equal(result.steps, 1);
});

test("runner: un error del provider se propaga (no se convierte en mensaje)", async () => {
  const provider: ModelProvider = {
    async complete() {
      throw new Error("provider caído");
    },
  };
  await assert.rejects(
    runAgent({ provider, tools: [], messages: [{ role: "user", content: "x" }] }),
    /provider caído/,
  );
});

test("runner: no muta el array de mensajes de entrada", async () => {
  const input: ChatMessage[] = [{ role: "user", content: "x" }];
  const provider = scripted([stop("fin")]);
  const result = await runAgent({ provider, tools: [], messages: input });
  assert.equal(input.length, 1);
  // system antepuesto + entrada + respuesta.
  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0].role, "system");
  assert.deepEqual(result.messages[1], input[0]);
  assert.notEqual(result.messages, input);
});

test("runner: el provider recibe el contrato system como primer mensaje", async () => {
  const provider = scripted([stop("fin")]);
  await runAgent({ provider, tools: [], messages: [{ role: "user", content: "x" }] });
  const firstCall = provider.calls[0];
  assert.equal(firstCall[0].role, "system");
  assert.match(firstCall[0].content, /Tailwind/);
  assert.equal(firstCall[1].role, "user");
});
