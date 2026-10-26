import { getFile } from '../../_lib/store.ts';
import { verifyUser } from '../../_lib/auth.ts';

// GET /projects/:name/code?path= — el código del usuario (exige sesión).
export async function onRequestGet(context: any): Promise<Response> {
  const userId = await verifyUser(context.request, context.env);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Inicia sesión.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const path = new URL(context.request.url).searchParams.get('path') || 'index.html';
  const content = getFile(userId, context.params.name, path);
  if (content === null) return new Response('No encontrado', { status: 404 });
  return new Response(content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
