const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isRecent } = require("../static");

test("the presentations page serves the list and per-presentation chart links", () => {
  for (const path of [
    "/recent",
    "/recent/",
    "/recent/ee17f8d604b24829bb6974f8e12367ba1d/charts",
    "/recent/abc_DEF-123/charts/",
  ])
    assert.equal(isRecent(path), true, path);
  for (const path of [
    "/",
    "/recent/abc",
    "/recent/abc/charts/more",
    "/recent//charts",
    "/recent/a b/charts",
    "/recently",
    "/recent.json",
    "/x/recent",
  ])
    assert.equal(isRecent(path), false, path);
});
