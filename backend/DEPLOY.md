# Despliegue del backend de Pyrofast

Backend en TypeScript + Node 24, **sin build**: se ejecuta directo con
`node src/server.ts` gracias al type stripping de Node ≥ 22.6 (ver
`engines` en `package.json`). La imagen es `node:24` y solo instala
dependencias de producción (`npm ci --omit=dev`); `better-sqlite3`
trae binario precompilado, así que no hace falta toolchain de
compilación en la imagen.

## Variables de entorno

| Variable | Obligatoria | Qué es |
|---|---|---|
| `BETTER_AUTH_SECRET` | Sí, en producción | Secreto de Better Auth. Sin él, `src/auth.ts` avisa por consola y usa un secreto de desarrollo fijo: **nunca desplegar así**. Generar uno aleatorio largo y guardarlo solo en el host, nunca en el repo ni en la imagen. |
| `BETTER_AUTH_URL` | Sí | URL pública del backend, p. ej. `https://pyrofast-api.example.com`. Better Auth la usa como `baseURL` (`src/auth.ts`). |
| `PYROFAST_DB` | Recomendada | Ruta del SQLite. Si no se define, `src/auth.ts` usa `data/pyrofast.db` dentro del contenedor (efímera, ver abajo). Con volumen, p. ej. `/data/pyrofast.db`. |
| `PORT` | La inyecta el host | El servidor escucha en `process.env.PORT ?? 3000` (`src/server.ts`). No fijar un puerto propio: usar el que dé el host. |
| `PROJECTS_DIR` | Opcional | Dónde se guardan los proyectos generados. Por defecto `projects/` dentro del contenedor (efímero, igual que el SQLite). Con volumen, apuntarlo al volumen. |
| `NODE_ENV` | No | El Dockerfile ya fija `production`. |

Las llaves de los providers (OpenRouter, Groq, Gemini, Claude…)
**no** son variables de despliegue: el modelo es BYOK y cada request
de `/chat` trae su propia llave, que nunca se guarda en disco.

## Probar la imagen en local

```bash
docker build -t pyrofast-backend .
docker run --rm -p 3109:3109 \
  -e PORT=3109 \
  -e BETTER_AUTH_SECRET='un-secreto-largo-aleatorio' \
  -e BETTER_AUTH_URL='http://localhost:3109' \
  pyrofast-backend
curl http://localhost:3109/health   # -> {"ok":true}
curl http://localhost:3109/providers
```

Sin volumen, esa base y esos proyectos se pierden al parar el
contenedor. Eso es lo esperado en una prueba; en producción, ver la
sección siguiente.

## SQLite: efímero sin volumen, y el camino a Postgres

Hoy la autenticación vive en SQLite (`better-sqlite3` + Drizzle en
`src/auth.ts`, tablas creadas al arrancar). En cualquier host con
sistema de archivos efímero (el caso general: contenedores que se
recrean en cada deploy o reinicio), **sin volumen persistente se
pierden usuarios, sesiones y proyectos** en cada recreación.

- Con volumen: montar el volumen en una ruta (p. ej. `/data`) y fijar
  `PYROFAST_DB=/data/pyrofast.db` (y `PROJECTS_DIR=/data/projects` si
  se quieren persistir también los proyectos). La ruta del volumen y
  la variable tienen que coincidir; el volumen por sí solo, montado
  en otra ruta, no persiste nada.
- Sin volumen: solo sirve para pruebas o demos descartables. No
  anunciar cuentas como permanentes.

**Camino a Postgres/Supabase (pendiente, no hecho en este frente):**
migrar es cambiar el adapter en `src/auth.ts` (de `better-sqlite3` +
Drizzle SQLite a Drizzle Postgres + el adapter de Better Auth para
Postgres), sin cambiar la API de `/api/auth`. Hace falta el proyecto
Supabase de Pyrofast (hoy no existe) y cablear su conexión cuando se
cree. Hasta entonces, volumen o nada: no hay persistencia real sin él.

## El dominio de la web debe estar en los orígenes confiables

**Ojo, esto hoy NO se resuelve con una variable de entorno:**
`src/auth.ts` tiene `trustedOrigins` fijo en código:

```ts
trustedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"]
```

Antes de dar por bueno el login desde la web desplegada, hay que
añadir su dominio real a esa lista (cambio de código, fuera de este
frente de despliegue) y desplegar esa versión. Además:

- `BETTER_AUTH_URL` debe ser la URL pública del backend, no la de la
  web, y la web debe apuntar sus llamadas de auth a esa URL.
- El CORS de `src/server.ts` hoy solo devuelve credenciales para
  orígenes `localhost`/`127.0.0.1` en `/api/auth`; un origen
  desplegado también necesita ese ajuste para que la cookie de sesión
  funcione entre dominios. Verificar el login real desde la web
  desplegada antes de anunciar el backend como listo: `/health` en
  verde no prueba el login.

## Por host

Los tres sirven el mismo Dockerfile; lo que cambia es cómo se
declaran puerto, volumen y dominio. Verificar cada punto en el panel
del host en el momento de desplegar: los nombres exactos de las
opciones cambian con el tiempo.

### Railway

- Servicio desde el Dockerfile (detectar o elegir Dockerfile).
- Variables en el panel del servicio: `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL` (con el dominio que Railway asigne o el propio).
- `PORT` la inyecta Railway; no fijarla a mano.
- Volumen de Railway montado en `/data` + `PYROFAST_DB=/data/pyrofast.db`
  si se quiere persistencia; sin volumen, todo es efímero.
- Dominio: el generado por Railway o un dominio propio en su panel.
  Ese dominio de la **web** (no el del backend) es el que falta en
  `trustedOrigins` (ver arriba).

### Render

- Web Service desde el Dockerfile.
- Variables en el panel del servicio, igual que arriba; `PORT` la
  inyecta Render.
- Persistencia: solo con un disco persistente de Render montado en la
  ruta de `PYROFAST_DB` (y de `PROJECTS_DIR` si aplica). Sin disco,
  cada deploy o reinicio borra usuarios y proyectos.
- Health check del servicio: `GET /health`.

### Fly.io

- `fly launch` sin Dockerfile propio: Fly usa el `Dockerfile` del
  repo; la app se declara en `fly.toml`.
- Volumen: `fly volumes create` + sección `[[mounts]]` en `fly.toml`
  con `destination` igual a la ruta de `PYROFAST_DB` (p. ej. `/data`).
  Sin volumen, efímero como en los demás.
- Puerto: el servicio debe escuchar en el puerto que Fly expone; el
  backend ya respeta `$PORT`, así que `fly.toml` debe hacer coincidir
  su `internal_port` con el `PORT` efectivo (o dejar que Fly lo
  inyecte).
- Secretos con `fly secrets set BETTER_AUTH_SECRET=…`, nunca en
  `fly.toml` ni en la imagen.

## Checklist antes de anunciar el backend como desplegado

1. `GET /health` responde `{"ok":true}` en la URL pública.
2. `GET /providers` responde la lista sin llaves.
3. `BETTER_AUTH_SECRET` es un secreto real, distinto del de
   desarrollo, y no está en el repo ni en la imagen.
4. Volumen montado y `PYROFAST_DB` apuntando a él (o asumido y
   comunicado que es efímero).
5. Dominio de la web añadido a `trustedOrigins` y login real probado
   desde la web desplegada (registro → recarga → sesión persistente),
   no solo `/health`.
