import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Tests run inside the Workers runtime (Miniflare) against a local D1 with the
 * real migrations applied. Bindings are test-only values — nothing remote.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations({ projectPath: import.meta.dirname, migrationsDir: "migrations" });
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        remoteBindings: false,
        miniflare: {
          bindings: {
            RUN_SECRET: "test-run-secret",
            ALLOWED_ORIGINS: "https://game.example,http://localhost:5173",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
