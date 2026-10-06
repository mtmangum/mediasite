// CLI smoke test: `npm run smoke`
const { getConfig, callApi } = require("./mediasite");

const cfg = getConfig();
const authed = !!cfg.apiKey; // the key alone is enough on this site; username/password are optional
const loggedIn = !!(cfg.apiKey && cfg.username); // Folders/UserProfiles need a user login too

// expect: status the check should return in this configuration
const checks = [
  {
    name: "Home (anonymous)",
    path: "/Home",
    expect: 200,
    validate: (j) => !!j.SiteName,
  },
  { name: "$metadata (anonymous)", path: "/$metadata", expect: 200 },
  {
    name: "Presentations",
    path: "/Presentations?$top=3",
    expect: authed ? 200 : 401,
    validate: (j) => Array.isArray(j.value),
  },
  {
    name: "Folders",
    path: "/Folders?$top=3",
    expect: loggedIn ? 200 : 401,
    validate: (j) => Array.isArray(j.value),
  },
  {
    name: "UserProfiles",
    path: "/UserProfiles?$top=3",
    expect: loggedIn ? 200 : 401,
    validate: (j) => Array.isArray(j.value),
  },
];

(async () => {
  console.log(`Base: ${cfg.baseUrl}`);
  console.log(
    authed
      ? `Auth: API key${cfg.username ? " + " + cfg.username : ""}\n`
      : "Auth: none configured (protected endpoints are expected to return 401)\n",
  );
  let failed = 0;
  let presentationId;
  for (const c of checks) {
    let line,
      ok = false;
    try {
      const r = await callApi(cfg, { path: c.path });
      ok = r.status === c.expect;
      if (ok && c.validate && r.status === 200) {
        try {
          ok = c.validate(JSON.parse(r.body));
        } catch {
          ok = false;
        }
      }
      if (c.name === "Presentations" && r.status === 200)
        presentationId = JSON.parse(r.body).value?.[0]?.Id;
      line = `${r.status} (expected ${c.expect}) ${r.ms}ms`;
    } catch (e) {
      line = `error: ${e.message}`;
    }
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(24)} ${line}`);
  }
  if (presentationId) {
    const base = `/PresentationAnalytics('${presentationId}')`;
    const analyticsChecks = [
      {
        name: "Presentation analytics",
        path: base,
        validate: (j) =>
          j.PresentationId === presentationId && Number.isFinite(j.TotalViews),
      },
      ...["BrowserTotals", "SystemTotals", "ViewingTrends"].map((name) => ({
        name,
        path: `${base}/${name}?$top=5`,
        validate: (j) => Array.isArray(j.value),
      })),
    ];
    for (const c of analyticsChecks) {
      checks.push(c);
      try {
        const r = await callApi(cfg, { path: c.path });
        const ok = r.status === 200 && c.validate(JSON.parse(r.body));
        if (!ok) failed++;
        console.log(
          `${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(24)} ${r.status} (expected 200) ${r.ms}ms`,
        );
      } catch (error) {
        failed++;
        console.log(`FAIL  ${c.name.padEnd(24)} ${error.message}`);
      }
    }
  } else
    console.log("SKIP  Analytics checks: no visible presentation available.");
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed ? 1 : 0);
})();
