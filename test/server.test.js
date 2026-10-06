// Runs the real server.js against a local fake Mediasite and checks its HTTP surface.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const BASIC = "Basic " + Buffer.from("tester:pw-1").toString("base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const seen = []; // requests received by the fake Mediasite
let fake, fakeOrigin, server, base;

const freePort = () =>
  new Promise((resolve) => {
    const probe = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const presentations = (origin) => [
  {
    Id: "p1",
    Title:
      "ECE 383P-Ultrafast and Nonlinear Optics-David Burghoff-19250_10/12/2026",
    Description: "Lecture",
    Status: "Viewable",
    CreationDate: "2026-09-28T21:54:14",
    RecordDate: "2026-10-01T16:00:00",
    Duration: 5400000,
    Owner: "owner1",
    PrimaryPresenter: "Default Presenter",
    NumberOfViews: 3,
    ParentFolderName: "ECE 383P",
    IsLive: false,
    ThumbnailUrl: `${origin}/Mediasite/FileServer/Presentation/p1/t.jpg`,
  },
  {
    Id: "p2",
    Title: "Short clip",
    Status: "Viewable",
    CreationDate: "2026-09-27T10:00:00",
    Duration: 600000,
    NumberOfViews: 0,
    IsLive: false,
    ThumbnailUrl: null,
  },
];

before(async () => {
  fake = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    const reply = (status, type, body) => {
      res.writeHead(status, { "Content-Type": type });
      res.end(body);
    };
    const authorized =
      req.headers.authorization === BASIC && req.headers.sfapikey === "key-1";
    if (req.url.startsWith("/Mediasite/Api/v1/Home"))
      return reply(200, "application/json", '{"SiteName":"Fake"}');
    if (!authorized) return reply(401, "application/json", "{}");
    const entity = /\/Presentations\('(\w+)'\)/.exec(req.url);
    if (entity)
      return entity[1] === "p1"
        ? reply(
            200,
            "application/json",
            JSON.stringify(presentations(fakeOrigin)[0]),
          )
        : reply(404, "application/json", "{}");
    if (req.url.startsWith("/Mediasite/Api/v1/Presentations"))
      return reply(
        200,
        "application/json",
        JSON.stringify({ value: presentations(fakeOrigin) }),
      );
    const analytics = /\/PresentationAnalytics\('(\w+)'\)/.exec(req.url);
    if (analytics) {
      const totals = { p1: 7, p2: 0 };
      return analytics[1] in totals
        ? reply(
            200,
            "application/json",
            JSON.stringify({
              TotalViews: totals[analytics[1]],
              TotalUsers: 2,
              LastWatched: "2026-10-05T12:00:00",
            }),
          )
        : reply(404, "application/json", "{}");
    }
    if (req.url.startsWith("/Mediasite/FileServer/"))
      return reply(200, "image/jpeg", JPEG);
    reply(404, "application/json", "{}");
  });
  await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
  fakeOrigin = `http://127.0.0.1:${fake.address().port}`;

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      MEDIASITE_BASE_URL: `${fakeOrigin}/Mediasite/Api/v1`,
      MEDIASITE_USERNAME: "tester",
      MEDIASITE_PASSWORD: "pw-1",
      MEDIASITE_API_KEY: "key-1",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("exit", (code) =>
      reject(new Error(`server exited early: ${code}`)),
    );
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("http://localhost")) resolve();
    });
  });
});

after(async () => {
  server?.kill();
  await new Promise((resolve) => fake.close(resolve));
});

const get = async (url, init) => {
  const res = await fetch(base + url, init);
  const type = res.headers.get("content-type") || "";
  return {
    status: res.status,
    type,
    body: type.includes("json")
      ? await res.json()
      : Buffer.from(await res.arrayBuffer()),
  };
};
const post = (url, body) =>
  get(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("/recent.json maps presentations and proxies thumbnails through the server", async () => {
  const { status, body } = await get("/recent.json");
  assert.equal(status, 200);
  assert.equal(body.items.length, 2);

  const [first, second] = body.items;
  assert.equal(first.id, "p1");
  assert.equal(first.views, 3);
  assert.equal(first.durationMs, 5400000);
  assert.equal(first.watchUrl, `${fakeOrigin}/Mediasite/Play/p1`);
  assert.match(first.thumbnail, /^\/thumb\?u=/, "thumbnails go through /thumb");
  assert.deepEqual(first.recordingWarnings, []);

  assert.equal(second.thumbnail, null);
  assert.equal(second.recordingWarnings[0].code, "short");
});

test("/recent.json asks Mediasite for 100 viewable presentations with credentials", async () => {
  seen.length = 0;
  await get("/recent.json");
  const call = seen.find((r) => r.url.includes("/Presentations"));
  const query = decodeURIComponent(call.url);
  assert.match(query, /\$top=100/);
  assert.match(query, /\$filter=Status eq 'Viewable'/);
  assert.match(query, /\$orderby=CreationDate desc/);
  assert.match(query, /\$select=full/);
  assert.equal(call.headers.authorization, BASIC);
  assert.equal(call.headers.sfapikey, "key-1");
});

test("/thumb streams same-host images with credentials and rejects other hosts", async () => {
  seen.length = 0;
  const { body } = await get("/recent.json");
  const thumb = await get(body.items[0].thumbnail);
  assert.equal(thumb.status, 200);
  assert.equal(thumb.type, "image/jpeg");
  assert.deepEqual(thumb.body, JPEG);
  const upstream = seen.find((r) => r.url.includes("/FileServer/"));
  assert.equal(upstream.headers.sfapikey, "key-1");

  const foreign = await get(
    "/thumb?u=" + encodeURIComponent("https://example.com/x.jpg"),
  );
  assert.equal(foreign.status, 400);
  assert.deepEqual(foreign.body, { error: "Foreign host" });
});

test("/config never reveals secrets and ignores blank secret updates", async () => {
  const before = await get("/config");
  assert.deepEqual(before.body, {
    baseUrl: `${fakeOrigin}/Mediasite/Api/v1`,
    username: "tester",
    hasPassword: true,
    hasApiKey: true,
  });
  assert.doesNotMatch(JSON.stringify(before.body), /pw-1|key-1/);

  // Blank password/API key mean "keep the existing secret".
  const kept = await post("/config", { password: "", apiKey: "", bogus: "x" });
  assert.equal(kept.body.hasPassword, true);
  assert.equal(kept.body.hasApiKey, true);
  assert.equal((await get("/recent.json")).status, 200);
});

test("/request forwards a call to Mediasite and returns its response", async () => {
  const { status, body } = await post("/request", {
    method: "GET",
    path: "/Home",
  });
  assert.equal(status, 200);
  assert.equal(body.status, 200);
  assert.equal(JSON.parse(body.body).SiteName, "Fake");
  assert.match(body.url, /\/Mediasite\/Api\/v1\/Home$/);
});

test("Mediasite rejections surface as errors, and config updates take effect", async () => {
  // Changing the username (an in-memory override) makes the fake reject the login.
  await post("/config", { username: "intruder" });
  const rejected = await get("/recent.json");
  assert.equal(rejected.status, 401);
  assert.match(rejected.body.error, /Mediasite returned 401/);

  await post("/config", { username: "tester" });
  assert.equal((await get("/recent.json")).status, 200);
});

test("/views.json returns live totals, tolerates missing presentations, and caches", async () => {
  const analyticsCalls = (id) =>
    seen.filter((r) => r.url.includes(`PresentationAnalytics('${id}')`)).length;

  const first = await get("/views.json?ids=p1,p2,missing");
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.views.p1, {
    views: 7,
    users: 2,
    lastWatched: "2026-10-05T12:00:00",
  });
  assert.equal(first.body.views.p2.views, 0);
  assert.equal(first.body.views.missing, null, "unknown ids come back null");

  const callsAfterFirst = analyticsCalls("p1");
  await get("/views.json?ids=p1");
  assert.equal(
    analyticsCalls("p1"),
    callsAfterFirst,
    "a second request is cached",
  );
  await get("/views.json?ids=p1&fresh=1");
  assert.equal(
    analyticsCalls("p1"),
    callsAfterFirst + 1,
    "fresh=1 bypasses the cache",
  );
});

test("/views.json rejects missing, malformed, or excessive ids", async () => {
  assert.equal((await get("/views.json")).status, 400);
  assert.equal((await get("/views.json?ids=p1,bad/id")).status, 400);
  assert.equal((await get("/views.json?ids=a'b")).status, 400);
  const tooMany = Array.from({ length: 101 }, (_, i) => `id${i}`).join(",");
  assert.equal((await get(`/views.json?ids=${tooMany}`)).status, 400);
});

test("/presentation.json returns one presentation, 404s unknown ones, and rejects bad ids", async () => {
  const found = await get("/presentation.json?id=p1");
  assert.equal(found.status, 200);
  assert.equal(found.body.item.id, "p1");
  assert.equal(found.body.item.durationMs, 5400000);
  assert.equal(found.body.item.watchUrl, `${fakeOrigin}/Mediasite/Play/p1`);
  assert.match(found.body.item.thumbnail, /^\/thumb\?u=/);

  const missing = await get("/presentation.json?id=nope");
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "Presentation not found" });

  assert.equal((await get("/presentation.json")).status, 400);
  assert.equal((await get("/presentation.json?id=a'b")).status, 400);
});

test("analytics routes require an id", async () => {
  for (const route of ["/analytics.json", "/viewing.json"]) {
    const res = await get(route);
    assert.equal(res.status, 400, route);
    assert.ok(res.body.error, route);
  }
});

test("unknown routes and wrong methods return 404 JSON", async () => {
  const missing = await get("/nonexistent");
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: "Not found" });
  assert.equal((await get("/recent.json", { method: "PUT" })).status, 404);
  assert.equal((await get("/", { method: "POST" })).status, 404);
});

test("static serving refuses paths outside the build directory", async () => {
  for (const attempt of [
    "/../server.js",
    "/..%2fserver.js",
    "/%2e%2e/package.json",
  ]) {
    const res = await get(attempt);
    assert.equal(res.status, 404, attempt);
  }
});
