// Local web UI + proxy. Credentials stay server-side; the browser never sees them.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { getConfig, callApi } = require("./mediasite");
const { getAnalytics, getViewingCharts } = require("./analytics");

const { durationWarnings, getRecordingHealth } = require("./recording-health");
const healthCache = new Map();
const { createPreviewService } = require("./thumbnails");
const previews = createPreviewService();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "dist");
const dev = process.argv.includes("--dev");
let overrides = {}; // set from the UI, held in memory only

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });

const sendJson = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};

async function start() {
  let vite = null;
  const server = http.createServer(async (req, res) => {
    try {
      if (
        req.method === "GET" &&
        ["/analytics.json", "/viewing.json"].includes(req.url.split("?")[0])
      ) {
        const id = new URL(req.url, "http://localhost").searchParams.get("id");
        try {
          return sendJson(
            res,
            200,
            await (
              req.url.startsWith("/viewing.json")
                ? getViewingCharts
                : getAnalytics
            )(getConfig(overrides), id),
          );
        } catch (error) {
          return sendJson(res, error.status || 502, { error: error.message });
        }
      }

      if (req.method === "GET" && req.url.split("?")[0] === "/health.json") {
        const params = new URL(req.url, "http://localhost").searchParams;
        const id = params.get("id");
        let entry = healthCache.get(id);
        if (!entry || entry.expires <= Date.now()) {
          if (healthCache.size >= 100)
            healthCache.delete(healthCache.keys().next().value);
          entry = {
            expires: Date.now() + 5 * 60 * 1000,
            promise: getRecordingHealth(getConfig(overrides), id),
          };
          healthCache.set(id, entry);
        }
        try {
          return sendJson(res, 200, await entry.promise);
        } catch (error) {
          if (healthCache.get(id) === entry) healthCache.delete(id);
          return sendJson(res, error.status || 502, { error: error.message });
        }
      }

      if (
        req.method === "GET" &&
        ["/preview.json", "/preview"].includes(req.url.split("?")[0])
      ) {
        const params = new URL(req.url, "http://localhost").searchParams;
        const id = params.get("id");
        try {
          const { frames, review } = await previews.get(
            getConfig(overrides),
            id,
          );
          if (req.url.startsWith("/preview.json"))
            return sendJson(res, 200, {
              review,
              frames: frames.map((f, index) => ({
                seconds: f.seconds,
                url: `/preview?id=${encodeURIComponent(id)}&frame=${index}`,
              })),
            });
          const index = Number(params.get("frame") || 0);
          if (!Number.isInteger(index) || index < 0 || index >= frames.length)
            return sendJson(res, 400, { error: "Invalid preview frame" });
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, max-age=300",
          });
          return res.end(frames[index].image);
        } catch (error) {
          return sendJson(res, error.status || 503, { error: error.message });
        }
      }

      if (req.method === "GET" && req.url === "/recent.json") {
        const cfg = getConfig(overrides);
        const r = await callApi(cfg, {
          path: "/Presentations?$top=100&$filter=Status eq 'Viewable'&$orderby=CreationDate desc&$select=full",
        });
        if (r.status !== 200)
          return sendJson(res, r.status, {
            error: `Mediasite returned ${r.status} ${r.statusText}`,
          });
        const items = (JSON.parse(r.body).value || []).map((p) => ({
          id: p.Id,
          title: p.Title,
          description: p.Description,
          status: p.Status,
          created: p.CreationDate,
          recorded: p.RecordDate,
          durationMs: p.Duration,
          recordingWarnings: durationWarnings(p),
          owner: p.Owner,
          presenter: p.PrimaryPresenter,
          views: p.NumberOfViews,
          folder: p.ParentFolderName,
          isLive: p.IsLive,
          thumbnail: p.ThumbnailUrl
            ? "/thumb?u=" + encodeURIComponent(p.ThumbnailUrl)
            : null,
          watchUrl: cfg.baseUrl.replace(/\/Api\/v1$/i, "") + "/Play/" + p.Id,
        }));
        return sendJson(res, 200, { items });
      }

      if (req.method === "GET" && req.url.startsWith("/thumb?")) {
        // Proxy thumbnails with credentials, but only for the configured Mediasite host.
        const cfg = getConfig(overrides);
        const target = new URL(
          new URLSearchParams(req.url.slice(7)).get("u"),
          cfg.baseUrl,
        );
        if (target.origin !== new URL(cfg.baseUrl).origin)
          return sendJson(res, 400, { error: "Foreign host" });
        const headers = {};
        if (cfg.username)
          headers.Authorization =
            "Basic " +
            Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
        if (cfg.apiKey) headers.sfapikey = cfg.apiKey;
        const up = await fetch(target, {
          headers,
          signal: AbortSignal.timeout(30000),
        });
        res.writeHead(up.status, {
          "Content-Type": up.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "max-age=300",
        });
        return res.end(Buffer.from(await up.arrayBuffer()));
      }

      if (req.url === "/config") {
        if (req.method === "POST") {
          const updates = JSON.parse((await readBody(req)) || "{}");
          healthCache.clear();
          previews.clear();
          for (const key of ["baseUrl", "username", "password", "apiKey"]) {
            if (
              typeof updates[key] === "string" &&
              (!["password", "apiKey"].includes(key) || updates[key])
            )
              overrides[key] = updates[key];
          }
        }
        const cfg = getConfig(overrides);
        return sendJson(res, 200, {
          baseUrl: cfg.baseUrl,
          username: cfg.username,
          hasPassword: !!cfg.password,
          hasApiKey: !!cfg.apiKey,
        });
      }

      if (req.method === "POST" && req.url === "/request") {
        const {
          method,
          path: apiPath,
          body,
          contentType,
        } = JSON.parse(await readBody(req));
        const result = await callApi(getConfig(overrides), {
          method,
          path: apiPath,
          body,
          contentType,
        });
        return sendJson(res, 200, result);
      }

      if (req.method === "GET") {
        const pathname = new URL(req.url, "http://localhost").pathname;
        if (vite) {
          if (pathname === "/recent" || pathname === "/recent/")
            req.url = "/recent.html";
          return vite.middlewares(req, res, () =>
            sendJson(res, 404, { error: "Not found" }),
          );
        }
        const file =
          pathname === "/"
            ? "index.html"
            : ["/recent", "/recent/"].includes(pathname)
              ? "recent.html"
              : pathname.slice(1);
        const target = path.resolve(PUBLIC, file);
        if (
          target.startsWith(PUBLIC + path.sep) &&
          fs.existsSync(target) &&
          fs.statSync(target).isFile()
        ) {
          const types = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "text/javascript",
            ".svg": "image/svg+xml",
            ".woff2": "font/woff2",
            ".txt": "text/plain; charset=utf-8",
          };
          res.writeHead(200, {
            "Content-Type":
              types[path.extname(target)] || "application/octet-stream",
          });
          return res.end(fs.readFileSync(target));
        }
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      sendJson(res, 500, {
        error: err.name === "TimeoutError" ? "Request timed out" : err.message,
      });
    }
  });
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
