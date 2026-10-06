// Shared helper: builds an authenticated request against the Mediasite API.
const DEFAULT_BASE = 'https://utengr.mediasite.com/Mediasite/Api/v1';

function getConfig(overrides = {}) {
  return {
    baseUrl: (overrides.baseUrl || process.env.MEDIASITE_BASE_URL || DEFAULT_BASE).replace(/\/+$/, ''),
    username: overrides.username ?? process.env.MEDIASITE_USERNAME ?? '',
    password: overrides.password ?? process.env.MEDIASITE_PASSWORD ?? '',
    apiKey: overrides.apiKey ?? process.env.MEDIASITE_API_KEY ?? '',
  };
}

async function callApi(cfg, { method = 'GET', path = '/Home', body, contentType }) {
  const headers = { Accept: 'application/json' };
  if (cfg.username) {
    headers.Authorization = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  }
  if (cfg.apiKey) headers.sfapikey = cfg.apiKey;
  if (body) headers['Content-Type'] = contentType || 'application/json';

  const url = cfg.baseUrl + (path.startsWith('/') ? path : '/' + path);
  const started = performance.now();
  const res = await fetch(url, { method, headers, body: body || undefined, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  return {
    url,
    status: res.status,
    statusText: res.statusText,
    ms: Math.round(performance.now() - started),
    contentType: res.headers.get('content-type') || '',
    body: text,
  };
}

module.exports = { getConfig, callApi };
