import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyChatRateLimit,
  chatRateLimiter,
  createRateLimiter,
  getClientIp,
} from "../src/rate-limit.ts";

function mockRes() {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    status: 0,
    body: "",
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(status: number) {
      res.status = status;
    },
    end(body: string) {
      res.body = body;
    },
  };
  return res;
}

test("rate limit: bajo el límite pasa (30 req/min por defecto)", () => {
  const limiter = createRateLimiter();
  for (let i = 0; i < 30; i++) {
    const r = limiter.check("203.0.113.10");
    assert.equal(r.allowed, true, `request ${i + 1} debería pasar`);
  }
  assert.equal(limiter.check("203.0.113.10").allowed, false);
});

test("rate limit: sobre el límite devuelve 429 con Retry-After", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  const req = { headers: {}, socket: { remoteAddress: "203.0.113.20" } };
  for (let i = 0; i < 3; i++) assert.equal(applyChatRateLimit(req, mockRes(), limiter), true);
  const res = mockRes();
  assert.equal(applyChatRateLimit(req, res, limiter), false);
  assert.equal(res.status, 429);
  assert.equal(res.headers["retry-after"], "60");
  assert.equal(res.headers["content-type"], "application/json");
  const body = JSON.parse(res.body) as { error: string; retryAfterSeconds: number };
  assert.equal(body.retryAfterSeconds, 60);
  assert.match(body.error, /demasiadas peticiones/);
});

test("rate limit: IPs distintas no se afectan entre sí", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
  assert.equal(limiter.check("203.0.113.30").allowed, true);
  assert.equal(limiter.check("203.0.113.30").allowed, true);
  assert.equal(limiter.check("203.0.113.30").allowed, false);
  // Otra IP empieza su ventana desde cero.
  assert.equal(limiter.check("198.51.100.7").allowed, true);
  assert.equal(limiter.check("198.51.100.7").allowed, true);
  assert.equal(limiter.check("198.51.100.7").allowed, false);
});

test("rate limit: al vencer la ventana el contador se reinicia", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
  assert.equal(limiter.check("203.0.113.40", 10_000).allowed, true);
  assert.equal(limiter.check("203.0.113.40", 10_500).allowed, false);
  const reopened = limiter.check("203.0.113.40", 11_000);
  assert.equal(reopened.allowed, true);
  assert.equal(reopened.remaining, 0);
});

test("rate limit: getClientIp prefiere X-Forwarded-For y cae al socket", () => {
  assert.equal(
    getClientIp({ headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.1" }, socket: { remoteAddress: "10.0.0.2" } }),
    "203.0.113.50",
  );
  assert.equal(
    getClientIp({ headers: {}, socket: { remoteAddress: "203.0.113.51" } }),
    "203.0.113.51",
  );
  assert.equal(getClientIp({ headers: {} }), "unknown");
});

test("rate limit: el singleton por defecto es de 30 req/min", () => {
  chatRateLimiter.reset();
  for (let i = 0; i < 30; i++) assert.equal(chatRateLimiter.check("203.0.113.60").allowed, true);
  assert.equal(chatRateLimiter.check("203.0.113.60").allowed, false);
  chatRateLimiter.reset();
});
