// Static build for GitHub Pages: the presentations page, driven by built-in sample data instead
// of a server. The API explorer is deliberately not part of the public site.
// `npm run build:demo` writes dist-demo/. DEMO_BASE is the site's sub-path (default /mediasite/).
import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = (process.env.DEMO_BASE || "/mediasite/").replace(/\/?$/, "/");
const REPO = "https://github.com/mtmangum/mediasite";
const root = fileURLToPath(new URL("./frontend", import.meta.url));
const outDir = fileURLToPath(new URL("./dist-demo", import.meta.url));

const demoSite = {
  name: "demo-site",
  transformIndexHtml: {
    order: "pre",
    handler: (html) =>
      html
        // Pages serves from a sub-path, and plain anchors are not rewritten by Vite.
        .replace(/href="\/"/g, `href="${BASE}"`)
        .replace(/href="\/recent"/g, `href="${BASE}recent"`)
        // The site is a single page: no navigation to the (local-only) API explorer.
        .replace(/<nav aria-label="Main navigation">[\s\S]*?<\/nav>/, "")
        // The official university wordmarks are not part of the public demo.
        .replace(/<a\s+class="university-brand"[\s\S]*?<\/a>/, "")
        .replace(
          /<body[^>]*>/,
          (body) =>
            `${body}<div class="demo-banner" role="note"><strong>Demo</strong> · sample data, not connected to Mediasite · <a href="${REPO}">Source on GitHub</a></div>`,
        ),
  },
  // Pages has no server routing: the app is the site root, /recent, and (via 404.html, which
  // Pages serves for unknown paths) every shareable chart link.
  closeBundle() {
    copyFileSync(`${outDir}/recent.html`, `${outDir}/index.html`);
    copyFileSync(`${outDir}/recent.html`, `${outDir}/404.html`);
    mkdirSync(`${outDir}/recent`, { recursive: true });
    copyFileSync(`${outDir}/recent.html`, `${outDir}/recent/index.html`);
    writeFileSync(`${outDir}/.nojekyll`, "");
    rmSync(`${outDir}/brand`, { recursive: true, force: true }); // wordmarks unused here
  },
};

export default defineConfig({
  root,
  base: BASE,
  appType: "mpa",
  define: { __DEMO__: true },
  plugins: [demoSite],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: { input: { presentations: `${root}/recent.html` } },
  },
});
