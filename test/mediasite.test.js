const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { getConfig, authHeaders, callApi } = require("../mediasite");

const clearEnv = () => {
  for (const key of [
    "MEDIASITE_BASE_URL",
    "MEDIASITE_USERNAME",
    "MEDIASITE_PASSWORD",
    "MEDIASITE_API_KEY",
  ])
    delete process.env[key];
};

test("config falls back to the default site and trims trailing slashes", (t) => {
  clearEnv();
  t.after(clearEnv);
  assert.equal(
    getConfig().baseUrl,
    "https://utengr.mediasite.com/Mediasite/Api/v1",
  );
  process.env.MEDIASITE_BASE_URL = "https://example.test/Api/v1///";
  assert.equal(getConfig().baseUrl, "https://example.test/Api/v1");
});

test("overrides win over the environment, and blanks are respected", (t) => {
  clearEnv();
  t.after(clearEnv);
  process.env.MEDIASITE_USERNAME = "env-user";
  process.env.MEDIASITE_API_KEY = "env-key";
  assert.equal(getConfig().username, "env-user");
  assert.equal(getConfig({ username: "ui-user" }).username, "ui-user");
  assert.equal(
    getConfig({ username: "" }).username,
    "",
    "an explicit empty override clears the environment value",
  );
  assert.equal(getConfig({}).apiKey, "env-key");
});

test("auth headers combine Basic auth and the API key only when set", () => {
  assert.deepEqual(authHeaders({ username: "", password: "", apiKey: "" }), {});
  assert.deepEqual(authHeaders({ username: "", password: "x", apiKey: "k" }), {
    sfapikey: "k",
  });
  const both = authHeaders({ username: "ann", password: "p:w", apiKey: "k" });
  assert.equal(
    both.Authorization,
    "Basic " + Buffer.from("ann:p:w").toString("base64"),
  );
  assert.equal(both.sfapikey, "k");
});

test("callApi sends credentials, normalizes the path, and reports timing", async (t) => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers, method: req.method });
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const cfg = {
    baseUrl: `http://127.0.0.1:${server.address().port}/Api/v1`,
    username: "ann",
    password: "secret",
    apiKey: "key-1",
  };

  const result = await callApi(cfg, { path: "Home" });
  assert.equal(seen[0].url, "/Api/v1/Home", "a leading slash is added");
  assert.equal(seen[0].headers.sfapikey, "key-1");
  assert.match(seen[0].headers.authorization, /^Basic /);
  assert.equal(seen[0].headers.accept, "application/json");
  assert.equal(result.status, 201);
  assert.equal(result.body, '{"ok":true}');
  assert.equal(typeof result.ms, "number");
  assert.match(result.contentType, /json/);

  await callApi(cfg, { method: "POST", path: "/Things", body: '{"a":1}' });
  assert.equal(seen[1].method, "POST");
  assert.equal(seen[1].headers["content-type"], "application/json");
});
