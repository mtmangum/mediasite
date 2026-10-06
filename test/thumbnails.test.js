const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  sampleTimes,
  safeMediaUrl,
  scoreFrame,
  createPreviewService,
  mediaProxy,
  visualReview,
} = require("../thumbnails");
const cfg = {
  baseUrl: "https://example.test/Mediasite/Api/v1",
  username: "fixture",
  password: "fixture",
  apiKey: "fixture",
};
const reply = (body) => ({ status: 200, body: JSON.stringify(body) });
function fixture(revision = 1) {
  return async (_, req) =>
    reply(
      req.path.includes("VideoPodcastContent")
        ? {
            value: [
              {
                ContentRevision: revision,
                Status: "Completed",
                Length: 3600000,
                FileLength: 10000,
                DownloadUrl:
                  "https://example.test/Mediasite/FileServer/movie.mp4",
                LastModified: "fixture",
              },
            ],
          }
        : { ContentRevision: revision },
    );
}
test("sample times stay inside short recordings and avoid the opening frame", () => {
  assert.deepEqual(sampleTimes(3600), [1800, 2520, 1260]);
  assert.deepEqual(sampleTimes(0), []);
  assert.deepEqual(sampleTimes(NaN), []);
  assert.ok(sampleTimes(0.2).every((t) => t >= 0 && t < 0.2));
});
test("blank frames are rejected while detailed slide frames can be ranked", () => {
  for (const level of [0, 10, 255])
    assert.equal(scoreFrame(Buffer.alloc(64 * 36 * 3, level)), -Infinity);
  const pixels = Buffer.from(
    Array.from({ length: 64 * 36 * 3 }, (_, i) =>
      Math.floor(i / 3) % 3 ? 220 : 60,
    ),
  );
  assert.ok(Number.isFinite(scoreFrame(pixels)));
  assert.equal(scoreFrame(Buffer.alloc(3)), -Infinity);
});
test("media addresses cannot forward credentials to foreign hosts or embedded logins", () => {
  assert.equal(
    safeMediaUrl(cfg, "https://example.test/movie.mp4").hostname,
    "example.test",
  );
  for (const url of [
    "https://foreign.test/movie.mp4",
    "https://user:pass@example.test/movie.mp4",
    "file:///etc/passwd",
    "http://example.test/movie.mp4",
  ])
    assert.throws(() => safeMediaUrl(cfg, url));
});
test("preview jobs deduplicate, rank frames, and reuse persistent images", async (t) => {
  const cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediasite-preview-test-"),
  );
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  let captures = 0;
  const capture = async (_, seconds) => {
    captures++;
    return { seconds, score: seconds, image: Buffer.from("fixture-image") };
  };
  const service = createPreviewService({
    request: fixture(),
    capture,
    cacheDir,
  });
  const [a, b] = await Promise.all([
    service.get(cfg, "id"),
    service.get(cfg, "id"),
  ]);
  assert.equal(captures, 3);
  assert.deepEqual(a, b);
  assert.equal(a.frames[0].seconds, 2520);
  const fresh = createPreviewService({ request: fixture(), capture, cacheDir });
  assert.deepEqual(await fresh.get(cfg, "id"), a);
  assert.equal(captures, 3);
  await createPreviewService({ request: fixture(2), capture, cacheDir }).get(
    cfg,
    "id",
  );
  assert.equal(captures, 6);
  await service.get({ ...cfg, username: "another-viewer" }, "id");
  assert.equal(captures, 9);
});
test("stale downloadable media and all-black candidates do not produce previews", async (t) => {
  const cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "mediasite-preview-test-"),
  );
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  const capture = async () => ({ score: -Infinity, image: Buffer.alloc(1) });
  const service = createPreviewService({
    request: fixture(),
    capture,
    cacheDir,
  });
  const result = await service.get(cfg, "id");
  assert.deepEqual(result.frames, []);
  assert.equal(result.review.kind, "blank");
  const request = async (_, req) =>
    reply(
      req.path.includes("VideoPodcastContent")
        ? {
            value: [
              {
                ContentRevision: 1,
                Status: "Completed",
                Length: 100,
                FileLength: 100,
                DownloadUrl: "https://example.test/movie.mp4",
              },
            ],
          }
        : { ContentRevision: 2 },
    );
  await assert.rejects(
    createPreviewService({ request, capture, cacheDir }).get(cfg, "id"),
    /No current downloadable video/,
  );
  await assert.rejects(service.get(cfg, "../bad"), { status: 400 });
});
test("range proxy caches repeated media blocks and keeps credentials server-side", async () => {
  let calls = 0;
  const proxy = await mediaProxy(
    cfg,
    new URL("https://example.test/movie.mp4"),
    async (_, options) => {
      calls++;
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Range, "bytes=0-9");
      assert.equal(options.headers.sfapikey, "fixture");
      return new Response(Buffer.alloc(10), {
        status: 206,
        headers: { "content-range": "bytes 0-9/100" },
      });
    },
  );
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(proxy.url, {
        headers: { Range: "bytes=0-9" },
      });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get("sfapikey"), null);
      assert.equal((await response.arrayBuffer()).byteLength, 10);
    }
    assert.equal(calls, 1);
    assert.equal(proxy.transferred().bytes, 10);
    assert.equal((await fetch(new URL("/media", proxy.url))).status, 404);
  } finally {
    proxy.close();
  }
});
test("range proxy rejects servers that ignore seeking rather than downloading whole videos", async () => {
  const proxy = await mediaProxy(
    cfg,
    new URL("https://example.test/movie.mp4"),
    async () => new Response("not a range", { status: 200 }),
  );
  try {
    assert.equal((await fetch(proxy.url)).status, 502);
  } finally {
    proxy.close();
  }
});

// A 192x108 grayscale comparison frame with `changed` pixels altered strongly.
const detailFrame = (changed = 0) => {
  const frame = Buffer.alloc(192 * 108, 100);
  frame.fill(220, 0, changed);
  return frame;
};

test("visual review flags only recordings where nothing changes anywhere in the frame", () => {
  const image = Buffer.alloc(64 * 36 * 3, 100);
  const samples = [120, 240, 360].map((seconds) => ({
    pixels: image,
    detail: detailFrame(),
    score: 2,
    seconds,
  }));
  assert.equal(visualReview(samples).kind, "static");
  assert.match(visualReview(samples).detail, /essentially identical/);
  assert.equal(visualReview(samples.slice(0, 2)), null);
  assert.equal(
    visualReview([
      samples[0],
      samples[1],
      { ...samples[2], pixels: Buffer.alloc(image.length, 140) },
    ]).kind,
    "static",
    "the coarse thumbnail no longer decides; the detail frame does",
  );
  assert.equal(
    visualReview(samples.map(({ detail, ...s }) => s)),
    null,
    "without a comparison frame nothing is flagged",
  );
  assert.equal(
    visualReview(samples.map((s) => ({ ...s, score: -Infinity }))).kind,
    "blank",
  );
});

test("a clock tick or compression noise is still static, but new writing or movement is not", () => {
  const image = Buffer.alloc(64 * 36 * 3, 100);
  const sample = (seconds, detail) => ({
    pixels: image,
    detail,
    score: 2,
    seconds,
  });
  const pixels = 192 * 108;
  // About 0.4% of pixels changing (an idle lock screen's clock) stays flagged.
  assert.equal(
    visualReview([
      sample(1, detailFrame(0)),
      sample(2, detailFrame(Math.floor(pixels * 0.004))),
      sample(3, detailFrame(0)),
    ]).kind,
    "static",
  );
  // About 2.5% of pixels changing (a page of new handwriting) is a real lecture.
  assert.equal(
    visualReview([
      sample(1, detailFrame(0)),
      sample(2, detailFrame(Math.floor(pixels * 0.025))),
      sample(3, detailFrame(0)),
    ]),
    null,
  );
});
