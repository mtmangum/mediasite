const { callApi } = require("../mediasite");
const { sendJson } = require("../http-utils");

// The presentation list's NumberOfViews is a lagging roll-up (new recordings read 0 for days),
// so live totals come from each presentation's analytics record instead.
const TTL_MS = 5 * 60 * 1000;
const MAX_CACHED = 500;
const MAX_IDS = 100;
const CONCURRENCY = 8;
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;

async function lookup(ctx, cfg, id, fresh) {
  const cached = ctx.viewsCache.get(id);
  if (!fresh && cached && cached.expires > Date.now()) return cached.value;
  try {
    const r = await callApi(cfg, { path: `/PresentationAnalytics('${id}')` });
    if (r.status !== 200) return null;
    const data = JSON.parse(r.body);
    const value = {
      views: Number(data.TotalViews) || 0,
      users: Number(data.TotalUsers) || 0,
      lastWatched: data.LastWatched || null,
    };
    if (ctx.viewsCache.size >= MAX_CACHED)
      ctx.viewsCache.delete(ctx.viewsCache.keys().next().value);
    ctx.viewsCache.set(id, { expires: Date.now() + TTL_MS, value });
    return value;
  } catch {
    return null;
  }
}

// GET /views.json?ids=a,b,c[&fresh=1] → { views: { id: {views, users, lastWatched} | null } }
async function views(req, res, ctx, url) {
  const ids = [
    ...new Set((url.searchParams.get("ids") || "").split(",").filter(Boolean)),
  ];
  if (
    !ids.length ||
    ids.length > MAX_IDS ||
    !ids.every((id) => VALID_ID.test(id))
  )
    return sendJson(res, 400, {
      error: `Provide 1–${MAX_IDS} valid presentation IDs`,
    });
  const fresh = url.searchParams.get("fresh") === "1";
  const cfg = ctx.config();
  const result = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        result[id] = await lookup(ctx, cfg, id, fresh);
      }
    }),
  );
  return sendJson(res, 200, { views: result });
}

module.exports = [{ method: "GET", path: "/views.json", handler: views }];
