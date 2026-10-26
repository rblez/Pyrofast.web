import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { providerFor, PRESETS } from "./providers/presets.ts";
import { demoProvider } from "./providers/demo.ts";
import { runAgent } from "./runner.ts";
import { fileTools } from "./tools/files.ts";
import type { ChatMessage } from "./types.ts";
import { auth, TRUSTED_ORIGINS } from "./auth.ts";
import { previewHeaders } from "./preview.ts";
import { listProjects, createProject } from "./projects.ts";
import { applyChatRateLimit } from "./rate-limit.ts";

const PROJECTS_DIR = process.env.PROJECTS_DIR ?? join(process.cwd(), "projects");


function safePath(base: string, rel: string): string {
  const full = resolve(base, rel);
  if (full !== base && !full.startsWith(base + sep)) throw new Error("ruta fuera del proyecto");
  return full;
}

async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

/**
 * API del MVP (núcleo sin dependencias, solo node:http; auth con Better Auth):
 * - /api/auth/* → Better Auth (registro, login, sesión, logout por email+contraseña)
 * - GET /health
 * - GET /providers (presets + demo)
 * - POST /chat { provider, apiKey?, model?, project?, messages }
 *   provider "demo" no necesita llave. La llave llega por request (BYOK).
 * - GET /projects → { projects: string[] } (lista de proyectos)
 * - POST /projects { name } → { name, created, files } (201 si se creó, 200 si ya existía)
 * - GET /projects/:name/files → lista de archivos del proyecto
 * - GET /projects/:name/code?path=... → contenido de un archivo
 * - GET /preview/:name/* → sirve los archivos del proyecto (el preview)
 */
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const isAuth = url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/");
  const reqOrigin = req.headers.origin;
  const trustedOrigin = reqOrigin && (TRUSTED_ORIGINS.includes(reqOrigin) || reqOrigin.includes("localhost") || reqOrigin.includes("127.0.0.1")) ? reqOrigin : undefined;
  res.setHeader("Access-Control-Allow-Origin", trustedOrigin && isAuth ? trustedOrigin : "*");
  if (trustedOrigin && isAuth) res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    if (isAuth) {
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      }
      const request = new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
        method: req.method, headers, body,
      });
      const response = await auth.handler(request);
      const outHeaders: Record<string, string | string[]> = {};
      response.headers.forEach((v, k) => { if (k.toLowerCase() !== "set-cookie") outHeaders[k] = v; });
      const setCookie = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
      if (setCookie.length) outHeaders["set-cookie"] = setCookie;
      res.writeHead(response.status, outHeaders);
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/providers") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify([
        { id: "demo", label: "Demo (sin llave)", defaultModel: "demo", freeTier: "Sin llave, app de ejemplo" },
        ...PRESETS.map(({ id, label, defaultModel, freeTier }) => ({ id, label, defaultModel, freeTier })),
      ]));
      return;
    }
    if (req.method === "POST" && url.pathname === "/chat") {
      if (!applyChatRateLimit(req, res)) return;
      const body = JSON.parse(await readBody(req)) as {
        provider: string;
        apiKey?: string;
        model?: string;
        project?: string;
        messages: ChatMessage[];
      };
      if (!body.provider || !Array.isArray(body.messages)) {
        res.setHeader("Content-Type", "application/json");
        res.writeHead(400);
        res.end(JSON.stringify({ error: "faltan provider o messages" }));
        return;
      }
      const project = (body.project ?? "demo").replace(/[^a-zA-Z0-9_-]/g, "");
      const root = join(PROJECTS_DIR, project);
      await mkdir(root, { recursive: true });
      const provider = body.provider === "demo"
        ? demoProvider()
        : providerFor(body.provider, body.apiKey ?? "", body.model);
      const result = await runAgent({ provider, tools: fileTools(root), messages: body.messages });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ messages: result.messages, steps: result.steps, finishReason: result.finishReason, files: await listFiles(root) }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/projects") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ projects: await listProjects(PROJECTS_DIR) }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/projects") {
      const body = JSON.parse(await readBody(req)) as { name?: unknown };
      try {
        const created = await createProject(PROJECTS_DIR, body.name);
        res.setHeader("Content-Type", "application/json");
        res.writeHead(created.created ? 201 : 200);
        res.end(JSON.stringify(created));
      } catch (e) {
        res.setHeader("Content-Type", "application/json");
        if (e instanceof Error && e.message.startsWith("nombre de proyecto inválido")) {
          res.writeHead(400);
        } else if (e instanceof Error && e.message.startsWith("ya existe un archivo")) {
          res.writeHead(409);
        } else {
          throw e;
        }
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }
    const filesMatch = url.pathname.match(/^\/projects\/([^/]+)\/files$/);
    if (req.method === "GET" && filesMatch) {
      const root = join(PROJECTS_DIR, filesMatch[1]);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ files: await listFiles(root) }));
      return;
    }
    const codeMatch = url.pathname.match(/^\/projects\/([^/]+)\/code$/);
    if (req.method === "GET" && codeMatch) {
      const root = join(PROJECTS_DIR, codeMatch[1]);
      const content = await readFile(safePath(root, url.searchParams.get("path") ?? ""), "utf-8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(content);
      return;
    }
    const previewMatch = url.pathname.match(/^\/preview\/([^/]+)\/(.*)$/);
    if (req.method === "GET" && previewMatch) {
      const root = join(PROJECTS_DIR, previewMatch[1]);
      const rel = previewMatch[2] || "index.html";
      const file = safePath(root, rel);
      const body = await readFile(file);
      for (const [k, v] of Object.entries(previewHeaders(file))) res.setHeader(k, v);
      res.end(body);
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.writeHead(404);
    res.end(JSON.stringify({ error: "no encontrado" }));
  } catch (e) {
    const code = e instanceof Error && /fuera del proyecto|ENOENT/.test(e.message) ? 404 : 500;
    res.setHeader("Content-Type", "application/json");
    res.writeHead(code);
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Pyrofast backend en http://127.0.0.1:${port}`));
