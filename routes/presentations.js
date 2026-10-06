const { callApi, authHeaders, configProblem } = require("../mediasite");
const { durationWarnings } = require("../recording-health");
const { sendJson, SECURITY_HEADERS } = require("../http-utils");

const RECENT_COUNT = 100;
const RECENT_PATH = `/Presentations?$top=${RECENT_COUNT}&$filter=Status eq 'Viewable'&$orderby=CreationDate desc&$select=full`;

// The card shape the front end uses, from a Mediasite presentation record.
function toItem(p, cfg) {
  return {
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
  };
}

async function recent(req, res, ctx) {
  const cfg = ctx.config();
  const r = await callApi(cfg, { path: RECENT_PATH });
  if (r.status !== 200)
    return sendJson(res, r.status, {
      error: `Mediasite returned ${r.status} ${r.statusText}`,
    });
  const items = (JSON.parse(r.body).value || []).map((p) => toItem(p, cfg));
  return sendJson(res, 200, { items });
}

// Proxy thumbnails with credentials, but only for the configured Mediasite host.
async function thumbnail(req, res, ctx, url) {
  const cfg = ctx.config();
  const problem = configProblem(cfg);
  if (problem) return sendJson(res, 400, { error: problem });
  const target = new URL(url.searchParams.get("u"), cfg.baseUrl);
  if (target.origin !== new URL(cfg.baseUrl).origin)
    return sendJson(res, 400, { error: "Foreign host" });
  const up = await fetch(target, {
    headers: authHeaders(cfg),
    // A redirect would carry the API key header to wherever it points.
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  res.writeHead(up.status, {
    ...SECURITY_HEADERS,
    "Content-Type": up.headers.get("content-type") || "image/jpeg",
    "Cache-Control": "max-age=300",
  });
  return res.end(Buffer.from(await up.arrayBuffer()));
}

const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;

// One presentation by id, so a shared link works for recordings outside the latest 100.
async function one(req, res, ctx, url) {
  const id = url.searchParams.get("id");
  if (!VALID_ID.test(id || ""))
    return sendJson(res, 400, { error: "Invalid presentation ID" });
  const cfg = ctx.config();
  const r = await callApi(cfg, {
    path: `/Presentations('${id}')?$select=full`,
  });
  if (r.status === 404)
    return sendJson(res, 404, { error: "Presentation not found" });
  if (r.status !== 200)
    return sendJson(res, r.status, {
      error: `Mediasite returned ${r.status} ${r.statusText}`,
    });
  return sendJson(res, 200, { item: toItem(JSON.parse(r.body), cfg) });
}

module.exports = [
  { method: "GET", path: "/recent.json", handler: recent },
  { method: "GET", path: "/presentation.json", handler: one },
  { method: "GET", path: "/thumb", handler: thumbnail },
];
