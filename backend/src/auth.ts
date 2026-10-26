import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "./auth-schema.ts";

// Base de datos local (SQLite). Hoy el proyecto Supabase de Pyrofast no
// existe (token sin alcance de org), así que la sesión vive aquí; migrar
// a Postgres/Supabase después es cambiar el adapter, no la API de auth.
export const DB_PATH = process.env.PYROFAST_DB ?? join(process.cwd(), "data", "pyrofast.db");
mkdirSync(dirname(DB_PATH), { recursive: true });
const sqlite = new Database(DB_PATH);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE,
    "email_verified" INTEGER NOT NULL, "image" TEXT,
    "created_at" INTEGER NOT NULL, "updated_at" INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL REFERENCES "user"("id"),
    "token" TEXT NOT NULL UNIQUE, "expires_at" INTEGER NOT NULL,
    "ip_address" TEXT, "user_agent" TEXT,
    "created_at" INTEGER NOT NULL, "updated_at" INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "account" (
    "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL REFERENCES "user"("id"),
    "account_id" TEXT NOT NULL, "provider_id" TEXT NOT NULL,
    "access_token" TEXT, "refresh_token" TEXT,
    "access_token_expires_at" INTEGER, "refresh_token_expires_at" INTEGER,
    "scope" TEXT, "id_token" TEXT, "password" TEXT,
    "created_at" INTEGER NOT NULL, "updated_at" INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT PRIMARY KEY, "identifier" TEXT NOT NULL, "value" TEXT NOT NULL,
    "expires_at" INTEGER NOT NULL, "created_at" INTEGER NOT NULL, "updated_at" INTEGER NOT NULL
  );
`);
export const db = drizzle(sqlite, { schema });

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  console.warn("[auth] BETTER_AUTH_SECRET no definido: usando secreto de desarrollo (no usar en producción).");
}

// Orígenes confiables: los de defecto (dev local) más los que se añadan
// por env, separados por coma. Sin esto, un origen distinto (otro puerto
// de vite en pruebas, o el dominio desplegado) da 403 "Invalid origin"
// en Better Auth aunque el CORS del servidor lo acepte.
const extraTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
export const TRUSTED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://pyrofast.rblez.com",
  ...extraTrustedOrigins,
];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  basePath: "/api/auth",
  secret: secret ?? "pyrofast-dev-secret-cambiar-en-produccion",
  trustedOrigins: TRUSTED_ORIGINS,
  emailAndPassword: { enabled: true },
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
});
