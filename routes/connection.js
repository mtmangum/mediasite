const { callApi } = require("../mediasite");
const { readBody, sendJson } = require("../http-utils");

const SECRETS = ["password", "apiKey"];
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

// Your login and API key are sent to the base URL, so it must be https (http only for this
// machine) and must not embed credentials of its own.
function validBaseUrl(value) {
  try {
    const url = new URL(value);
    const secure =
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK.test(url.hostname));
    return secure && !url.username && !url.password;
  } catch {
    return false;
  }
}

// GET reads the connection; POST updates in-memory overrides (blank secrets are ignored).
async function config(req, res, ctx) {
  if (req.method === "POST") {
    const updates = JSON.parse((await readBody(req)) || "{}");
    if (updates.baseUrl && !validBaseUrl(updates.baseUrl))
      return sendJson(res, 400, {
        error:
          "The base URL must be an https:// address (http:// only for localhost).",
      });
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
