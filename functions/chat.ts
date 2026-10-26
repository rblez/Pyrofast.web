import { providerFor } from './_lib/presets.ts';
import { SYSTEM_PROMPT } from './_lib/system-prompt.ts';
import { DEMO_HTML } from './_lib/demo-html.ts';
import { putFile } from './_lib/store.ts';
import { supabaseEnv, verifyUser } from './_lib/auth.ts';
import { extractHtml } from './_lib/extract.ts';
import { checkRateLimit } from './_lib/ratelimit.ts';

// POST /chat — el backend del agente, dentro del mismo deploy de la web.
// Una sola llamada al modelo (sin loop de tools): el contrato de salida
// pide un único index.html y se extrae de la respuesta.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return json({ error: 'Demasiadas peticiones. Inténtalo en un minuto.' }, 429);
  }
  if (!supabaseEnv(env)) {
    return json({ error: 'Falta configurar Supabase en el servidor.' }, 500);
  }
  const userId = await verifyUser(request, env);
  if (!userId) {
    return json({ error: 'Inicia sesión para usar el chat.' }, 401);
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }
  const provider = body?.provider;
  const project = typeof body?.project === 'string' && body.project ? body.project : 'demo';
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (typeof provider !== 'string' || !provider) return json({ error: 'Falta provider.' }, 400);
  if (provider === 'demo') {
    putFile(userId, project, 'index.html', DEMO_HTML);
    putFile('__shared__', project, 'index.html', DEMO_HTML);
    return json({
      messages: [
        { role: 'assistant', content: 'Voy a crear tu app de ejemplo: una lista de tareas.' },
        { role: 'assistant', content: 'Listo, creé tu app de tareas. Puedes verla en el preview y revisar el código.' },
      ],
      files: ['index.html'],
    });
  }
  const apiKey = body?.apiKey;
  if (typeof apiKey !== 'string' || !apiKey) {
    return json({ error: 'Falta la llave del proveedor. Ponla en Perfil.' }, 400);
  }
  try {
    const p = providerFor(provider, apiKey, typeof body?.model === 'string' ? body.model : undefined);
    const res = await p.complete([
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
        .map((m: any) => ({ role: m.role, content: String(m.content ?? '') })),
    ], []);
    const html = extractHtml(res.message.content);
    if (!html) return json({ error: 'El modelo no devolvió un HTML. Inténtalo de nuevo.' }, 502);
    putFile(userId, project, 'index.html', html);
    putFile('__shared__', project, 'index.html', html);
    return json({
      messages: [{ role: 'assistant', content: 'Listo, creé tu app. Puedes verla en el preview y revisar el código.' }],
      files: ['index.html'],
    });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 502);
  }
}
