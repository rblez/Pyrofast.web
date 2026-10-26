import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, access, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileTools, MAX_FILE_BYTES } from "../src/tools/files.ts";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "pyrofast-filetools-"));
  await writeFile(join(dir, "a.txt"), "hola");
  const tools = fileTools(dir);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  return { dir, read: byName.read_file, write: byName.write_file, list: byName.list_files };
}

test("flujo normal intacto: escribir, leer y listar (incl. subdirectorio)", async () => {
  const { dir, read, write, list } = await setup();
  assert.equal(await write.run({ path: "sub/b.txt", content: "mundo" }), "escrito: sub/b.txt");
  assert.equal(await read.run({ path: "sub/b.txt" }), "mundo");
  assert.match(await list.run({ path: "." }), /a\.txt/);
  assert.match(await list.run({ path: "sub" }), /b\.txt/);
  // Una ruta absoluta DENTRO de la raíz sigue siendo la raíz: no es escape.
  assert.equal(await read.run({ path: join(dir, "a.txt") }), "hola");
});

test("tamaño: lectura rechaza archivos mayores de 1 MiB sin cargarlos", async () => {
  const { dir, read } = await setup();
  await writeFile(join(dir, "grande.txt"), Buffer.alloc(MAX_FILE_BYTES + 1, "a"));
  await assert.rejects(() => read.run({ path: "grande.txt" }), /demasiado grande/);
  // El límite exacto sí se permite.
  await writeFile(join(dir, "justo.txt"), Buffer.alloc(MAX_FILE_BYTES, "a"));
  assert.equal((await read.run({ path: "justo.txt" })).length, MAX_FILE_BYTES);
});

test("tamaño: escritura rechaza contenido mayor de 1 MiB y no crea el archivo", async () => {
  const { dir, write } = await setup();
  await assert.rejects(
    () => write.run({ path: "grande.txt", content: "a".repeat(MAX_FILE_BYTES + 1) }),
    /demasiado grande/,
  );
  await assert.rejects(() => access(join(dir, "grande.txt")));
});

test("binario: lectura rechaza bytes NUL y UTF-8 inválido", async () => {
  const { dir, read } = await setup();
  // Cabecera PNG típica: contiene NUL y bytes no UTF-8.
  await writeFile(join(dir, "img.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
  await assert.rejects(() => read.run({ path: "img.png" }), /binario/);
  await writeFile(join(dir, "roto.bin"), Buffer.from([0xff, 0xfe, 0x41, 0x42]));
  await assert.rejects(() => read.run({ path: "roto.bin" }), /binario/);
});

test("binario: escritura rechaza contenido con NUL y no crea el archivo", async () => {
  const { dir, write } = await setup();
  await assert.rejects(
    () => write.run({ path: "mal.txt", content: "hola\0mundo" }),
    /binario/,
  );
  await assert.rejects(() => access(join(dir, "mal.txt")));
});

test("traversal: '..', variantes con '..' intermedio y rutas absolutas fuera", async () => {
  const { dir, read, write } = await setup();
  const outside = await mkdtemp(join(tmpdir(), "pyrofast-fuera-"));
  await writeFile(join(outside, "secreto.txt"), "SECRETO");
  const attempts = [
    "../escape.txt",
    "a/../../escape.txt",
    "sub/../../../escape.txt",
    "/etc/passwd",
    join(outside, "secreto.txt"),
  ];
  for (const path of attempts) {
    await assert.rejects(() => read.run({ path }), /fuera del proyecto/, path);
    await assert.rejects(() => write.run({ path, content: "x" }), /fuera del proyecto/, path);
  }
  // Nada se escribió fuera ni se filtró el secreto.
  await assert.rejects(() => access(join(outside, "escape.txt")));
  assert.equal(await readFile(join(outside, "secreto.txt"), "utf-8"), "SECRETO");
});

test("traversal: symlink dentro del proyecto que apunta fuera se rechaza", async () => {
  const { dir, read, list } = await setup();
  const outside = await mkdtemp(join(tmpdir(), "pyrofast-fuera-"));
  await writeFile(join(outside, "secreto.txt"), "SECRETO");
  await symlink(join(outside, "secreto.txt"), join(dir, "enlace.txt"));
  await assert.rejects(() => read.run({ path: "enlace.txt" }), /fuera del proyecto/);
  await mkdir(join(dir, "real"));
  await symlink(outside, join(dir, "real", "enlace-dir"));
  await assert.rejects(() => list.run({ path: "real/enlace-dir" }), /fuera del proyecto/);
});

test("traversal: escribir a través de un directorio symlink fuera se rechaza", async () => {
  const { dir, write } = await setup();
  const outside = await mkdtemp(join(tmpdir(), "pyrofast-fuera-"));
  await symlink(outside, join(dir, "salida"));
  await assert.rejects(
    () => write.run({ path: "salida/mal.txt", content: "x" }),
    /fuera del proyecto/,
  );
  await assert.rejects(() => access(join(outside, "mal.txt")));
});

test("regresión: raíz con barra final sigue operando dentro", async () => {
  const { dir } = await setup();
  const tools = fileTools(dir + "/");
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.equal(await byName.write_file.run({ path: "b.txt", content: "x" }), "escrito: b.txt");
  assert.equal(await byName.read_file.run({ path: "b.txt" }), "x");
});

test("regresión: write sin content rechaza y no crea el archivo", async () => {
  const { dir, write } = await setup();
  await assert.rejects(() => write.run({ path: "sincontent.txt" }), /requiere content/);
  await assert.rejects(() => access(join(dir, "sincontent.txt")));
});
