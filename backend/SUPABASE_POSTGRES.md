# Migración de Better Auth a Supabase Postgres

Estado: **solo docs/SQL**. No se ejecutó nada contra el Supabase live
(la contraseña de BD no está guardada; resetearla es acción de Ray en
el dashboard). `src/auth.ts` y `src/auth-schema.ts` quedan **intactos**:
el cambio de adapter se aplica en un paso posterior, cuando Ray lo autorice.

## 1. Qué hay ya hecho

- `supabase/migrations/0001_better_auth.sql`: las 4 tablas de Better Auth
  (`user`, `session`, `account`, `verification`) en Postgres, espejo 1:1
  de `src/auth-schema.ts`.
- Mapa de tipos SQLite → Postgres aplicado en la migración:

  | SQLite (drizzle) | Postgres |
  |---|---|
  | `text` | `text` |
  | `integer` con `mode: "boolean"` | `boolean` |
  | `integer` con `mode: "timestamp"` | `timestamp` |

- Nombres de tabla y columna **idénticos** (snake_case, p. ej.
  `email_verified`, `access_token_expires_at`). `"user"` y `"session"`
  van entrecomilladas porque son palabras reservadas en Postgres.
- Restricciones preservadas: PK en `id` en las 4 tablas, `UNIQUE` en
  `user.email` y `session.token`, FK `session.user_id` y
  `account.user_id` → `user.id` con `ON DELETE CASCADE`, `NOT NULL`
  exactamente donde el esquema SQLite lo tiene (incluidas las columnas
  de expiración de token de `account`, que en SQLite son anulables).
- Índices extra (además de los que crean los UNIQUE): `session.user_id`,
  `session.expires_at`, `account.user_id`, `verification.identifier`,
  `verification.expires_at`.

## 2. Aplicar la migración (pendiente, acción de Ray)

1. Resetear la contraseña de BD en el dashboard de Supabase
   (Project Settings → Database → Reset database password).
2. Ejecutar `supabase/migrations/0001_better_auth.sql` una vez en el
   SQL editor del proyecto Pyrofast (o con `psql` contra el pooler).
   Es idempotente (`IF NOT EXISTS` en tablas e índices), así que
   re-ejecutarla no rompe nada.
3. Proyecto de referencia (solo contexto, no usado para conectar):
   Pyrofast, id `fgjgrhsmofdhvopdrnva`, región `us-west-1`, plan free.

## 3. Cambio de adapter en `src/auth.ts` (SIN aplicar todavía)

Cuando se haga el cambio, en `src/auth.ts`:

1. **Dependencias** (instalar entonces, no ahora): `pg` (cliente
   node-postgres) — `drizzle-orm` ya es dependencia del backend, y su
   driver `drizzle-orm/node-postgres` viene dentro del paquete.
   `better-sqlite3` deja de usarse en este archivo.
2. **Nuevo esquema Drizzle para Postgres** (archivo nuevo, p. ej.
   `src/auth-schema-pg.ts`, sin tocar `src/auth-schema.ts`): las mismas
   4 tablas con `pgTable` de `drizzle-orm/pg-core`, `text()`,
   `boolean()` y `timestamp()` — mismos nombres de tabla y columna.
3. **Conexión**: sustituir el bloque SQLite (`new Database(DB_PATH)`,
   `mkdirSync`, y el `sqlite.exec(...)` con los `CREATE TABLE`) por:
   ```ts
   import { Pool } from "pg";
   import { drizzle } from "drizzle-orm/node-postgres";
   import * as schema from "./auth-schema-pg.ts";

   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
   export const db = drizzle(pool, { schema });
   ```
   El bloque `CREATE TABLE` desaparece del código: el esquema vive en
   la migración SQL de Supabase, no en el arranque del servidor.
4. **Adapter**: una sola línea cambia de valor:
   ```ts
   database: drizzleAdapter(db, { provider: "pg", schema }),
   ```
   (hoy: `provider: "sqlite"`).
5. **Sin tocar**: `baseURL`, `basePath: "/api/auth"`,
   `emailAndPassword: { enabled: true }`, `trustedOrigins` y el manejo
   de `BETTER_AUTH_SECRET`. El cambio de adapter **no cambia la API
   `/api/auth/*`**: registro, login, sesión y logout se comportan igual;
   solo cambia dónde se guardan las filas.

## 4. Variables y conexión

- `DATABASE_URL`: cadena de conexión del **pooler de Supabase**
  (Project Settings → Database → Connection string, modo pooler,
  puerto 6543), con la contraseña reseteada por Ray. Va por variable
  de entorno / secreto del hosting, **nunca en el repo ni en el código**.
  El pooler es la vía recomendada para un backend con conexiones
  cortas (serverless o con muchos arranques); la conexión directa
  (puerto 5432) queda como alternativa si el pooler da problemas con
  transacciones.
- Seguirán vigentes: `BETTER_AUTH_SECRET` (secreto de sesión, distinto
  de la contraseña de BD) y `BETTER_AUTH_URL` (URL pública del backend).
- `PYROFAST_DB` (ruta del SQLite local) deja de tener efecto en cuanto
  se aplique el cambio de adapter.

## 5. Datos: arranque limpio

- **Los datos del SQLite local (`data/pyrofast.db`) no migran solos.**
  Al cambiar de adapter, Supabase arranca vacío: los usuarios
  registrados en local tendrán que registrarse de nuevo.
- Si hiciera falta conservarlos, la vía es una exportación manual
  (volcar `user`/`session`/`account`/`verification` de SQLite y
  reinsertarlas en Postgres convirtiendo los enteros de fecha a
  `timestamp` y los `0/1` de `email_verified` a `boolean`), **antes**
  de poner el backend en producción contra Supabase. No está hecha
  ni pedida en este frente; hoy el único usuario real es de pruebas
  locales, así que el arranque limpio es lo esperado.
- Las contraseñas viven hasheadas en `account.password` y el secreto
  de sesión cambia de entorno: las sesiones locales existentes no
  sobreviven al cambio aunque se exportaran las filas (el secreto y
  la base son otros).

## 6. Verificación pendiente (tras aplicar el cambio)

1. Migración aplicada sin errores en el SQL editor de Supabase.
2. Backend arrancando con `DATABASE_URL` y `BETTER_AUTH_SECRET`.
3. `npm test` en verde (los tests de auth actuales usan SQLite local;
   al cambiar el adapter habrá que decidir si se adaptan a Postgres
   o se mantienen contra SQLite como suite local).
4. Flujo completo contra el backend con Postgres: registro → sesión
   persistente tras recargar → logout → sesión null.
