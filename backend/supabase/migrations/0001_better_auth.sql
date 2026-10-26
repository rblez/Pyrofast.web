-- Migración 0001: esquema Better Auth para Postgres (Supabase).
--
-- Proyecto: Pyrofast (id fgjgrhsmofdhvopdrnva, us-west-1, plan free).
-- Espejo 1:1 de src/auth-schema.ts (SQLite) con tipos Postgres:
--   integer { mode: "boolean" }   -> boolean
--   integer { mode: "timestamp" } -> timestamp
--   text                          -> text
-- Nombres de tabla y de columna idénticos (snake_case) para que el
-- cambio de adapter no cambie la API /api/auth/* ni el código que
-- consume el esquema.
--
-- CÓMO APLICARLA (acción de Ray, no de este frente):
--   1. Resetear la contraseña de BD en el dashboard de Supabase
--      (no está guardada en ningún lado).
--   2. Ejecutarla UNA vez en el SQL editor del proyecto Pyrofast
--      (o con psql contra el pooler). Las tablas "user" y "session"
--      son palabras reservadas en Postgres: van entrecomilladas.
-- NO se ejecutó nada contra el Supabase live para crear este archivo.

CREATE TABLE IF NOT EXISTS "user" (
  "id"             text PRIMARY KEY,
  "name"           text NOT NULL,
  "email"          text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL,
  "image"          text,
  "created_at"     timestamp NOT NULL,
  "updated_at"     timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"         text PRIMARY KEY,
  "user_id"    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "token"      text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                        text PRIMARY KEY,
  "user_id"                   text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "account_id"                text NOT NULL,
  "provider_id"               text NOT NULL,
  "access_token"              text,
  "refresh_token"             text,
  "access_token_expires_at"   timestamp,
  "refresh_token_expires_at"  timestamp,
  "scope"                     text,
  "id_token"                  text,
  "password"                  text,
  "created_at"                timestamp NOT NULL,
  "updated_at"                timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

-- Índices de consulta/limpieza (además de los UNIQUE ya declarados
-- en email y token, que crean su propio índice):
--   session.user_id    -> get-session por usuario
--   session.expires_at -> expiración/limpieza de sesiones
--   account.user_id    -> cuentas por usuario
--   verification.identifier -> verificación por identificador
--   verification.expires_at -> limpieza de verificaciones vencidas
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");
CREATE INDEX IF NOT EXISTS "session_expires_at_idx" ON "session" ("expires_at");
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX IF NOT EXISTS "verification_expires_at_idx" ON "verification" ("expires_at");
