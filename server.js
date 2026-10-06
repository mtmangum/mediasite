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
  viewsCache: new Map(),
  previews: createPreviewService(),
  config: () => getConfig(ctx.overrides),
};

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

// Only answer requests addressed to this machine on our own port. A page on another site can
// make a browser send requests here ("DNS rebinding"), but it cannot make them carry a loopback
// Host header, so this keeps such pages out.
function hostAllowed(req) {
  try {
    const host = new URL(`http://${req.headers.host}`);
    return LOOPBACK.test(host.hostname) && (host.port || "80") === String(PORT);
  } catch {
    return false;
  }
}

// The API holds your Mediasite credentials, so only this app's own pages may call it. Browsers
// label every cross-site request ("Sec-Fetch-Site") and send an Origin on writes; refuse both
// kinds of foreign request, and require JSON bodies, which a plain cross-site form cannot send.
function sameOriginCall(req) {
  const site = req.headers["sec-fetch-site"];
  if (site && !["same-origin", "none"].includes(site)) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return false;
  return true;
}

async function handle(req, res, vite) {
  try {
    if (!hostAllowed(req))
      return sendJson(res, 403, { error: "Forbidden host" });
    const url = new URL(req.url, "http://localhost");
    const route = routes.find(
      (r) =>
        r.path === url.pathname &&
        (r.method === "*" || r.method === req.method),
    );
    if (route) {
      if (!sameOriginCall(req))
        return sendJson(res, 403, {
          error: "Cross-site requests are not allowed",
        });
      if (
        !["GET", "HEAD"].includes(req.method) &&
        !/^application\/json\b/i.test(req.headers["content-type"] || "")
      )
        return sendJson(res, 415, { error: "Send JSON (application/json)" });
      return await route.handler(req, res, ctx, url);
    }
    if (req.method === "GET")
      return serveStatic(req, res, { root: PUBLIC, vite });
    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, err.status || 500, {
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
