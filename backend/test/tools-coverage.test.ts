import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileTools, MAX_FILE_BYTES } from "../src/tools/files.ts";
import { symlink } from "node:fs/promises";
import { runAgent } from "../src/runner.ts";
import type { Tool } from "../src/types.ts";

async function proj(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pyrofast-tools-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

function byName(tools: Tool[], name: string): Tool {
  const t = tools.find((x) => x.name === name);
  assert.ok(t, `falta el tool ${name}`);
  return t;
}

test("tools: fileTools expone exactamente list/read/write con su contrato", async () => {
  const dir = await proj();
  const tools = fileTools(dir);
  assert.deepEqual(tools.map((t) => t.name).sort(), ["list_files", "read_file", "write_file"]);
  for (const t of tools) {
    assert.ok(t.description.length > 0, `${t.name} sin descripción`);
    const params = t.parameters as { required?: string[] };
    assert.ok(params.required?.includes("path"), `${t.name} sin path requerido`);
  }
  const write = byName(tools, "write_file");
  assert.ok((write.parameters as { required?: string[] }).required?.includes("content"));
});

test("tools: list_files marca directorios con / y lista la raíz con path por defecto", async () => {
  const dir = await proj({ "a.txt": "a", "sub/b.txt": "b" });
  const list = byName(fileTools(dir), "list_files");
  const root = (await list.run({ path: "." })).split("\n").sort();
  assert.deepEqual(root, ["a.txt", "sub/"]);
  assert.equal(await list.run({ path: "sub" }), "b.txt");
});

test("tools: list_files de un directorio vacío devuelve cadena vacía", async () => {
  const dir = await proj();
  await mkdir(join(dir, "vacio"));
  const list = byName(fileTools(dir), "list_files");
  assert.equal(await list.run({ path: "vacio" }), "");
});

test("tools: list_files rechaza escapes y archivos inexistentes", async () => {
  const dir = await proj({ "a.txt": "a" });
  const list = byName(fileTools(dir), "list_files");
  await assert.rejects(() => list.run({ path: "../fuera" }), /fuera del proyecto/);
  await assert.rejects(() => list.run({ path: "/etc" }), /fuera del proyecto/);
  await assert.rejects(() => list.run({ path: "noexiste" }), /ENOENT/);
  // list_files sobre un archivo (no un directorio) también rechaza.
  await assert.rejects(() => list.run({ path: "a.txt" }));
});

test("tools: read_file lee subdirectorios, archivos vacíos y unicode", async () => {
  const dir = await proj({ "sub/nota.txt": "¡hola! ☀", "vacio.txt": "" });
  const read = byName(fileTools(dir), "read_file");
  assert.equal(await read.run({ path: "sub/nota.txt" }), "¡hola! ☀");
  assert.equal(await read.run({ path: "vacio.txt" }), "");
  assert.equal(await read.run({ path: "./sub/nota.txt" }), "¡hola! ☀");
  assert.equal(await read.run({ path: "sub/../sub/nota.txt" }), "¡hola! ☀");
});

test("tools: read_file rechaza escapes, absolutos fuera y lo inexistente", async () => {
  const dir = await proj({ "a.txt": "a" });
  const read = byName(fileTools(dir), "read_file");
  await assert.rejects(() => read.run({ path: "../escape.txt" }), /fuera del proyecto/);
  await assert.rejects(() => read.run({ path: "/etc/passwd" }), /fuera del proyecto/);
  await assert.rejects(() => read.run({ path: "falta.txt" }), /ENOENT/);
  // Leer un directorio no es leer un archivo.
  await assert.rejects(() => read.run({ path: "." }));
});

test("tools: write_file crea directorios anidados y confirma con 'escrito:'", async () => {
  const dir = await proj();
  const write = byName(fileTools(dir), "write_file");
  assert.equal(await write.run({ path: "a/b/c.txt", content: "hola" }), "escrito: a/b/c.txt");
  assert.equal(await readFile(join(dir, "a/b/c.txt"), "utf-8"), "hola");
});

test("tools: write_file sobrescribe un archivo existente", async () => {
  const dir = await proj({ "a.txt": "viejo" });
  const write = byName(fileTools(dir), "write_file");
  await write.run({ path: "a.txt", content: "nuevo" });
  assert.equal(await readFile(join(dir, "a.txt"), "utf-8"), "nuevo");
});

test("tools: write_file rechaza escapes y absolutos fuera del proyecto", async () => {
  const dir = await proj();
  const write = byName(fileTools(dir), "write_file");
  await assert.rejects(() => write.run({ path: "../escape.txt", content: "x" }), /fuera del proyecto/);
  await assert.rejects(() => write.run({ path: "/tmp/fuera-pyrofast.txt", content: "x" }), /fuera del proyecto/);
  await assert.rejects(() => write.run({ path: "a/../../escape.txt", content: "x" }), /fuera del proyecto/);
});

test("tools: write_file sobre una ruta que ya es directorio rechaza", async () => {
  const dir = await proj();
  await mkdir(join(dir, "carpeta"));
  const write = byName(fileTools(dir), "write_file");
  await assert.rejects(() => write.run({ path: "carpeta", content: "x" }));
});

test("tools: ciclo completo escribir → leer → listar", async () => {
  const dir = await proj();
  const tools = fileTools(dir);
  const write = byName(tools, "write_file");
  const read = byName(tools, "read_file");
  const list = byName(tools, "list_files");
  await write.run({ path: "index.html", content: "<h1>demo</h1>" });
  await write.run({ path: "css/estilo.css", content: "body{}" });
  assert.equal(await read.run({ path: "index.html" }), "<h1>demo</h1>");
  assert.deepEqual((await list.run({ path: "." })).split("\n").sort(), ["css/", "index.html"]);
  assert.equal(await list.run({ path: "css" }), "estilo.css");
});

test("tools + runner: un agente que escribe un archivo lo deja en disco", async () => {
  const dir = await proj();
  const tools = fileTools(dir);
  let step = 0;
  const result = await runAgent({
    provider: {
      async complete() {
        step++;
        if (step === 1) {
          return {
            message: {
              role: "assistant",
              content: "creo el archivo",
              toolCalls: [{
                id: "c1",
                name: "write_file",
                arguments: JSON.stringify({ path: "index.html", content: "<h1>hola</h1>" }),
              }],
            },
            finishReason: "tool_calls",
          };
        }
        return { message: { role: "assistant", content: "listo" }, finishReason: "stop" };
      },
    },
    tools,
    messages: [{ role: "user", content: "crea una página" }],
  });
  assert.equal(result.finishReason, "stop");
  assert.equal(await readFile(join(dir, "index.html"), "utf-8"), "<h1>hola</h1>");
  assert.equal(result.messages.find((m) => m.role === "tool")?.content, "escrito: index.html");
});

test("tools: symlink dentro que apunta fuera se rechaza; symlink a dentro se permite", async () => {
  const dir = await proj({ "real.txt": "dentro" });
  const fuera = await mkdtemp(join(tmpdir(), "pyrofast-fuera-"));
  await writeFile(join(fuera, "secreto.txt"), "SECRETO");
  await symlink(join(fuera, "secreto.txt"), join(dir, "enlace-fuera.txt"));
  await symlink(join(dir, "real.txt"), join(dir, "enlace-dentro.txt"));
  const read = byName(fileTools(dir), "read_file");
  await assert.rejects(() => read.run({ path: "enlace-fuera.txt" }), /fuera del proyecto/);
  assert.equal(await read.run({ path: "enlace-dentro.txt" }), "dentro");
});

test("tools: leer y escribir más de 1 MiB se rechaza; justo 1 MiB se permite", async () => {
  const dir = await proj();
  const read = byName(fileTools(dir), "read_file");
  const write = byName(fileTools(dir), "write_file");
  const grande = "x".repeat(MAX_FILE_BYTES + 1);
  await writeFile(join(dir, "grande.txt"), grande);
  await assert.rejects(() => read.run({ path: "grande.txt" }), /demasiado grande/);
  await assert.rejects(() => write.run({ path: "nuevo-grande.txt", content: grande }), /demasiado grande/);
  // El write rechazado no deja archivo a medias.
  await assert.rejects(() => readFile(join(dir, "nuevo-grande.txt"), "utf-8"));
  const justo = "y".repeat(MAX_FILE_BYTES);
  await write.run({ path: "justo.txt", content: justo });
  assert.equal((await read.run({ path: "justo.txt" })).length, MAX_FILE_BYTES);
});

test("tools: contenido binario (byte NUL) se rechaza al leer y al escribir", async () => {
  const dir = await proj();
  await writeFile(join(dir, "bin.dat"), Buffer.from([0x68, 0x00, 0x6c, 0x61]));
  const read = byName(fileTools(dir), "read_file");
  const write = byName(fileTools(dir), "write_file");
  await assert.rejects(() => read.run({ path: "bin.dat" }), /binario/);
  await assert.rejects(() => write.run({ path: "bin2.dat", content: "a\0b" }), /binario/);
});

test("tools: una ruta con byte NUL se rechaza antes de tocar el disco", async () => {
  const dir = await proj({ "a.txt": "a" });
  const read = byName(fileTools(dir), "read_file");
  await assert.rejects(() => read.run({ path: "a\0.txt" }), /inválida/);
});

test("tools + runner: un tool de archivos que falla (ruta fuera) no rompe el loop", async () => {
  const dir = await proj();
  const tools = fileTools(dir);
  let step = 0;
  const result = await runAgent({
    provider: {
      async complete() {
        step++;
        if (step === 1) {
          return {
            message: {
              role: "assistant",
              content: "",
              toolCalls: [{ id: "c1", name: "read_file", arguments: JSON.stringify({ path: "../secreto.txt" }) }],
            },
            finishReason: "tool_calls",
          };
        }
        return { message: { role: "assistant", content: "no pude leerlo" }, finishReason: "stop" };
      },
    },
    tools,
    messages: [{ role: "user", content: "lee fuera" }],
  });
  assert.equal(result.finishReason, "stop");
  assert.match(result.messages.find((m) => m.role === "tool")?.content ?? "", /fuera del proyecto/);
});
