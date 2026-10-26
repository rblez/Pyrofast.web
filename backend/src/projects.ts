import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Proyectos multi-proyecto (listar / crear).
 *
 * Hoy la web usa el proyecto hardcodeado 'demo' y el servidor ya sirve
 * /projects/:name/files, /projects/:name/code y /preview/:name/*. Este
 * módulo añade lo que falta (listar y crear) SIN tocar el servidor: el
 * cableado de rutas va como parche en el informe de entrega.
 *
 * Higiene de nombres: la misma que el backend ya usa (solo [a-zA-Z0-9_-]).
 * A diferencia del /chat actual —que SANEABA en silencio con
 * replace(/[^a-zA-Z0-9_-]/g, "") y podía crear un proyecto distinto del
 * pedido—, crear VALIDA en estricto y rechaza: un nombre inválido nunca
 * debe crear silenciosamente otro proyecto.
 */

const NAME_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_NAME_LENGTH = 64;

/** True si el nombre puede usarse tal cual como nombre de directorio. */
export function isValidProjectName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length >= 1 &&
    name.length <= MAX_NAME_LENGTH &&
    NAME_RE.test(name)
  );
}

/**
 * Valida un nombre o lanza Error("nombre de proyecto inválido: ...").
 * El prefijo del mensaje es el contrato con el servidor: el handler de
 * POST /projects lo mapea a 400 (ver parche en el informe).
 */
export function validateProjectName(name: unknown): string {
  if (!isValidProjectName(name)) {
    throw new Error(`nombre de proyecto inválido: ${String(name)}`);
  }
  return name;
}

/**
 * Ruta del proyecto dentro de PROJECTS_DIR. Nunca escapa de la base:
 * un nombre válido no contiene `/`, `\`, `.` ni puede ser absoluto.
 */
export function projectRoot(projectsDir: string, name: unknown): string {
  return join(projectsDir, validateProjectName(name));
}

async function listFilesRecursive(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFilesRecursive(join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

/**
 * Lista los proyectos: solo directorios con nombre válido, ordenados.
 * Un PROJECTS_DIR inexistente devuelve [] (no es error: aún no hay
 * proyectos). Archivos sueltos y directorios con nombres inválidos se
 * ignoran: nunca se anuncia un nombre que las rutas no puedan servir.
 */
export async function listProjects(projectsDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && isValidProjectName(e.name))
    .map((e) => e.name)
    .sort();
}

export interface CreatedProject {
  name: string;
  /** true si el directorio se creó ahora; false si ya existía. */
  created: boolean;
  /** Archivos actuales del proyecto (recursivo, relativo a su raíz). */
  files: string[];
}

/**
 * Crea un proyecto (solo su directorio, sin contenido inicial: el
 * agente lo puebla vía /chat). Idempotente: si ya existe, devuelve
 * created: false con sus archivos actuales en vez de fallar, para que
 * reintentos no rompan la UI. Lanza si el nombre es inválido o si en
 * esa ruta ya existe algo que NO es un directorio.
 */
export async function createProject(
  projectsDir: string,
  name: unknown,
): Promise<CreatedProject> {
  const valid = validateProjectName(name);
  const root = join(projectsDir, valid);
  let existing;
  try {
    existing = await stat(root);
  } catch {
    existing = undefined;
  }
  if (existing) {
    if (!existing.isDirectory()) {
      throw new Error(`ya existe un archivo con ese nombre: ${valid}`);
    }
    return { name: valid, created: false, files: await listFilesRecursive(root) };
  }
  await mkdir(root, { recursive: true });
  return { name: valid, created: true, files: [] };
}
