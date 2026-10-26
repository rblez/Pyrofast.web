import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Auth de Pyrofast: Supabase Auth directo con llaves PUBLICABLES (anon/publishable).
// Estas llaves son públicas por diseño (van en el bundle del cliente) y NO son
// la contraseña de la base de datos: nunca va DATABASE_URL ni service_role aquí.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;

// BACKEND: URL del backend (en producción, Pages Functions en el mismo origen;
// en local, el defecto es http://localhost:3000). Si el backend configurado es
// loopback y la página NO es loopback (despliegue), se usa el mismo origen:
// el backend vive en el mismo dominio, no en un puerto 3000 público.
function resolveBackend(): string {
  const configured =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_BACKEND_URL ?? 'http://localhost:3000';
  if (typeof window === 'undefined') return configured;
  try {
    const u = new URL(configured);
    const isLoopback =
      u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (!isLoopback) return u.toString().replace(/\/$/, '');
    const pageHost = window.location.hostname;
    const pageLoopback =
      pageHost === 'localhost' || pageHost === '127.0.0.1' || pageHost === '[::1]';
    if (pageLoopback) {
      u.hostname = pageHost;
      return u.toString().replace(/\/$/, '');
    }
    return window.location.origin;
  } catch {
    return configured;
  }
}

export const BACKEND = resolveBackend();
