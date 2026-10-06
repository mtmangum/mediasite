// Static build for GitHub Pages: the real UI, driven by built-in sample data instead of a server.
// `npm run build:demo` writes dist-demo/. DEMO_BASE is the site's sub-path (default /mediasite/).
import { mergeConfig } from "vite";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import base from "./vite.config.mjs";

const BASE = (process.env.DEMO_BASE || "/mediasite/").replace(/\/?$/, "/");
const REPO = "https://github.com/mtmangum/mediasite";
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
        // The official university wordmarks are not part of the public demo.
        .replace(/<a\s+class="university-brand"[\s\S]*?<\/a>/, "")
        .replace(
          /<body[^>]*>/,
          (body) =>
            `${body}<div class="demo-banner" role="note"><strong>Demo</strong> · sample data, not connected to Mediasite · <a href="${REPO}">Source on GitHub</a></div>`,
        ),
  },
  // Pages has no server routing: serve the app for /recent and for chart links via 404.html.
  closeBundle() {
    copyFileSync(`${outDir}/recent.html`, `${outDir}/404.html`);
    mkdirSync(`${outDir}/recent`, { recursive: true });
    copyFileSync(`${outDir}/recent.html`, `${outDir}/recent/index.html`);
    copyFileSync(`${outDir}/index.html`, `${outDir}/explorer.html`);
    writeFileSync(`${outDir}/.nojekyll`, "");
    rmSync(`${outDir}/brand`, { recursive: true, force: true }); // wordmarks unused here
  },
};

export default mergeConfig(base, {
  base: BASE,
  define: { __DEMO__: true },
  plugins: [demoSite],
  build: { outDir: "../dist-demo" },
});
