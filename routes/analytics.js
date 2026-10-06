const { getAnalytics, getViewingCharts } = require("../analytics");
const { sendJson } = require("../http-utils");

const aggregate = (fetchData) => async (req, res, ctx, url) => {
  try {
    return sendJson(
      res,
      200,
      await fetchData(ctx.config(), url.searchParams.get("id")),
    );
  } catch (error) {
    return sendJson(res, error.status || 502, { error: error.message });
  }
};

module.exports = [
  { method: "GET", path: "/analytics.json", handler: aggregate(getAnalytics) },
  {
    method: "GET",
    path: "/viewing.json",
    handler: aggregate(getViewingCharts),
  },
];
