import { resolve, sep, relative, dirname } from "node:path";
import { readFile, writeFile, readdir, mkdir, stat, realpath } from "node:fs/promises";
import type { Tool } from "../types.ts";

/**
 * Límite de tamaño para lectura y escritura (1 MiB).
 *
 * Justificación: el agente genera apps de HTML + Tailwind + JS, que
 * rara vez superan algunas decenas de KB; 1 MiB deja un margen de
 * más de 10x para el archivo más grande razonable y a la vez evita
 * dos problemas reales: (1) que un `read_file` inunde el contexto
 * del modelo (y la factura) con megabytes de texto, y (2) que un
 * `write_file` en bucle llene el disco del servidor. El chequeo de
 * lectura se hace con `stat` antes de cargar el archivo en memoria,
 * así que un archivo gigante se rechaza sin leerlo.
 */
export const MAX_FILE_BYTES = 1024 * 1024;

/** Un byte NUL delata contenido binario: ningún archivo de texto lo tiene. */
function assertText(buffer: Buffer, p: string): void {
  if (buffer.includes(0)) {
    throw new Error(`contenido binario no permitido: ${p}`);
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error(`contenido binario no permitido: ${p}`);
  }
}

/**
 * Tools de archivos acotados a la raíz del proyecto: cualquier ruta que
 * escape de la raíz (../, rutas absolutas fuera, symlinks que apunten
 * fuera) se rechaza. El agente solo toca el proyecto del usuario,
 * nunca el sistema.
 */
export function fileTools(root: string): Tool[] {
  const base = root.replace(/[/\\]+$/, "") || sep;
  const safe = async (p: string): Promise<string> => {
    if (p.includes("\0")) {
      throw new Error(`ruta inválida: ${p}`);
    }
    // 1) Chequeo léxico: resolve() colapsa ".." y rutas absolutas.
    const full = resolve(base, p);
    if (full !== base && !full.startsWith(base + sep)) {
      throw new Error(`ruta fuera del proyecto: ${p}`);
    }
    // 2) Chequeo real: un symlink dentro del proyecto podría apuntar
    // fuera (resolve no lo ve). Se resuelve el ancestro existente más
    // cercano y se recompone el resto de la ruta.
    let realRoot: string;
    try {
      realRoot = await realpath(base);
    } catch {
      realRoot = full === base ? base : resolve(base);
    }
    let cursor = full;
    const tail: string[] = [];
    while (true) {
      try {
        const realCursor = await realpath(cursor);
        const realFull = tail.length > 0 ? resolve(realCursor, ...tail) : realCursor;
        if (realFull !== realRoot && !realFull.startsWith(realRoot + sep)) {
          throw new Error(`ruta fuera del proyecto: ${p}`);
        }
        return full;
      } catch (e) {
        if (e instanceof Error && /fuera del proyecto/.test(e.message)) throw e;
        // No existe todavía (caso write_file): subir un nivel y reintentar.
        const parent = dirname(cursor);
        if (parent === cursor) return full;
        tail.unshift(relative(parent, cursor));
        cursor = parent;
      }
    }
  };
  return [
    {
      name: "list_files",
      description: "Lista archivos de un directorio del proyecto (relativo a la raíz).",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      run: async (args) => {
        const dir = await safe(String(args.path ?? "."));
        return (await readdir(dir, { withFileTypes: true }))
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
          .join("\n");
      },
    },
    {
      name: "read_file",
      description: "Lee un archivo del proyecto.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      run: async (args) => {
        const full = await safe(String(args.path));
        const info = await stat(full);
        if (info.size > MAX_FILE_BYTES) {
          throw new Error(
            `archivo demasiado grande: ${args.path} (${info.size} bytes, límite ${MAX_FILE_BYTES})`,
          );
        }
        const buffer = await readFile(full);
        assertText(buffer, String(args.path));
        return buffer.toString("utf-8");
      },
    },
    {
      name: "write_file",
      description: "Escribe (o crea) un archivo del proyecto, creando directorios si hace falta.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
      run: async (args) => {
        if (typeof args.path !== "string" || args.path.length === 0) {
          throw new Error("write_file requiere path");
        }
        if (typeof args.content !== "string") {
          throw new Error(`write_file requiere content: ${args.path}`);
        }
        const full = await safe(args.path);
        const content = args.content;
        if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) {
          throw new Error(
            `archivo demasiado grande: ${args.path} (límite ${MAX_FILE_BYTES} bytes)`,
          );
        }
        if (content.includes("\0")) {
          throw new Error(`contenido binario no permitido: ${args.path}`);
        }
        await mkdir(resolve(full, ".."), { recursive: true });
        await writeFile(full, content);
        return `escrito: ${args.path}`;
      },
    },
  ];
}
