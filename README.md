# Pyrofast UI web

Webapp del agente de vibecoding: el usuario describe la app, el
backend (`pyrofast/backend`) genera el código y aquí se ve el preview.

## Pantallas (v1)

1. **Chat**: prompt del usuario + respuestas del agente + selector de
   provider (OpenRouter, Groq, Gemini, Claude) con campo para la llave
   (BYOK, guardada solo en el navegador del usuario).
2. **Preview**: iframe con la app generada, recargado en cada cambio.
3. **Archivos**: árbol del proyecto generado, con vista del código.

## Stack

SvelteKit + TypeScript, igual que el resto de Pyrofast. Habla con el
backend por `POST /chat` (ver `pyrofast/backend`).

## Estado

MVP local funcionando: chat + provider demo (sin llave) o BYOK
(OpenRouter, Groq, Gemini, Claude) + preview de la app generada +
code preview con Geist Mono. La UI usa Inter en todo. **Web en React
+ Vite (corrección de Ray 2026-10-26: React solo, fuera SvelteKit).**
**Interfaz estilo ChatGPT (Ray 2026-10-26)**: header con isotipo +
hamburguesa (sidebar de chats, perfil y ajustes abajo), mensajes con
copiar/editar/responder, input abajo y navbar inferior Chat/Preview/
Más/Perfil. **Preview como navegador estilo Bolt**: barra con atrás,
recargar, candado y URL `pyrofast.link/app/ID` aleatoria. Iconos:
Solar verbatim (de Tiendly) en principales, Lucide en extras.
Isotipo actual = rayo provisorio, pendiente el oficial.

```bash
# backend (puerto 3000)
cd ../pyrofast-backend && npm start
# webapp (puerto 5173)
npm install && npm run dev
```

## Marca

Ver `BRAND.md`: paleta gris / blanco / negro / naranja (del logo de
la org), botones naranjas (`#FF6A00`), fondo gris con ruido, icons
Solar (UI) + Lucide (complemento) + SimpleIcons (logos de marcas).

## Pantallas (v1)

Scaffold inicial: estructura y pantalla de chat de ejemplo en
`src/routes/+page.svelte`. Falta: conectar el backend real, preview en
vivo y deploy del proyecto.
