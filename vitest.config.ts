import { defineConfig } from "vitest/config";

// Game-logic tests run headless in Node: no canvas or DOM is needed because the
// simulation (src/game/step.ts) is separate from the browser loop and rendering.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Vitest stubs CSS imports as empty strings by default; tests/css.test.ts
    // imports the stylesheet as raw text to check it, so let this one through.
    css: { include: [/src\/style\.css/] },
  },
});
