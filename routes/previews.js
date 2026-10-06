const { sendJson } = require("../http-utils");

const loadPreview = (req, res, ctx, url, respond) =>
  ctx.previews
    .get(ctx.config(), url.searchParams.get("id"))
    .then((preview) => respond(preview))
    .catch((error) =>
      sendJson(res, error.status || 503, { error: error.message }),
    );

function previewJson(req, res, ctx, url) {
  const id = url.searchParams.get("id");
  return loadPreview(req, res, ctx, url, ({ frames, review }) =>
    sendJson(res, 200, {
      review,
      frames: frames.map((f, index) => ({
        seconds: f.seconds,
        url: `/preview?id=${encodeURIComponent(id)}&frame=${index}`,
      })),
    }),
  );
}

function previewImage(req, res, ctx, url) {
  return loadPreview(req, res, ctx, url, ({ frames }) => {
    const index = Number(url.searchParams.get("frame") || 0);
    if (!Number.isInteger(index) || index < 0 || index >= frames.length)
      return sendJson(res, 400, { error: "Invalid preview frame" });
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
    });
    return res.end(frames[index].image);
  });
}

module.exports = [
  { method: "GET", path: "/preview.json", handler: previewJson },
  { method: "GET", path: "/preview", handler: previewImage },
];
