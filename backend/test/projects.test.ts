import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
  isValidProjectName,
  validateProjectName,
  projectRoot,
  listProjects,
  createProject,
} from "../src/projects.ts";

async function tmpBase() {
  return mkdtemp(join(tmpdir(), "pyrofast-projects-"));
}

test("validación: acepta solo [a-zA-Z0-9_-], sin puntos ni rutas", () => {
  for (const ok of ["demo", "mi-app", "app_2", "A", "a".repeat(64)]) {
    assert.equal(isValidProjectName(ok), true, ok);
    assert.equal(validateProjectName(ok), ok);
  }
  const bad: unknown[] = [
    "",
    ".",
    "..",
    "../escape",
    "a/b",
    "a\\b",
    "/absoluto",
    "mi app",
    "a.b",
    "café",
    "a".repeat(65),
    null,
    undefined,
    123,
    {},
  ];
  for (const name of bad) {
    assert.equal(isValidProjectName(name), false, String(name));
    assert.throws(() => validateProjectName(name), /nombre de proyecto inválido/);
  }
});

test("projectRoot nunca escapa de la base", async () => {
  const base = await tmpBase();
  const root = projectRoot(base, "demo");
  assert.ok(root === base || root.startsWith(base + sep));
  assert.equal(root, join(base, "demo"));
  assert.throws(() => projectRoot(base, ".."), /nombre de proyecto inválido/);
  assert.throws(() => projectRoot(base, "/etc"), /nombre de proyecto inválido/);
});

test("listProjects: vacío, inexistente, solo directorios válidos, ordenado", async () => {
  const base = await tmpBase();
  assert.deepEqual(await listProjects(base), []);
  assert.deepEqual(await listProjects(join(base, "no-existe")), []);
  await mkdir(join(base, "zeta"));
  await mkdir(join(base, "alfa"));
  await writeFile(join(base, "suelto.txt"), "no es proyecto");
  await mkdir(join(base, "mal.nombre")); // directorio con nombre inválido: se ignora
  assert.deepEqual(await listProjects(base), ["alfa", "zeta"]);
});

test("createProject: crea, es idempotente y aparece en el listado", async () => {
  const base = await tmpBase();
  const first = await createProject(base, "mi-app");
  assert.deepEqual(first, { name: "mi-app", created: true, files: [] });
  const second = await createProject(base, "mi-app");
  assert.deepEqual(second, { name: "mi-app", created: false, files: [] });
  assert.deepEqual(await listProjects(base), ["mi-app"]);
  await assert.rejects(() => createProject(base, "../escape"), /nombre de proyecto inválido/);
  assert.deepEqual(await listProjects(base), ["mi-app"]);
});

test("createProject: rechaza si ya existe un archivo con ese nombre", async () => {
  const base = await tmpBase();
  await writeFile(join(base, "choque"), "archivo, no directorio");
  await assert.rejects(() => createProject(base, "choque"), /ya existe un archivo/);
});

test("createProject existente devuelve sus archivos actuales", async () => {
  const base = await tmpBase();
  await mkdir(join(base, "con-archivos"), { recursive: true });
  await writeFile(join(base, "con-archivos", "index.html"), "<h1>hola</h1>");
  const res = await createProject(base, "con-archivos");
  assert.equal(res.created, false);
  assert.deepEqual(res.files, ["index.html"]);
});
