import { defineConfig } from "vitest/config";

// Game-logic tests run headless in Node: no canvas or DOM is needed because the
// simulation (src/game/step.ts) is separate from the browser loop and rendering.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
