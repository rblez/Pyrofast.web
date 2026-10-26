import { createAuthClient } from "better-auth/react";

// URL del backend: en Pages se pone con VITE_BACKEND_URL al desplegar;
// en local, el defecto es http://localhost:3000.
//
// BUG QUE ESTO ARREGLA (verificado 2026-10-26 con navegador headless):
// la cookie de sesión de Better Auth es SameSite=Lax y sin Domain, así
// que solo persiste si la página y el backend son del MISMO SITIO. El
// cliente anterior apuntaba siempre a "localhost", de modo que abrir la
// web en http://127.0.0.1:5173 (o en una IP de red) la volvía cross-site
// respecto al backend: el registro devolvía 200 pero el navegador NO
// guardaba la cookie (volcado de cookies vacío), get-session devolvía
// null y la tarjeta de Cuenta nunca aparecía, ni tras recargar.
// Por eso, cuando el backend configurado es local (localhost /
// 127.0.0.1), se alinea su host con el host real de la página: la
// página en 127.0.0.1 habla con el backend en 127.0.0.1, y la página en
// localhost sigue hablando con localhost. Un backend con host público
// (despliegue) NO se toca: ahí el origen debe ser confiable en el
// backend (BETTER_AUTH_TRUSTED_ORIGINS) y el CORS debe reflejarlo.
function resolveBackend(): string {
  const configured =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_BACKEND_URL ?? "http://localhost:3000";
  if (typeof window === "undefined") return configured;
  try {
    const url = new URL(configured);
    const isLoopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (isLoopback) url.hostname = window.location.hostname;
    return url.toString().replace(/\/$/, "");
  } catch {
    return configured;
  }
}

export const BACKEND = resolveBackend();

export const authClient = createAuthClient({ baseURL: BACKEND });
