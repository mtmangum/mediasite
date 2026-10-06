const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {
  getConfig,
  configProblem,
  authHeaders,
  callApi,
} = require("../mediasite");

const clearEnv = () => {
  for (const key of [
    "MEDIASITE_BASE_URL",
    "MEDIASITE_USERNAME",
    "MEDIASITE_PASSWORD",
    "MEDIASITE_API_KEY",
  ])
    delete process.env[key];
};

test("config has no default site and trims trailing slashes", (t) => {
  clearEnv();
  t.after(clearEnv);
  assert.equal(getConfig().baseUrl, "");
  assert.match(configProblem(getConfig()), /base URL/);
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

test("the base URL must be https (or loopback http) without credentials", () => {
  const problem = (baseUrl) => configProblem({ baseUrl });
  assert.equal(problem("https://media.example.edu/Mediasite/Api/v1"), null);
  assert.equal(problem("http://localhost:8080/Api/v1"), null);
  assert.match(problem("http://media.example.edu/Api/v1"), /https/);
  assert.match(problem("https://user:pw@media.example.edu/Api/v1"), /username/);
  assert.match(problem("not a url"), /valid/);
});

test("API calls refuse to run without a usable base URL", async () => {
  await assert.rejects(
    callApi({ baseUrl: "", username: "", password: "", apiKey: "" }, {}),
    { status: 400, message: /base URL/ },
  );
});

test("API calls refuse redirects instead of forwarding the key", async (t) => {
  const redirector = http.createServer((req, res) => {
    res.writeHead(302, { Location: "http://127.0.0.1:1/elsewhere" });
    res.end();
  });
  await new Promise((resolve) => redirector.listen(0, "127.0.0.1", resolve));
  t.after(() => redirector.close());
  await assert.rejects(
    callApi(
      {
        baseUrl: `http://127.0.0.1:${redirector.address().port}/Api/v1`,
        apiKey: "secret",
      },
      {},
    ),
  );
});
