const { callApi, authHeaders } = require("../mediasite");
const { durationWarnings } = require("../recording-health");
const { sendJson } = require("../http-utils");

const RECENT_COUNT = 100;
const RECENT_PATH = `/Presentations?$top=${RECENT_COUNT}&$filter=Status eq 'Viewable'&$orderby=CreationDate desc&$select=full`;

async function recent(req, res, ctx) {
  const cfg = ctx.config();
  const r = await callApi(cfg, { path: RECENT_PATH });
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

// Proxy thumbnails with credentials, but only for the configured Mediasite host.
async function thumbnail(req, res, ctx, url) {
  const cfg = ctx.config();
  const target = new URL(url.searchParams.get("u"), cfg.baseUrl);
  if (target.origin !== new URL(cfg.baseUrl).origin)
    return sendJson(res, 400, { error: "Foreign host" });
  const up = await fetch(target, {
    headers: authHeaders(cfg),
    signal: AbortSignal.timeout(30000),
  });
  res.writeHead(up.status, {
    "Content-Type": up.headers.get("content-type") || "image/jpeg",
    "Cache-Control": "max-age=300",
  });
  return res.end(Buffer.from(await up.arrayBuffer()));
}

module.exports = [
  { method: "GET", path: "/recent.json", handler: recent },
  { method: "GET", path: "/thumb", handler: thumbnail },
];
