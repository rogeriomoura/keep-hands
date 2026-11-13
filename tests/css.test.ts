import { describe, expect, it } from "vitest";
import rawCss from "../src/style.css?raw";

/**
 * A lost "}" doesn't break the build: browsers read everything after it as nested
 * inside the unclosed rule, silently disabling the rest of the stylesheet.
 */
describe("style.css", () => {
  it("is actually loaded (Vitest stubs CSS unless configured)", () => {
    expect(rawCss.length).toBeGreaterThan(10_000);
  });

  it("has balanced braces (no rule swallows the rest of the file)", () => {
    const css = rawCss
      .replace(/\/\*[\s\S]*?\*\//g, "") // comments
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""'); // strings
    let depth = 0;
    let line = 1;
    for (const ch of css) {
      if (ch === "\n") line++;
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      expect(depth, `unexpected "}" near line ${line}`).toBeGreaterThanOrEqual(0);
    }
    expect(depth, "a { is never closed").toBe(0);
  });
});
