import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAICompatible } from "../src/providers/openai-compatible.ts";
import { anthropic } from "../src/providers/anthropic.ts";
import { providerFor, PRESETS } from "../src/providers/presets.ts";
import { fileTools } from "../src/tools/files.ts";

/** Servidor falso que responde una completion fija, para probar sin llaves. */
async function fakeServer(body: unknown) {
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return { server, url: `http://127.0.0.1:${port}` };
}

test("openai-compatible mapea tool_calls", async () => {
  const { server, url } = await fakeServer({
    choices: [{
      message: {
        content: "",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: '{"path":"a.txt"}' } }],
      },
      finish_reason: "tool_calls",
    }],
  });
  try {
    const p = openAICompatible({ baseURL: url, apiKey: "test", model: "test" });
    const res = await p.complete([{ role: "user", content: "lee a.txt" }], []);
    assert.equal(res.finishReason, "tool_calls");
    assert.equal(res.message.toolCalls?.[0].name, "read_file");
  } finally {
    server.close();
  }
});

test("anthropic mapea tool_use", async () => {
  const { server, url } = await fakeServer({
    content: [
      { type: "text", text: "voy a leerlo" },
      { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.txt" } },
    ],
    stop_reason: "tool_use",
  });
  try {
    const p = anthropic({ apiKey: "test", model: "test", baseURL: url });
    const res = await p.complete([{ role: "user", content: "lee a.txt" }], []);
    assert.equal(res.finishReason, "tool_calls");
    assert.equal(res.message.toolCalls?.[0].name, "read_file");
    assert.match(res.message.toolCalls?.[0].arguments ?? "", /a\.txt/);
  } finally {
    server.close();
  }
});

test("presets: groq, gemini y openrouter apuntan a su baseURL", () => {
  const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
  assert.equal(byId.groq.baseURL, "https://api.groq.com/openai/v1");
  assert.equal(byId.gemini.baseURL, "https://generativelanguage.googleapis.com/v1beta/openai/");
  assert.equal(byId.openrouter.baseURL, "https://openrouter.ai/api/v1");
  assert.equal(byId.anthropic.baseURL, null);
  assert.throws(() => providerFor("noexiste", "x"), /provider desconocido/);
});

test("file tools rechazan rutas fuera del proyecto", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pyrofast-proj-"));
  await writeFile(join(dir, "a.txt"), "hola");
  const tools = fileTools(dir);
  const read = tools.find((t) => t.name === "read_file")!;
  assert.equal(await read.run({ path: "a.txt" }), "hola");
  await assert.rejects(() => read.run({ path: "../escape.txt" }), /fuera del proyecto/);
  await assert.rejects(() => read.run({ path: "/etc/passwd" }), /fuera del proyecto/);
});

/* --- Frente providers: los 6 presets + demo, con fetch simulado --- */
import { demoProvider } from "../src/providers/demo.ts";

type Captured = { url: string; init: Record<string, unknown> };

function mockFetchOk(json: unknown, captured?: Captured[]): typeof fetch {
  const fn = (async (url: unknown, init?: unknown) => {
    if (captured) captured.push({ url: String(url), init: (init ?? {}) as Record<string, unknown> });
    return {
      ok: true,
      status: 200,
      json: async () => json,
      text: async () => JSON.stringify(json),
    };
  }) as unknown as typeof fetch;
  return fn;
}

function mockFetchError(status: number, body: string): typeof fetch {
  return (async () => ({
    ok: false,
    status,
    json: async () => { throw new Error("no json en error"); },
    text: async () => body,
  })) as unknown as typeof fetch;
}

function openAITextReply(text: string) {
  return { choices: [{ message: { content: text, tool_calls: undefined }, finish_reason: "stop" }] };
}

const OPENAI_PRESETS = ["openrouter", "groq", "gemini", "deepseek", "openai"] as const;

test("presets: los 6 existen con label, modelo por defecto y freeTier", () => {
  assert.equal(PRESETS.length, 6);
  const ids = PRESETS.map((p) => p.id).sort();
  assert.deepEqual(ids, ["anthropic", "deepseek", "gemini", "groq", "openai", "openrouter"]);
  for (const p of PRESETS) {
    assert.ok(p.label.length > 0, `${p.id} sin label`);
    assert.ok(p.defaultModel.length > 0, `${p.id} sin modelo por defecto`);
    assert.ok(p.freeTier.length > 0, `${p.id} sin freeTier`);
  }
  assert.equal(PRESETS.find((p) => p.id === "anthropic")!.baseURL, null);
  for (const id of OPENAI_PRESETS) {
    assert.ok(PRESETS.find((p) => p.id === id)!.baseURL!.startsWith("https://"), `${id} sin baseURL https`);
  }
});

test("providerFor: cada preset OpenAI-compatible pide a su /chat/completions con Bearer y modelo por defecto", async () => {
  for (const id of OPENAI_PRESETS) {
    const preset = PRESETS.find((p) => p.id === id)!;
    const captured: Captured[] = [];
    const p = providerFor(id, "llave-test", undefined, mockFetchOk(openAITextReply(`hola desde ${id}`), captured));
    const res = await p.complete([{ role: "user", content: "hola" }], []);
    assert.equal(res.message.content, `hola desde ${id}`);
    assert.equal(res.finishReason, "stop");
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, `${preset.baseURL!.replace(/\/+$/, "")}/chat/completions`);
    assert.ok(!captured[0].url.includes("//chat/completions"), `${id} genera doble barra en la URL`);
    assert.equal(captured[0].init.method, "POST");
    const headers = captured[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer llave-test");
    const body = JSON.parse(captured[0].init.body as string) as { model: string; messages: unknown[] };
    assert.equal(body.model, preset.defaultModel);
    assert.deepEqual(body.messages, [{ role: "user", content: "hola" }]);
  }
});

test("providerFor: modelo explícito sobreescribe el por defecto", async () => {
  const captured: Captured[] = [];
  const p = providerFor("groq", "k", "mi-modelo", mockFetchOk(openAITextReply("ok"), captured));
  await p.complete([{ role: "user", content: "h" }], []);
  const body = JSON.parse(captured[0].init.body as string) as { model: string };
  assert.equal(body.model, "mi-modelo");
});

test("providerFor openai-compatible: tools van en el request y tool_calls vuelven mapeados", async () => {
  const captured: Captured[] = [];
  const tool = { name: "write_file", description: "escribe", parameters: { type: "object", properties: { path: { type: "string" } } }, run: async () => "ok" };
  const p = providerFor("openrouter", "k", undefined, mockFetchOk({
    choices: [{ message: { content: "", tool_calls: [{ id: "call_9", type: "function", function: { name: "write_file", arguments: '{"path":"index.html"}' } }] }, finish_reason: "tool_calls" }],
  }, captured));
  const res = await p.complete([{ role: "user", content: "crea la app" }], [tool]);
  const body = JSON.parse(captured[0].init.body as string) as { tools: { type: string; function: { name: string } }[] };
  assert.equal(body.tools[0].type, "function");
  assert.equal(body.tools[0].function.name, "write_file");
  assert.equal(res.finishReason, "tool_calls");
  assert.equal(res.message.toolCalls?.[0].name, "write_file");
  assert.match(res.message.toolCalls?.[0].arguments ?? "", /index\.html/);
});

test("openai-compatible: error HTTP se propaga con status y cuerpo", async () => {
  const p = providerFor("deepseek", "mala", undefined, mockFetchError(401, "Incorrect API key provided"));
  await assert.rejects(() => p.complete([{ role: "user", content: "h" }], []), /401.*Incorrect API key/);
});

test("openai-compatible: respuesta sin choices da error útil en vez de TypeError", async () => {
  const p = providerFor("openai", "k", undefined, mockFetchOk({ choices: [] }));
  await assert.rejects(() => p.complete([{ role: "user", content: "h" }], []), /respuesta sin choices/);
});

test("providerFor anthropic: pide a /v1/messages con x-api-key, modelo por defecto y devuelve texto", async () => {
  const captured: Captured[] = [];
  const p = providerFor("anthropic", "sk-ant-test", undefined, mockFetchOk({
    content: [{ type: "text", text: "hola desde Claude" }],
    stop_reason: "end_turn",
  }, captured));
  const res = await p.complete([{ role: "user", content: "hola" }], []);
  assert.equal(res.message.content, "hola desde Claude");
  assert.equal(res.finishReason, "stop");
  assert.equal(captured.length, 1);
  assert.ok(captured[0].url.endsWith("/v1/messages"), captured[0].url);
  const headers = captured[0].init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "sk-ant-test");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(captured[0].init.body as string) as { model: string; max_tokens: number };
  assert.equal(body.model, "claude-opus-4-5");
  assert.equal(body.max_tokens, 4096);
});

test("anthropic: system se extrae aparte y tool_use vuelve mapeado", async () => {
  const captured: Captured[] = [];
  const p = providerFor("anthropic", "k", undefined, mockFetchOk({
    content: [
      { type: "text", text: "voy a escribirlo" },
      { type: "tool_use", id: "toolu_9", name: "write_file", input: { path: "index.html" } },
    ],
    stop_reason: "tool_use",
  }, captured));
  const res = await p.complete([
    { role: "system", content: "eres un agente" },
    { role: "user", content: "crea la app" },
  ], []);
  const body = JSON.parse(captured[0].init.body as string) as { system: string; messages: { role: string }[] };
  assert.equal(body.system, "eres un agente");
  assert.ok(body.messages.every((m) => m.role !== "system"));
  assert.equal(res.finishReason, "tool_calls");
  assert.equal(res.message.content, "voy a escribirlo");
  assert.equal(res.message.toolCalls?.[0].name, "write_file");
  assert.match(res.message.toolCalls?.[0].arguments ?? "", /index\.html/);
});

test("anthropic: mensaje tool se serializa como tool_result y error HTTP se propaga", async () => {
  const captured: Captured[] = [];
  const p = providerFor("anthropic", "k", undefined, mockFetchOk({
    content: [{ type: "text", text: "listo" }],
    stop_reason: "end_turn",
  }, captured));
  await p.complete([
    { role: "assistant", content: "", toolCalls: [{ id: "toolu_1", name: "read_file", arguments: '{"path":"a.txt"}' }] },
    { role: "tool", content: "hola", toolCallId: "toolu_1" },
  ], []);
  const body = JSON.parse(captured[0].init.body as string) as { messages: { role: string; content: { type: string; tool_use_id?: string }[] }[] };
  const toolMsg = body.messages.find((m) => m.content.some((b) => b.type === "tool_result"));
  assert.ok(toolMsg, "falta el bloque tool_result");
  assert.equal(toolMsg!.content[0].tool_use_id, "toolu_1");

  const pErr = providerFor("anthropic", "mala", undefined, mockFetchError(401, "invalid x-api-key"));
  await assert.rejects(() => pErr.complete([{ role: "user", content: "h" }], []), /anthropic 401.*invalid x-api-key/);
});

test("anthropic: respuesta sin content da error útil", async () => {
  const p = providerFor("anthropic", "k", undefined, mockFetchOk({ stop_reason: "end_turn" }));
  await assert.rejects(() => p.complete([{ role: "user", content: "h" }], []), /respuesta sin content/);
});

test("demo: dos pasos — primero escribe index.html, luego cierra", async () => {
  const p = demoProvider();
  const first = await p.complete([{ role: "user", content: "quiero una app de tareas" }], []);
  assert.equal(first.finishReason, "tool_calls");
  assert.equal(first.message.toolCalls?.length, 1);
  assert.equal(first.message.toolCalls?.[0].name, "write_file");
  const args = JSON.parse(first.message.toolCalls![0].arguments) as { path: string; content: string };
  assert.equal(args.path, "index.html");
  assert.match(args.content, /<html/);
  assert.match(args.content, /Mis tareas/);
  const second = await p.complete([{ role: "user", content: "x" }], []);
  assert.equal(second.finishReason, "stop");
  assert.ok(second.message.content.length > 0);
  assert.equal(second.message.toolCalls, undefined);
});
