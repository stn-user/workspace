import { cpSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "copy-classic-demo-assets",
      apply: "build",
      closeBundle() {
        copyFileSync(resolve(projectRoot, "app.js"), resolve(projectRoot, "dist/app.js"));
        copyFileSync(resolve(projectRoot, "styles.css"), resolve(projectRoot, "dist/styles.css"));
        cpSync(resolve(projectRoot, "samples"), resolve(projectRoot, "dist/samples"), { recursive: true });
      },
    },
  ],
  server: {
    host: true,
    port: 5173
  },
  optimizeDeps: {
    exclude: ['@capacitor/*', 'pdfjs-dist']
  }
});
