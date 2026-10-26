import test from "node:test";
import assert from "node:assert/strict";
import { mimeFor, previewHeaders } from "../src/preview.ts";

test("preview: MIME original intacto y con charset en texto", () => {
  assert.equal(mimeFor("index.html"), "text/html; charset=utf-8");
  assert.equal(mimeFor("app.js"), "text/javascript; charset=utf-8");
  assert.equal(mimeFor("estilo.css"), "text/css; charset=utf-8");
  assert.equal(mimeFor("datos.json"), "application/json; charset=utf-8");
  assert.equal(mimeFor("foto.png"), "image/png");
  assert.equal(mimeFor("foto.jpg"), "image/jpeg");
  assert.equal(mimeFor("dibujo.svg"), "image/svg+xml");
});

test("preview: alias y tipos nuevos (antes caían a octet-stream)", () => {
  assert.equal(mimeFor("foto.jpeg"), "image/jpeg");
  assert.equal(mimeFor("pagina.htm"), "text/html; charset=utf-8");
  assert.equal(mimeFor("modulo.mjs"), "text/javascript; charset=utf-8");
  assert.equal(mimeFor("foto.webp"), "image/webp");
  assert.equal(mimeFor("foto.avif"), "image/avif");
  assert.equal(mimeFor("anim.gif"), "image/gif");
  assert.equal(mimeFor("favicon.ico"), "image/vnd.microsoft.icon");
  assert.equal(mimeFor("nota.txt"), "text/plain; charset=utf-8");
  assert.equal(mimeFor("fuente.woff2"), "font/woff2");
  assert.equal(mimeFor("fuente.woff"), "font/woff");
  assert.equal(mimeFor("fuente.ttf"), "font/ttf");
  assert.equal(mimeFor("app.js.map"), "application/json; charset=utf-8");
});

test("preview: extensión insensible a mayúsculas y fallback seguro", () => {
  assert.equal(mimeFor("INDEX.HTML"), "text/html; charset=utf-8");
  assert.equal(mimeFor("FOTO.PNG"), "image/png");
  assert.equal(mimeFor("cosa.rara"), "application/octet-stream");
  assert.equal(mimeFor("sin-extension"), "application/octet-stream");
});

test("preview: headers comunes en todo archivo", () => {
  const h = previewHeaders("foto.png");
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["Referrer-Policy"], "no-referrer");
  assert.equal(h["Cache-Control"], "no-store");
  assert.equal(h["Content-Type"], "image/png");
  assert.equal(h["Content-Security-Policy"], undefined);
});

test("preview: CSP sandbox allow-scripts solo en documentos, sin allow-same-origin", () => {
  for (const f of ["index.html", "pagina.htm", "dibujo.svg", "feed.xml"]) {
    const h = previewHeaders(f);
    assert.equal(h["Content-Security-Policy"], "sandbox allow-scripts", f);
    assert.ok(!h["Content-Security-Policy"]!.includes("allow-same-origin"), f);
  }
  for (const f of ["app.js", "estilo.css", "fuente.woff2"]) {
    assert.equal(previewHeaders(f)["Content-Security-Policy"], undefined, f);
  }
});
