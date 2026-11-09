import { defineConfig } from "vite";
import { serviceWorkerPlugin } from "./build/serviceWorker";

export default defineConfig({
  // Relative paths so GitHub Pages (and any static host) work without a fixed base
  base: "./",
  // Offline play: emits sw.js with a precache of the built files (production only)
  plugins: [serviceWorkerPlugin()],
});
