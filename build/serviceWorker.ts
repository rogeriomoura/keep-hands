/**
 * Vite plugin: after the app is built, bundle src/sw/sw.ts into <outDir>/sw.js
 * with the list of files to precache and a version derived from their
 * contents. Any change to any shipped file (code, html, sounds, icons) changes
 * the version, so returning players get the update.
 *
 * The worker is emitted as a classic IIFE script (not an ES module) because
 * module service workers aren't supported in every browser we target.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { build, type Plugin, type ResolvedConfig } from "vite";
import { selectPrecacheFiles } from "../src/sw/precache";

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
    }),
  );
  return nested.flat();
}

export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "keep-hands-service-worker",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      const precache = selectPrecacheFiles(await listFiles(outDir));

      const hash = createHash("sha256");
      for (const entry of precache) {
        const file = entry === "./" ? "index.html" : entry;
        hash.update(entry).update("\0").update(await readFile(path.join(outDir, file)));
      }
      const version = hash.digest("hex").slice(0, 12);

      await build({
        configFile: false,
        root: config.root,
        logLevel: "warn",
        define: {
          __PRECACHE__: JSON.stringify(precache),
          __SW_VERSION__: JSON.stringify(version),
        },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          minify: true,
          lib: {
            entry: path.resolve(config.root, "src/sw/sw.ts"),
            formats: ["iife"],
            name: "keepHandsServiceWorker",
            fileName: () => "sw.js",
          },
        },
      });
      config.logger.info(`service worker: precaching ${precache.length} files (version ${version})`);
    },
  };
}
