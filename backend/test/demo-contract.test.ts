import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoProvider } from "../src/providers/demo.ts";
import { SYSTEM_PROMPT } from "../src/system-prompt.ts";
import { runAgent } from "../src/runner.ts";
import type { ChatMessage } from "../src/types.ts";

/** Extrae el contenido de la app demo que escribe el provider demo. */
async function demoHtml(): Promise<string> {
  const res = await demoProvider().complete([], []);
  const call = res.message.toolCalls?.[0];
  assert.ok(call, "el demo debe emitir un tool call");
  assert.equal(call.name, "write_file");
  const args = JSON.parse(call.arguments) as { path: string; content: string };
  assert.equal(args.path, "index.html");
  return args.content;
}

/** Bloques <script> en línea del HTML (excluye el CDN, que no tiene cuerpo). */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    out.push(m[1]);
  }
  return out;
}

const FORBIDDEN_CSS = /(bootstrap|bulma|foundation|materialize|semantic-?ui|tailwind\.config|@tailwind)/i;
const FORBIDDEN_ICONS = /(font-?awesome|lucide|feather-?icons|remixicon|solar-?icons|ionicons|material-?icons|cdn\.jsdelivr[^"]*icons|unpkg[^"]*icons)/i;

test("demo usa Tailwind Play CDN y ningún otro framework CSS", async () => {
  const html = await demoHtml();
  assert.ok(html.includes('<script src="https://cdn.tailwindcss.com"></script>'), "falta el script del Play CDN de Tailwind");
  assert.ok(!html.includes("<style"), "el demo no debe traer <style> propio: todo el estilo va con clases Tailwind");
  assert.ok(!FORBIDDEN_CSS.test(html), "el demo trae otro framework CSS");
  assert.ok(!html.match(/<link[^>]+stylesheet/g), "el demo no debe traer hojas de estilo externas");
});

test("demo trae iconos Majesticons Line en línea y ningún icono de otra fuente", async () => {
  const html = await demoHtml();
  assert.ok(html.includes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"'), "falta un SVG en línea con viewBox 0 0 24 24");
  // Trazos exactos copiados de majesticons/line: plus, delete-bin y checkbox-list.
  assert.ok(html.includes('d="M5 12h7m7 0h-7m0 0V5m0 7v7"'), "falta el icono plus-line");
  assert.ok(html.includes('d="M9 7v0a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3v0'), "falta el icono delete-bin-line");
  assert.ok(html.includes('d="M11 5h10m-10 7h10m-10 7h10"'), "falta el icono checkbox-list-line");
  assert.ok(!FORBIDDEN_ICONS.test(html), "el demo trae iconos de otra fuente");
});

test("demo conserva el comportamiento: agregar, marcar hecha, eliminar", async () => {
  const html = await demoHtml();
  assert.ok(html.includes("Agregar"), "falta el botón Agregar");
  assert.ok(html.includes("addEventListener('submit'"), "falta el submit del formulario");
  assert.ok(html.includes("line-through"), "marcar hecha debe tachar la tarea");
  assert.ok(html.includes(".remove()"), "falta eliminar la tarea");
  assert.ok(html.includes('id="t"') && html.includes('id="list"'), "faltan input o lista");
});

test("el JS en línea de la app demo no tiene errores de sintaxis", async () => {
  const html = await demoHtml();
  const scripts = inlineScripts(html);
  assert.ok(scripts.length >= 1, "la app demo debe tener un <script> en línea");
  const dir = await mkdtemp(join(tmpdir(), "pyrofast-demo-"));
  try {
    for (let i = 0; i < scripts.length; i++) {
      const file = join(dir, `script-${i}.js`);
      await writeFile(file, scripts[i]);
      execFileSync("node", ["--check", file], { encoding: "utf8" });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("system prompt contiene todas las restricciones del contrato", () => {
  for (const needle of [
    "https://cdn.tailwindcss.com",
    "Tailwind",
    "Majesticons",
    "Streamline",
    "un solo",
    "sin build",
    "Bootstrap",
    "Lucide",
  ]) {
    assert.ok(
      SYSTEM_PROMPT.toLowerCase().includes(needle.toLowerCase()),
      `el system prompt debe mencionar: ${needle}`,
    );
  }
  assert.ok(/prohibido/i.test(SYSTEM_PROMPT), "el system prompt debe prohibir explícitamente lo fuera del contrato");
});

test("runAgent incluye el system prompt como primer mensaje en todo run", async () => {
  let seen: ChatMessage[] = [];
  const provider = {
    async complete(messages: ChatMessage[]) {
      seen = [...messages];
      return { message: { role: "assistant", content: "ok" }, finishReason: "stop" as const };
    },
  };
  const result = await runAgent({
    provider,
    tools: [],
    messages: [{ role: "user", content: "hazme una app de tareas" }],
  });
  assert.equal(seen[0]?.role, "system");
  assert.equal(seen[0]?.content, SYSTEM_PROMPT);
  assert.equal(seen[1]?.content, "hazme una app de tareas");
  assert.equal(result.messages[0]?.role, "system");
  assert.equal(result.messages[0]?.content, SYSTEM_PROMPT);
});
