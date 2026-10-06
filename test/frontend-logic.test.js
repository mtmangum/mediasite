// Pure front-end modules, imported directly (Node strips the TypeScript types).
const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = (name) => import(`../frontend/src/${name}.ts`);

const presentation = (id, overrides = {}) => ({
  id,
  watchUrl: `https://example.test/Play/${id}`,
  ...overrides,
});

test("view counts fall into color tiers at the documented boundaries", async () => {
  const { viewsTier } = await load("views");
  const expected = [
    [undefined, "none"],
    [0, "none"],
    [1, "low"],
    [5, "low"],
    [6, "some"],
    [10, "some"],
    [11, "good"],
    [20, "good"],
    [21, "high"],
    [500, "high"],
  ];
  for (const [views, tier] of expected)
    assert.equal(viewsTier(views), tier, `${views} views`);
});

test("filtering matches title, presenter, folder, and description, ignoring case", async () => {
  const { filterPresentations } = await load("list");
  const items = [
    presentation("a", { title: "Thermodynamics" }),
    presentation("b", { presenter: "Ada Lovelace" }),
    presentation("c", { folder: "ECE 306 Fall" }),
    presentation("d", { description: "Lab safety briefing" }),
    presentation("e", { title: "Unrelated" }),
  ];
  const ids = (query) => filterPresentations(items, query).map((p) => p.id);
  assert.deepEqual(ids("THERMO"), ["a"]);
  assert.deepEqual(ids("  lovelace "), ["b"]);
  assert.deepEqual(ids("ece 306"), ["c"]);
  assert.deepEqual(ids("safety"), ["d"]);
  assert.deepEqual(ids("zzz"), []);
  assert.equal(ids("").length, 5, "an empty query keeps everything");
});

test("sorting by views breaks ties by newest, and unknown keys sort newest first", async () => {
  const { sortPresentations } = await load("list");
  const items = [
    presentation("old-5", { views: 5, created: "2026-01-01T00:00:00" }),
    presentation("new-5", { views: 5, created: "2026-03-01T00:00:00" }),
    presentation("top", { views: 30, created: "2026-02-01T00:00:00" }),
    presentation("none", { created: "2026-04-01T00:00:00" }),
  ];
  const ids = (key) => sortPresentations([...items], key).map((p) => p.id);
  assert.deepEqual(ids("views"), ["top", "new-5", "old-5", "none"]);
  assert.deepEqual(ids("newest"), ["none", "new-5", "top", "old-5"]);
  assert.deepEqual(ids("something-else"), ids("newest"));
});

test("sorting by title and duration", async () => {
  const { sortPresentations } = await load("list");
  const items = [
    presentation("b", { title: "Beta", durationMs: 100 }),
    presentation("a", { title: "Alpha", durationMs: 300 }),
    presentation("c", { durationMs: 200 }),
  ];
  const ids = (key) => sortPresentations([...items], key).map((p) => p.id);
  assert.deepEqual(ids("title"), ["c", "a", "b"], "missing titles sort first");
  assert.deepEqual(ids("duration"), ["a", "c", "b"]);
});

test("pagination clamps the page and slices the right items", async () => {
  const { paginate } = await load("list");
  const items = Array.from({ length: 100 }, (_, i) => presentation(`p${i}`));

  const first = paginate(items, 1, 9);
  assert.equal(first.pageCount, 12);
  assert.equal(first.start, 0);
  assert.equal(first.items.length, 9);

  const last = paginate(items, 12, 9);
  assert.equal(last.start, 99);
  assert.deepEqual(
    last.items.map((p) => p.id),
    ["p99"],
  );

  const clamped = paginate(items, 99, 9);
  assert.equal(clamped.currentPage, 12, "out-of-range pages clamp to the last");

  const empty = paginate([], 5, 9);
  assert.deepEqual(
    [empty.currentPage, empty.pageCount, empty.items.length],
    [1, 1, 0],
  );
});

test("page controls show the range, current page, and disabled edges", async () => {
  const { pageControlsMarkup } = await load("pagination");
  const first = pageControlsMarkup(1, 12, 0, 9, 100);
  assert.match(first, /Showing <strong>1–9<\/strong> of <strong>100<\/strong>/);
  assert.match(first, /Page <strong>1<\/strong> of 12/);
  assert.match(first, /data-page="0"[^>]*disabled/, "Previous is disabled");
  assert.doesNotMatch(
    first,
    /data-page="2" aria-label="Next page"[^>]*disabled/,
  );
  assert.equal(first.match(/aria-current="page"/g).length, 1);
  assert.equal(
    first.match(/class="secondary page-number"/g).length,
    6,
    "pages 1–5 and the last page, with a gap between",
  );
  assert.match(first, /class="page-gap"/);

  const last = pageControlsMarkup(12, 12, 99, 1, 100);
  assert.match(last, /Showing <strong>100–100<\/strong>/);
  assert.match(last, /data-page="13" aria-label="Next page"[^>]*disabled/);
});

test("escaping neutralizes HTML metacharacters and tolerates missing values", async () => {
  const { esc } = await load("format");
  assert.equal(
    esc(`<a href="x">&'</a>`),
    "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
  );
  assert.equal(esc(undefined), "");
  assert.equal(esc(null), "");
  assert.equal(esc(0), "0");
});

test("durations format as m:ss or h:mm:ss, with a dash when unknown", async () => {
  const { fmtDuration } = await load("format");
  assert.equal(fmtDuration(undefined), "—");
  assert.equal(fmtDuration(0), "—");
  assert.equal(fmtDuration(59000), "0:59");
  assert.equal(fmtDuration(90000), "1:30");
  assert.equal(fmtDuration(3600000), "1:00:00");
  assert.equal(fmtDuration(5405002), "1:30:05");
});

test("the page window stays within seven slots and always shows first, current, and last", async () => {
  const { pageWindow } = await load("pagination");
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(3, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageWindow(1, 12), [1, 2, 3, 4, 5, "…", 12]);
  assert.deepEqual(pageWindow(4, 12), [1, 2, 3, 4, 5, "…", 12]);
  assert.deepEqual(pageWindow(5, 12), [1, "…", 4, 5, 6, "…", 12]);
  assert.deepEqual(pageWindow(8, 12), [1, "…", 7, 8, 9, "…", 12]);
  assert.deepEqual(pageWindow(9, 12), [1, "…", 8, 9, 10, 11, 12]);
  assert.deepEqual(pageWindow(12, 12), [1, "…", 8, 9, 10, 11, 12]);
  for (const count of [8, 9, 12, 40])
    for (let current = 1; current <= count; current++) {
      const window = pageWindow(current, count);
      assert.ok(window.length <= 7, `${current}/${count}`);
      assert.ok(
        window.includes(current),
        `${current}/${count} shows the current page`,
      );
      assert.equal(window[0], 1);
      assert.equal(window.at(-1), count);
      const numbers = window.filter((p) => p !== "…");
      assert.deepEqual(
        numbers,
        [...numbers].sort((a, b) => a - b),
        "ascending",
      );
    }
});

test("new presentations are those the page has not seen, in the incoming order", async () => {
  const { newPresentations } = await load("list");
  const known = [presentation("a"), presentation("b")];
  const incoming = [presentation("c"), presentation("a"), presentation("d")];
  assert.deepEqual(
    newPresentations(known, incoming).map((p) => p.id),
    ["c", "d"],
  );
  assert.deepEqual(newPresentations(known, known), []);
  assert.deepEqual(newPresentations([], incoming).length, 3);
});

test("shareable chart links parse to a presentation id and build back", async () => {
  const { chartsFor, chartsPath, LIST_PATH } = await load("route");
  assert.equal(LIST_PATH, "/recent");
  assert.equal(
    chartsFor("/recent/ee17f8d604b24829/charts"),
    "ee17f8d604b24829",
  );
  assert.equal(chartsFor("/recent/abc_DEF-123/charts/"), "abc_DEF-123");
  for (const path of [
    "/recent",
    "/recent/",
    "/recent/abc",
    "/recent/abc/charts/extra",
    "/recent//charts",
    "/other/abc/charts",
    "/recent/a b/charts",
    "/",
  ])
    assert.equal(chartsFor(path), null, path);
  assert.equal(chartsPath("abc123"), "/recent/abc123/charts");
  assert.equal(chartsFor(chartsPath("abc123")), "abc123", "round trip");
  assert.equal(chartsPath("a/b"), "/recent/a%2Fb/charts", "ids are encoded");
});
