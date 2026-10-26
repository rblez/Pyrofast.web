# Pyrofast backend

API y loop del agente de vibecoding de Pyrofast: el Lovable / Replit /
Bolt open-source y gratis.

## Idea

El usuario describe la app que quiere, el agente escribe el código con
tools de archivos acotados al proyecto, y la UI (web o móvil) muestra
el preview. El backend no guarda llaves: cada request trae su propia
llave (BYOK). Así Pyrofast es gratis: el usuario usa los tiers gratis
de Groq o Gemini, o cualquier modelo barato de OpenRouter.

## Providers

| Preset | Base | Gratis |
|---|---|---|
| OpenRouter | `openrouter.ai/api/v1` | Modelos `:free` |
| Groq | `api.groq.com/openai/v1` | Tier gratis |
| Gemini | `generativelanguage.googleapis.com/v1beta/openai/` | Tier gratis de AI Studio |
| DeepSeek | `api.deepseek.com/v1` | Precios bajos |
| Claude | API nativa de Anthropic | De pago |
| OpenAI | `api.openai.com/v1` | De pago |

Cualquier API OpenAI-compatible funciona con su baseURL: el preset es
solo un atajo. Ver `src/providers/presets.ts`.

## API

- `GET /health` → `{ ok: true }`
- `GET /providers` → presets (sin llaves)
- `POST /chat` → `{ provider, apiKey, model?, projectRoot?, messages }`
  → loop del agente con tools de archivos, devuelve mensajes finales.

## Correr

```bash
npm test          # tests sin llaves (servidores falsos locales)
PORT=3000 npm start
```

## Seguridad

- Tools de archivos acotados a la raíz del proyecto: `../` y rutas
  absolutas se rechazan.
- La llave del usuario vive solo en el request, nunca en disco.
- El sandbox de ejecución y el deploy del preview son el siguiente
  paso (ver roadmap): es la parte difícil, no el modelo.

## Roadmap

- Sandbox de ejecución para correr/previsualizar el código generado.
- Deploy del preview en la misma web: primero `pyrofast.pages.dev`
  (Cloudflare Pages); si hace falta, `pyrofast.com` y `pyrofast.link`
  (disponibles); `.dev` y `.ai` disponibles pero caros.
- Sesiones persistentes (Supabase).
- Streaming de respuestas.
