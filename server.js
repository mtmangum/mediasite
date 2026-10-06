// Local web UI + proxy. Credentials stay server-side; the browser never sees them.
const http = require("node:http");
const path = require("node:path");
const { getConfig } = require("./mediasite");
const { createPreviewService } = require("./thumbnails");
const { sendJson } = require("./http-utils");
const { serveStatic } = require("./static");
const routes = require("./routes");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "dist");
const dev = process.argv.includes("--dev");

// State shared by route handlers. Overrides come from the UI and live in memory only.
const ctx = {
  overrides: {},
  healthCache: new Map(),
  previews: createPreviewService(),
  config: () => getConfig(ctx.overrides),
};

async function handle(req, res, vite) {
  try {
    const url = new URL(req.url, "http://localhost");
    const route = routes.find(
      (r) =>
        r.path === url.pathname &&
        (r.method === "*" || r.method === req.method),
    );
    if (route) return await route.handler(req, res, ctx, url);
    if (req.method === "GET")
      return serveStatic(req, res, { root: PUBLIC, vite });
    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, {
      error: err.name === "TimeoutError" ? "Request timed out" : err.message,
    });
  }
}

async function start() {
  let vite = null;
  const server = http.createServer((req, res) => handle(req, res, vite));
  if (dev)
    vite = await (
      await import("vite")
    ).createServer({
      server: { host: "127.0.0.1", ws: { server } },
    });
  server.on("error", async (err) => {
    console.error(err.message);
    await vite?.close();
    process.exitCode = 1;
  });
  server.listen(PORT, "127.0.0.1", () =>
    console.log(
      `Mediasite API tester${dev ? " (development)" : ""}: http://localhost:${PORT}`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await vite?.close();
      server.close(() => process.exit(0));
    });
}
start().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
