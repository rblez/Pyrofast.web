import { getSharedFile } from '../../_lib/store.ts';

// GET /preview/:name/:file — el preview del último generado (sin sesión:
// el iframe no puede mandar el token; el aislamiento por usuario llega
// con almacenamiento persistente, fuera de este MVP).
export async function onRequestGet(context: any): Promise<Response> {
  const content = getSharedFile(context.params.name, context.params.file);
  if (content === null) return new Response('Sin preview todavía', { status: 404 });
  return new Response(content, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
