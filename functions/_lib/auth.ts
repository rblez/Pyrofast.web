// Verifica el token de Supabase Auth contra /auth/v1/user.
// Lee las mismas variables que ya usa la web (VITE_*) o sus equivalentes sin prefijo.
export function supabaseEnv(env: any): { url: string; anon: string } | null {
  const url = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL;
  const anon = env?.VITE_SUPABASE_ANON_KEY || env?.SUPABASE_ANON_KEY;
  return url && anon ? { url: String(url).replace(/\/+$/, ''), anon: String(anon) } : null;
}
export async function verifyUser(request: Request, env: any): Promise<string | null> {
  const cfg = supabaseEnv(env);
  if (!cfg) return null;
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const res = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.anon, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return typeof data?.id === 'string' ? data.id : null;
  } catch {
    return null;
  }
}
