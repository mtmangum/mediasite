const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { callApi } = require("./mediasite");

function sampleTimes(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  return [
    ...new Set(
      [0.5, 0.7, 0.35].map((fraction) =>
        Math.max(0, Math.min(duration - 0.1, Math.round(duration * fraction))),
      ),
    ),
  ];
}
function safeMediaUrl(cfg, value) {
  const url = new URL(value);
  if (
    url.origin !== new URL(cfg.baseUrl).origin ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Unsupported preview media host");
  return url;
}
function scoreFrame(rgb) {
  if (rgb.length !== 64 * 36 * 3) return -Infinity;
  const gray = [],
    histogram = new Array(16).fill(0);
  let bright = 0,
    dark = 0,
    white = 0,
    edges = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i],
      g = rgb[i + 1],
      b = rgb[i + 2];
    const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    gray.push(luminance);
    histogram[Math.min(15, Math.floor(luminance / 16))]++;
    if (luminance > 245) bright++;
    if (luminance < 18) dark++;
    if (Math.min(r, g, b) > 180 && Math.max(r, g, b) - Math.min(r, g, b) < 30)
      white++;
  }
  const n = gray.length;
  if (dark / n > 0.9 || bright / n > 0.96) return -Infinity;
  for (let i = 1; i < n; i++)
    if (i % 64 && Math.abs(gray[i] - gray[i - 1]) > 24) edges++;
  const entropy = histogram.reduce((sum, bin) => {
    const p = bin / n;
    return p ? sum - p * Math.log2(p) : sum;
  }, 0);
  if (entropy < 0.3) return -Infinity;
  // Favor legible, detailed frames and neutral slide/whiteboard backgrounds.
  // This is a visual heuristic, not semantic recognition of wallpaper or lecture content.
  return entropy + (edges / n) * 8 + (white / n) * 2 - dark / n;
}

function visualReview(samples) {
  if (samples.length !== 3) return null;
  const seconds = samples.map((s) => s.seconds).sort((a, b) => a - b);
  if (samples.every((s) => !Number.isFinite(s.score)))
    return {
      kind: "blank",
      label: "Blank sampled frames",
      detail:
        "All three sampled frames are mostly dark or visually blank. Review the recording; this does not establish that the entire class is empty.",
      seconds,
    };
  if (
    !samples.every(
      (s) => s.pixels?.length === 64 * 36 * 3 && Number.isFinite(s.score),
    )
  )
    return null;
  for (let a = 0; a < samples.length; a++)
    for (let b = a + 1; b < samples.length; b++) {
      let difference = 0;
      for (let i = 0; i < samples[a].pixels.length; i++)
        difference += Math.abs(samples[a].pixels[i] - samples[b].pixels[i]);
      if (difference / samples[a].pixels.length >= 3) return null;
    }
  return {
    kind: "static",
    label: "Little visual change",
    detail:
      "Three frames sampled across the recording are nearly identical. This can indicate unattended capture, but a static slide or an audio-led class can also be valid. Review the sampled frames and listen before drawing a conclusion.",
    seconds,
  };
}

async function mediaProxy(cfg, source, fetchMedia = fetch) {
  let bytes = 0,
    requests = 0;
  const budget = 24 * 1024 * 1024;
  const controllers = new Set();
  const blocks = new Map();
  const route = `/${randomUUID()}`;
  const server = http.createServer(async (req, res) => {
    const controller = new AbortController();
    controllers.add(controller);
    res.on("close", () => {
      controller.abort();
      controllers.delete(controller);
    });
    try {
      if (req.url !== route || req.method !== "GET" || ++requests > 48) {
        res.writeHead(404);
        return res.end();
      }
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "bytes=0-");
      if (!match || bytes >= budget) {
        res.writeHead(416);
        return res.end();
      }
      const start = Number(match[1]);
      const stop = Math.min(
        match[2] ? Number(match[2]) : Infinity,
        start + 1024 * 1024 - 1,
        start + budget - bytes - 1,
      );
      const cacheKey = `${start}-${stop}`;
      let block = blocks.get(cacheKey);
      if (!block) {
        const headers = { Range: `bytes=${start}-${stop}` };
        if (cfg.username)
          headers.Authorization =
            "Basic " +
            Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
        if (cfg.apiKey) headers.sfapikey = cfg.apiKey;
        const up = await fetchMedia(source, {
          headers,
          redirect: "error",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
          up.headers.get("content-range") || "",
        );
        if (
          up.status !== 206 ||
          !range ||
          Number(range[1]) !== start ||
          Number(range[2]) > stop
        ) {
          await up.body?.cancel();
          res.writeHead(502);
          return res.end();
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of up.body) {
          bytes += chunk.length;
          size += chunk.length;
          if (bytes > budget || size > stop - start + 1) {
            controller.abort();
            throw new Error("Preview transfer budget exceeded");
          }
          chunks.push(chunk);
        }
        if (size !== Number(range[2]) - start + 1)
          throw new Error("Incomplete media range");
        block = {
          body: Buffer.concat(chunks),
          range: up.headers.get("content-range"),
        };
        blocks.set(cacheKey, block);
      }
      res.writeHead(206, {
        "Content-Type": "video/mp4",
        "Content-Range": block.range,
        "Content-Length": block.body.length,
        "Accept-Ranges": "bytes",
      });
      res.end(block.body);
    } catch {
      res.destroy();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}${route}`,
    close: () => {
      controllers.forEach((c) => c.abort());
      server.closeAllConnections();
      server.close();
    },
    transferred: () => ({ bytes, requests }),
  };
}
function extractFrame(
  url,
  seconds,
  executable = process.env.FFMPEG_PATH || "ffmpeg",
) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      executable,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-ss",
        String(seconds),
        "-i",
        url,
        "-an",
        "-sn",
        "-dn",
        "-filter_complex_threads",
        "1",
        "-filter_complex",
        "[0:v:0]scale=640:-2,split[image][analysis];[analysis]scale=64:36,format=rgb24[pixels]",
        "-map",
        "[image]",
        "-frames:v",
        "1",
        "-q:v",
        "3",
        "-f",
        "image2pipe",
        "pipe:1",
        "-map",
        "[pixels]",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "pipe:3",
      ],
      { stdio: ["ignore", "pipe", "ignore", "pipe"] },
    );
    const images = [],
      pixels = [];
    let size = 0;
    const timer = setTimeout(() => process.kill("SIGKILL"), 15000);
    process.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) process.kill("SIGKILL");
      else images.push(chunk);
    });
    process.stdio[3].on("data", (chunk) => {
      if (pixels.reduce((n, c) => n + c.length, 0) < 64 * 36 * 3)
        pixels.push(chunk);
    });
    process.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Video previews require FFmpeg on the server."));
    });
    process.on("close", (code) => {
      clearTimeout(timer);
      const image = Buffer.concat(images);
      if (code !== 0 || !image.length)
        return reject(new Error("Unable to sample this recording."));
      const rgb = Buffer.concat(pixels);
      resolve({ image, score: scoreFrame(rgb), pixels: rgb, seconds });
    });
  });
}
function createPreviewService({
  request = callApi,
  capture = extractFrame,
  cacheDir = path.join(__dirname, ".cache", "thumbnails"),
} = {}) {
  const jobs = new Map();
  let queue = Promise.resolve();
  async function generate(cfg, id) {
    const [presentation, podcasts] = await Promise.all([
      request(cfg, { path: `/Presentations('${id}')?$select=full` }),
      request(cfg, { path: `/Presentations('${id}')/VideoPodcastContent` }),
    ]);
    if (presentation.status !== 200 || podcasts.status !== 200)
      throw new Error("Recording preview unavailable.");
    const p = JSON.parse(presentation.body);
    const rows = JSON.parse(podcasts.body).value;
    const source = rows?.find(
      (r) =>
        r.Status === "Completed" &&
        Number(r.ContentRevision) === Number(p.ContentRevision) &&
        Number(r.Length) > 0 &&
        Number(r.FileLength) > 0 &&
        r.DownloadUrl,
    );
    if (p.IsLive || p.IsExternalVideo || !source)
      throw new Error("No current downloadable video for this preview.");
    const url = safeMediaUrl(cfg, source.DownloadUrl);
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          cfg.baseUrl,
          cfg.username,
          cfg.password,
          cfg.apiKey,
          id,
          source.ContentRevision,
          source.LastModified,
          source.DownloadUrl,
          "v4",
        ]),
      )
      .digest("hex");
    const file = path.join(cacheDir, key + ".json");
    try {
      const stored = JSON.parse(await fs.readFile(file, "utf8"));
      if (
        stored.created > Date.now() - 7 * 24 * 60 * 60 * 1000 &&
        Array.isArray(stored.frames) &&
        (stored.frames.length || stored.review)
      ) {
        await fs.utimes(file, new Date(), new Date());
        return {
          frames: stored.frames.map((f) => ({
            ...f,
            image: Buffer.from(f.image, "base64"),
          })),
          review: stored.review || null,
        };
      }
    } catch {
      /* cache miss */
    }
    const proxy = await mediaProxy(cfg, url);
    const samples = [];
    try {
      for (const seconds of sampleTimes(Number(source.Length) / 1000)) {
        try {
          const frame = await capture(proxy.url, seconds);
          samples.push(frame);
        } catch {
          /* try the next sampled position */
        }
      }
    } finally {
      proxy.close();
    }
    const review = visualReview(samples);
    const frames = samples
      .filter((f) => Number.isFinite(f.score))
      .map(({ pixels, ...frame }) => frame);
    if (!frames.length && !review)
      throw new Error("No usable preview frames were found.");
    frames.sort((a, b) => b.score - a.score);
    try {
      await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
      await fs.writeFile(
        file,
        JSON.stringify({
          created: Date.now(),
          review,
          frames: frames.map((f) => ({
            ...f,
            image: f.image.toString("base64"),
          })),
        }),
        { mode: 0o600 },
      );
      // Bound the persistent cache to the 100 most recently used recordings.
      const files = (await fs.readdir(cacheDir)).filter((name) =>
        /^[a-f0-9]{64}\.json$/.test(name),
      );
      if (files.length > 100) {
        const ages = await Promise.all(
          files.map(async (name) => ({
            name,
            time: (await fs.stat(path.join(cacheDir, name))).mtimeMs,
          })),
        );
        ages.sort((a, b) => b.time - a.time);
        await Promise.all(
          ages.slice(100).map((f) => fs.unlink(path.join(cacheDir, f.name))),
        );
      }
    } catch {
      /* Preview images remain usable if persistent caching is unavailable. */
    }
    return { frames, review };
  }
  return {
    get(cfg, id) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id || ""))
        return Promise.reject(
          Object.assign(new Error("Invalid presentation ID"), { status: 400 }),
        );
      const scope = createHash("sha256")
        .update(JSON.stringify(cfg))
        .digest("hex");
      const key = `${scope}:${id}`;
      let entry = jobs.get(key);
      if (!entry || entry.expires < Date.now()) {
        if (jobs.size >= 100) jobs.delete(jobs.keys().next().value);
        const promise = queue.then(() => generate(cfg, id));
        queue = promise.catch(() => {});
        entry = { promise, expires: Date.now() + 5 * 60 * 1000 };
        jobs.set(key, entry);
      }
      return entry.promise;
    },
    clear() {
      jobs.clear();
    },
  };
}
module.exports = {
  mediaProxy,
  visualReview,
  sampleTimes,
  safeMediaUrl,
  scoreFrame,
  createPreviewService,
};
