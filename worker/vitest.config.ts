import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(here, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            JWT_SECRET: "test-jwt-secret",
            ENC_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            VR_TICK_SECRET: "test-tick-secret",
            VR_ALLOW_PRIVATE_EGRESS: "1",
            VR_PBKDF2_ITERATIONS: "1000",
            TEST_REQUIRE_PG: process.env.CI ? "1" : "0",
            TEST_PG_DSN: "postgres://postgres:vr@127.0.0.1:5434/vr",
            VR_PG_CONNECT_TIMEOUT_MS: "3000",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
