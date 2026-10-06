const { getRecordingHealth } = require("../recording-health");
const { sendJson } = require("../http-utils");

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;

// Cached per recording for five minutes; failures are not cached.
async function health(req, res, ctx, url) {
  const id = url.searchParams.get("id");
  const cache = ctx.healthCache;
  let entry = cache.get(id);
  if (!entry || entry.expires <= Date.now()) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
    entry = {
      expires: Date.now() + TTL_MS,
      promise: getRecordingHealth(ctx.config(), id),
    };
    cache.set(id, entry);
  }
  try {
    return sendJson(res, 200, await entry.promise);
  } catch (error) {
    if (cache.get(id) === entry) cache.delete(id);
    return sendJson(res, error.status || 502, { error: error.message });
  }
}

module.exports = [{ method: "GET", path: "/health.json", handler: health }];
