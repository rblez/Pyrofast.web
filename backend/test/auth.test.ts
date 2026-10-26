import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("better auth: registro, login y contraseña incorrecta", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pyrofast-auth-"));
  process.env.PYROFAST_DB = join(dir, "test.db");
  process.env.BETTER_AUTH_SECRET = "test-secret-solo-tests";
  const { auth } = await import("../src/auth.ts");
  const signup = await auth.api.signUpEmail({
    body: { name: "Ray", email: "ray@test.local", password: "secreto123" },
  });
  assert.equal(signup.user.email, "ray@test.local");
  await assert.rejects(
    auth.api.signInEmail({ body: { email: "ray@test.local", password: "incorrecta" } }),
  );
  const signin = await auth.api.signInEmail({
    body: { email: "ray@test.local", password: "secreto123" },
  });
  assert.ok(signin.token.length > 10);
});
