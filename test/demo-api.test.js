// The built-in sample API behind the GitHub Pages demo: deterministic, self-consistent, fictional.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../frontend/src/demo-api.ts");
const NOW = Date.UTC(2026, 9, 6, 18, 0, 0);
const call = async (path, { method = "GET", body } = {}) => {
  const { demoResponse } = await load();
  const url = new URL(path, "http://demo.test");
  return demoResponse(method, url.pathname, url.searchParams, body);
};

test("the library is fictional, deterministic, and newest first", async () => {
  const { demoLibrary } = await load();
  const a = demoLibrary(NOW);
  const b = JSON.parse(JSON.stringify(a));
  assert.equal(a.length, 36);
  assert.deepEqual(
    demoLibrary(NOW).map((r) => r.item.id),
    b.map((r) => r.item.id),
  );
  assert.equal(new Set(a.map((r) => r.item.id)).size, 36, "unique ids");
  assert.ok(a.every((r) => /^[0-9a-f]{34}$/.test(r.item.id)));
  const created = a.map((r) => r.item.created);
  assert.deepEqual(created, [...created].sort().reverse());
  assert.doesNotMatch(
    JSON.stringify(a.map((r) => r.item)),
    /utexas|utengr|mmangum.*mediasite\.com/i,
    "no real site or people",
  );
  assert.ok(
    a.some((r) => r.item.recordingWarnings.length),
    "some short clips",
  );
  assert.ok(
    a.some((r) => r.staticReview),
    "some idle-screen flags",
  );
});

test("every sample title parses into a course, title, section, and instructor", async () => {
  const { demoLibrary } = await load();
  const { parseCourseTitle } = await import("../frontend/src/course-title.ts");
  for (const { item } of demoLibrary(NOW)) {
    const parsed = parseCourseTitle(item.title);
    assert.ok(parsed.course, item.title);
    assert.ok(parsed.sections, item.title);
    assert.ok(parsed.instructor, item.title);
  }
});

test("counts, charts, and sessions agree with each other for every recording", async () => {
  const { demoLibrary } = await load();
  for (const record of demoLibrary(NOW)) {
    const id = record.item.id;
    const n = record.sessions.length;
    assert.equal(record.item.views, n);

    const { body: analytics } = await call(`/analytics.json?id=${id}`);
    assert.equal(analytics.totalViews, n);
    assert.equal(analytics.onDemandViews, n);
    const sum = (rows) => rows.reduce((total, row) => total + row.views, 0);
    assert.equal(sum(analytics.browsers), n, "browser split adds up");
    assert.equal(sum(analytics.systems), n, "system split adds up");

    const { body: viewing } = await call(`/viewing.json?id=${id}`);
    assert.equal(viewing.sessions.length, n);
    assert.equal(viewing.histogram.totalSessions, n);
    assert.ok(viewing.viewers.distinct <= n);
    assert.ok(viewing.viewers.returning <= viewing.viewers.distinct);
    assert.equal(
      viewing.timeline.length,
      Math.ceil(record.duration / 30),
      "one segment per 30 seconds",
    );
    for (const s of viewing.sessions) {
      const opened = Date.parse(s.opened);
      assert.ok(opened <= NOW, "no sessions in the future");
      assert.ok(opened >= Date.parse(record.item.created), "after upload");
      assert.ok(s.coverage <= record.duration);
      assert.ok(s.watched <= record.duration * 1.2);
    }
    const sorted = [...viewing.sessions].sort((a, b) =>
      a.opened.localeCompare(b.opened),
    );
    assert.deepEqual(viewing.sessions, sorted);
  }
});

test("endpoints answer like the real server, including errors", async () => {
  const { demoLibrary } = await load();
  const id = demoLibrary(NOW)[0].item.id;

  const recent = await call("/recent.json");
  assert.equal(recent.status, 200);
  assert.equal(recent.body.items.length, 36);

  assert.equal((await call(`/presentation.json?id=${id}`)).body.item.id, id);
  assert.equal((await call("/presentation.json?id=nope")).status, 404);
  assert.equal((await call("/presentation.json")).status, 400);
  assert.equal((await call("/analytics.json?id=a'b")).status, 400);

  const views = await call(`/views.json?ids=${id},unknown`);
  assert.equal(views.body.views[id].views, recent.body.items[0].views);
  assert.equal(views.body.views.unknown, null);
  assert.equal((await call("/views.json")).status, 400);

  const preview = await call(`/preview.json?id=${id}`);
  assert.equal(preview.body.frames.length, 3);
  assert.ok(
    preview.body.frames.every((f) => f.url.startsWith("data:image/svg+xml")),
  );

  const health = await call(`/health.json?id=${id}`);
  assert.deepEqual(
    health.body.warnings,
    demoLibrary(NOW)[0].item.recordingWarnings,
  );

  assert.equal((await call("/config")).body.username, "demo");
  assert.equal(
    await call("/not-an-api-route"),
    null,
    "other paths pass through",
  );
  assert.equal(await call("/request"), null, "only POST /request is handled");
});

test("the API explorer gets canned responses and clear 404s", async () => {
  const ask = (path) =>
    call("/request", {
      method: "POST",
      body: JSON.stringify({ method: "GET", path }),
    });
  const home = await ask("/Home");
  assert.equal(home.body.status, 200);
  assert.equal(JSON.parse(home.body.body).SiteName, "Demo Mediasite");

  const list = await ask("/Presentations?$top=3&$filter=ignored");
  const parsed = JSON.parse(list.body.body);
  assert.equal(parsed.value.length, 3);
  assert.ok(parsed.value[0].Id && parsed.value[0].Title);

  const missing = await ask("/Nope");
  assert.equal(missing.body.status, 404);
  assert.match(missing.body.body, /not available in the demo/);

  const write = (extra) =>
    call("/request", {
      method: "POST",
      body: JSON.stringify({
        method: "DELETE",
        path: "/Presentations('x')",
        ...extra,
      }),
    });
  assert.equal(
    (await write({})).status,
    403,
    "read-only by default, like the real app",
  );
  const simulated = await write({ allowWrites: true });
  assert.equal(simulated.status, 200);
  assert.match(JSON.parse(simulated.body.body).demo, /nothing was changed/);

  const bad = await call("/request", { method: "POST", body: "{not json" });
  assert.equal(bad.status, 400);
});
