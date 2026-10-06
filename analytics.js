const { callApi } = require("./mediasite");

// Aggregate analytics only; individual viewer identities are not needed by the cards.
async function getAnalytics(cfg, id, request = callApi) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id || "")) {
    const error = new Error("Invalid presentation ID");
    error.status = 400;
    throw error;
  }
  const endpoint = `/PresentationAnalytics('${id}')`;
  const summary = await request(cfg, { path: endpoint });
  if (summary.status !== 200) {
    const error = new Error(
      [401, 403].includes(summary.status)
        ? "Analytics access requires a login with permission to view this presentation’s reports."
        : `Mediasite returned ${summary.status} ${summary.statusText}`,
    );
    error.status = summary.status;
    throw error;
  }
  const raw = JSON.parse(summary.body);
  const number = (value) =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : null;
  const requests = [{ endpoint, status: summary.status, ms: summary.ms }];
  const warnings = [];
  const [browsers, systems] = await Promise.all(
    ["BrowserTotals", "SystemTotals"].map(async (name) => {
      const path = `${endpoint}/${name}`;
      try {
        const result = await request(cfg, { path });
        requests.push({ endpoint: path, status: result.status, ms: result.ms });
        if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
        const data = JSON.parse(result.body);
        if (!Array.isArray(data.value)) throw new Error("Invalid response");
        return data.value
          .map((p) => ({
            name: String(p.Platform || "Unknown"),
            views: number(p.Total),
          }))
          .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
      } catch (error) {
        warnings.push(`${name} unavailable: ${error.message}`);
        return null;
      }
    }),
  );
  return {
    totalViews: number(raw.TotalViews),
    liveViews: number(raw.LiveViews),
    onDemandViews: number(raw.OnDemandViews),
    uniqueUsers: number(raw.TotalUsers),
    peakConnections: number(raw.PeakConnections),
    watchSeconds: number(raw.TotalTimeWatchedSeconds),
    firstWatched: raw.FirstWatched || null,
    lastWatched: raw.LastWatched || null,
    browsers,
    systems,
    warnings,
    requests,
    fetchedAt: new Date().toISOString(),
  };
}
module.exports = { getAnalytics };
