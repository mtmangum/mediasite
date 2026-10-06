const { callApi } = require("../mediasite");
const { readBody, sendJson } = require("../http-utils");

const SECRETS = ["password", "apiKey"];

// GET reads the connection; POST updates in-memory overrides (blank secrets are ignored).
async function config(req, res, ctx) {
  if (req.method === "POST") {
    const updates = JSON.parse((await readBody(req)) || "{}");
    ctx.healthCache.clear();
    ctx.viewsCache.clear();
    ctx.previews.clear();
    for (const key of ["baseUrl", "username", ...SECRETS]) {
      if (
        typeof updates[key] === "string" &&
        (!SECRETS.includes(key) || updates[key])
      )
        ctx.overrides[key] = updates[key];
    }
  }
  const cfg = ctx.config();
  return sendJson(res, 200, {
    baseUrl: cfg.baseUrl,
    username: cfg.username,
    hasPassword: !!cfg.password,
    hasApiKey: !!cfg.apiKey,
  });
}

async function request(req, res, ctx) {
  const { method, path, body, contentType } = JSON.parse(await readBody(req));
  return sendJson(
    res,
    200,
    await callApi(ctx.config(), { method, path, body, contentType }),
  );
}

module.exports = [
  { method: "*", path: "/config", handler: config },
  { method: "POST", path: "/request", handler: request },
];
