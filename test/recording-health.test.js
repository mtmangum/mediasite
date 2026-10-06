const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  durationWarnings,
  evaluateRecording,
  getRecordingHealth,
} = require("../recording-health");
const p = {
  Duration: 3600000,
  ContentRevision: 2,
  IsHeadRevisionContentComplete: true,
};
const file = {
  ContentRevision: 2,
  Status: "Completed",
  ContentMimeType: "video/mp4",
  FileLength: "10000",
  Length: "3600000",
};
const waveform = {
  ContentRevision: 2,
  Status: "Completed",
  Channels: 2,
  PeakCount: "100",
  FileLength: "1200",
};
const codes = (data) => data.warnings.map((w) => w.code);
test("short recordings use a strict 20-minute threshold and exclude live recordings", () => {
  assert.deepEqual(
    codes({ warnings: durationWarnings({ Duration: 1199999 }) }),
    ["short"],
  );
  assert.deepEqual(durationWarnings({ Duration: 1200000 }), []);
  assert.deepEqual(durationWarnings({ Duration: 10000, IsLive: true }), []);
  for (const Duration of [null, undefined, "", false, 0])
    assert.equal(durationWarnings({ Duration })[0].code, "duration-missing");
});
test("usable current media and waveform metadata generate no warning", () => {
  const data = evaluateRecording(p, [file], [waveform]);
  assert.deepEqual(data.warnings, []);
  assert.match(data.audio, /does not establish/);
});
test("missing waveform remains unverified instead of a claim of silence", () => {
  const data = evaluateRecording(p, [file], []);
  assert.deepEqual(codes(data), ["audio-unknown"]);
  assert.match(data.audio, /does not prove/);
});
test("old revisions and zero-size files cannot establish usable media", () => {
  for (const files of [
    [],
    [{ ...file, FileLength: 0 }],
    [{ ...file, ContentRevision: 1 }],
  ])
    assert.ok(
      codes(evaluateRecording(p, files, [waveform])).includes("media-missing"),
    );
});
test("unavailable metadata and processing are distinguished from missing files", () => {
  assert.deepEqual(codes(evaluateRecording(p, null, null)), [
    "media-unknown",
    "audio-unknown",
  ]);
  assert.ok(
    codes(
      evaluateRecording({ ...p, IsHeadRevisionContentComplete: false }, [], []),
    ).includes("processing"),
  );
});
test("empty audio samples are reported only with completed explicit evidence", () => {
  assert.ok(
    codes(
      evaluateRecording(p, [file], [{ ...waveform, PeakCount: 0 }]),
    ).includes("audio-empty"),
  );
  assert.ok(
    codes(
      evaluateRecording(
        p,
        [file],
        [{ ...waveform, Status: "Pending", PeakCount: 0 }],
      ),
    ).includes("audio-unknown"),
  );
});
test("live and external media skip inapplicable file checks", async () => {
  for (const flag of ["IsLive", "IsExternalVideo"]) {
    let requests = 0;
    const data = await getRecordingHealth({}, "id", async () => {
      requests++;
      return { status: 200, body: JSON.stringify({ ...p, [flag]: true }) };
    });
    assert.equal(requests, 1);
    assert.deepEqual(data.warnings, []);
  }
});
test("denied or paginated metadata is never interpreted as missing media", async () => {
  const data = await getRecordingHealth({}, "id", async (_, req) => ({
    status: req.path.includes("AudioPeaks") ? 403 : 200,
    body: JSON.stringify(
      req.path.includes("OnDemand")
        ? { value: [], "odata.nextLink": "next" }
        : p,
    ),
  }));
  assert.deepEqual(codes(data), ["media-unknown", "audio-unknown"]);
});
test("invalid IDs are rejected before a request", async () => {
  await assert.rejects(
    getRecordingHealth({}, "../bad", () => {
      throw Error("unexpected");
    }),
    { status: 400 },
  );
});
