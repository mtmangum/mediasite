const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getAnalytics } = require("../analytics");
const id = "presentation-1";
const reply = (body, status = 200) => ({
  status,
  statusText: "Fixture",
  ms: 12,
  body: JSON.stringify(body),
});

test("retains zero totals and converts watch-time strings without inventing missing metrics", async () => {
  const paths = [];
  const data = await getAnalytics({}, id, async (_, req) => {
    paths.push(req.path);
    return req.path.endsWith("Totals")
      ? reply({ value: [{ Platform: "Safari", Total: 0 }] })
      : reply({ TotalViews: 0, TotalUsers: 0, TotalTimeWatchedSeconds: "120" });
  });
  assert.equal(data.totalViews, 0);
  assert.equal(data.uniqueUsers, 0);
  assert.equal(data.watchSeconds, 120);
  assert.equal(data.peakConnections, null);
  assert.equal(data.firstWatched, null);
  assert.deepEqual(data.browsers, [{ name: "Safari", views: 0 }]);
  assert.equal(data.requests.length, 3);
  assert.ok(
    paths.every((path) => path.startsWith(`/PresentationAnalytics('${id}')`)),
  );
});
test("keeps summary usable when platform requests fail", async () => {
  const data = await getAnalytics({}, id, async (_, req) =>
    req.path.endsWith("BrowserTotals")
      ? reply({}, 403)
      : req.path.endsWith("SystemTotals")
        ? Promise.reject(Error("Timeout"))
        : reply({ TotalViews: 4 }),
  );
  assert.equal(data.totalViews, 4);
  assert.equal(data.browsers, null);
  assert.equal(data.systems, null);
  assert.equal(data.warnings.length, 2);
});
test("rejects invalid IDs before calling the upstream API", async () => {
  for (const value of [null, "", "x')/Users", "../secret"])
    await assert.rejects(
      getAnalytics({}, value, () => {
        throw Error("must not be called");
      }),
      { status: 400 },
    );
});
test("reports denied analytics permissions as an error rather than zero activity", async () => {
  await assert.rejects(
    getAnalytics({}, id, async () => reply({}, 403)),
    { status: 403, message: /permission/ },
  );
});
