import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Setup files run before each test file; applying is idempotent (tracked in d1_migrations)
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
