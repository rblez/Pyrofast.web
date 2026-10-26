import { extname } from "node:path";

/**
 * Headers y MIME del preview (GET /preview/:name/*).
 *
 * El preview sirve HTML generado por el usuario dentro de un iframe de la
 * propia web, pero en OTRO origen que la web (otro puerto/dominio). Por eso:
 *
 * - X-Content-Type-Options: nosniff SIEMPRE: impide que el navegador
 *   reinterprete un archivo (p. ej. un .txt o .json subido por el agente)
 *   como HTML/JS ejecutable. Sin esto, el fallback octet-stream no basta.
 * - Content-Security-Policy: sandbox allow-scripts SOLO en documentos
 *   (.html/.htm/.svg/.xml): el JS de la app generada sigue corriendo
 *   (incluye scripts inline y CDN como Tailwind, porque no se restringe
 *   ningún *-src), pero el documento queda con origen opaco: SIN
 *   allow-same-origin no puede leer la sesión de Better Auth ni llamar a
 *   /api/auth con las cookies del usuario, no puede navegar el top frame
 *   ni abrir popups. Añadir allow-same-origin anularía este aislamiento
 *   (script + mismo origen = acceso total al origen del backend).
 *   Contrapartida conocida: apps que usen localStorage/sessionStorage
 *   fallarán en origen opaco; la app demo no los usa. El arreglo de fondo
 *   es servir el preview desde un origen distinto al de la API.
 * - NO se pone X-Frame-Options ni frame-ancestors: SAMEORIGIN/'self'
 *   rompería el embed porque la web vive en otro origen que el backend.
 *   El frame-ancestors con los orígenes de la web se añade cuando el
 *   despliegue fije esos orígenes (ver PENDIENTES en el informe).
 * - Referrer-Policy: no-referrer: la app generada no filtra el nombre
 *   del proyecto en el Referer al cargar recursos externos.
 * - Cache-Control: no-store: cada corrida del agente reescribe archivos;
 *   un preview cacheado mostraría la versión vieja tras editar.
 */

// Tipos IANA (https://www.iana.org/assignments/media-types/). Los charset
// en tipos de texto evitan que el navegador adivine la codificación.
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/vnd.microsoft.icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

// Tipos que pueden ejecutar script si se navegan directamente como
// documento (un SVG con <script> navegado fuera de <img> corre en el
// origen del backend). El resto (png, fuentes, ...) ignora la CSP.
const DOCUMENT_EXTS = new Set([".html", ".htm", ".svg", ".xml"]);

export function mimeFor(filename: string): string {
  return MIME[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

export function previewHeaders(filename: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": mimeFor(filename),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };
  if (DOCUMENT_EXTS.has(extname(filename).toLowerCase())) {
    headers["Content-Security-Policy"] = "sandbox allow-scripts";
  }
  return headers;
}
