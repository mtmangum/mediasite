// Local web UI + proxy. Credentials stay server-side; the browser never sees them.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getConfig, callApi } = require('./mediasite');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
let overrides = {}; // set from the UI, held in memory only

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  req.on('error', reject);
});

const sendJson = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/recent') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(path.join(PUBLIC, 'recent.html')));
    }

    if (req.method === 'GET' && req.url === '/recent.json') {
      const cfg = getConfig(overrides);
      const r = await callApi(cfg, { path: "/Presentations?$top=5&$filter=Status eq 'Viewable'&$orderby=CreationDate desc&$select=full" });
      if (r.status !== 200) return sendJson(res, r.status, { error: `Mediasite returned ${r.status} ${r.statusText}` });
      const items = (JSON.parse(r.body).value || []).map((p) => ({
        id: p.Id, title: p.Title, description: p.Description, status: p.Status,
        created: p.CreationDate, recorded: p.RecordDate, durationMs: p.Duration,
        owner: p.Owner, presenter: p.PrimaryPresenter, views: p.NumberOfViews,
        folder: p.ParentFolderName, isLive: p.IsLive,
        thumbnail: p.ThumbnailUrl ? '/thumb?u=' + encodeURIComponent(p.ThumbnailUrl) : null,
        watchUrl: cfg.baseUrl.replace(/\/Api\/v1$/i, '') + '/Play/' + p.Id,
      }));
      return sendJson(res, 200, { items });
    }

    if (req.method === 'GET' && req.url.startsWith('/thumb?')) {
      // Proxy thumbnails with credentials, but only for the configured Mediasite host.
      const cfg = getConfig(overrides);
      const target = new URL(new URLSearchParams(req.url.slice(7)).get('u'), cfg.baseUrl);
      if (target.origin !== new URL(cfg.baseUrl).origin) return sendJson(res, 400, { error: 'Foreign host' });
      const headers = {};
      if (cfg.username) headers.Authorization = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
      if (cfg.apiKey) headers.sfapikey = cfg.apiKey;
      const up = await fetch(target, { headers, signal: AbortSignal.timeout(30000) });
      res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=300' });
      return res.end(Buffer.from(await up.arrayBuffer()));
    }

    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(path.join(PUBLIC, 'index.html')));
    }

    if (req.url === '/config') {
      if (req.method === 'POST') overrides = JSON.parse(await readBody(req) || '{}');
      const cfg = getConfig(overrides);
      return sendJson(res, 200, {
        baseUrl: cfg.baseUrl,
        username: cfg.username,
        hasPassword: !!cfg.password,
        hasApiKey: !!cfg.apiKey,
      });
    }

    if (req.method === 'POST' && req.url === '/request') {
      const { method, path: apiPath, body, contentType } = JSON.parse(await readBody(req));
      const result = await callApi(getConfig(overrides), { method, path: apiPath, body, contentType });
      return sendJson(res, 200, result);
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.name === 'TimeoutError' ? 'Request timed out' : err.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Mediasite API tester: http://localhost:${PORT}`));
