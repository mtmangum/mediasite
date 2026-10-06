const { callApi } = require("./mediasite");
const shortRecordingMs = 20 * 60 * 1000;
const number = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim()))
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
function durationWarnings(p) {
  if (p.IsLive) return [];
  const duration = number(p.Duration);
  if (duration === null || duration === 0)
    return [
      {
        code: "duration-missing",
        label: "Duration unavailable",
        detail: "The API does not report a positive recording duration.",
        severity: "notice",
      },
    ];
  return duration < shortRecordingMs
    ? [
        {
          code: "short",
          label: "Under 20 min",
          detail:
            "This recording is shorter than the 20-minute review threshold. A short recording may be intentional.",
          severity: "warning",
        },
      ]
    : [];
}
function evaluateRecording(p, media, audio) {
  const warnings = durationWarnings(p);
  if (p.IsLive || p.IsExternalVideo)
    return {
      warnings,
      media: p.IsLive
        ? "Live recording — file checks do not apply yet."
        : "External video — local file checks do not apply.",
      audio: "Audio checks do not apply.",
      fetchedAt: new Date().toISOString(),
    };
  const current = (rows) =>
    rows === null
      ? null
      : rows.filter(
          (r) =>
            number(p.ContentRevision) === null ||
            number(r.ContentRevision) === number(p.ContentRevision),
        );
  const files = current(media),
    peaks = current(audio);
  let mediaNote, audioNote;
  if (files === null) {
    mediaNote = "Media-file metadata is unavailable.";
    warnings.push({
      code: "media-unknown",
      label: "Files not verified",
      detail: mediaNote,
      severity: "notice",
    });
  } else if (
    files?.some(
      (r) =>
        r.Status === "Completed" &&
        /^(video|audio)\//i.test(r.ContentMimeType || "") &&
        number(r.FileLength) > 0 &&
        number(r.Length) > 0,
    )
  )
    mediaNote =
      "Completed media with positive file size and duration is available.";
  else if (
    p.IsHeadRevisionContentComplete === false ||
    files?.some(
      (r) => r.Status && r.Status !== "Completed" && r.Status !== "Failed",
    )
  ) {
    mediaNote =
      "Media is still processing; usable files have not been confirmed.";
    warnings.push({
      code: "processing",
      label: "Media processing",
      detail: mediaNote,
      severity: "notice",
    });
  } else {
    mediaNote =
      "No completed audio/video file with a positive size and duration was reported for the current revision.";
    warnings.push({
      code: "media-missing",
      label: "No usable media",
      detail: mediaNote,
      severity: "warning",
    });
  }
  const completed = peaks?.filter((r) => r.Status === "Completed") || [];
  if (
    completed.some(
      (r) =>
        number(r.Channels) > 0 &&
        number(r.PeakCount) > 0 &&
        number(r.FileLength) > 0,
    )
  )
    audioNote =
      "Audio waveform metadata is available. It does not establish whether speech is audible or the recording is silent.";
  else if (
    completed.length &&
    completed.every(
      (r) => number(r.Channels) === 0 || number(r.PeakCount) === 0,
    )
  ) {
    audioNote =
      "Completed waveform metadata reports no audio channels or samples. Review the recording to confirm.";
    warnings.push({
      code: "audio-empty",
      label: "No audio samples reported",
      detail: audioNote,
      severity: "warning",
    });
  } else {
    audioNote =
      "A completed audio waveform is unavailable. This does not prove the recording has no sound.";
    warnings.push({
      code: "audio-unknown",
      label: "Audio not verified",
      detail: audioNote,
      severity: "notice",
    });
  }
  return {
    warnings,
    media: mediaNote,
    audio: audioNote,
    fetchedAt: new Date().toISOString(),
  };
}
async function getRecordingHealth(cfg, id, request = callApi) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id || ""))
    throw Object.assign(new Error("Invalid presentation ID"), { status: 400 });
  const path = `/Presentations('${id}')`;
  const result = await request(cfg, { path: `${path}?$select=full` });
  if (result.status !== 200)
    throw Object.assign(
      new Error(`Recording metadata unavailable (HTTP ${result.status}).`),
      { status: result.status },
    );
  const p = JSON.parse(result.body);
  if (p.IsLive || p.IsExternalVideo) return evaluateRecording(p, null, null);
  const rows = async (nav) => {
    try {
      const r = await request(cfg, { path: `${path}/${nav}?$top=1000` });
      if (r.status !== 200) return null;
      const body = JSON.parse(r.body);
      // Never interpret a truncated or malformed collection as missing media.
      return Array.isArray(body.value) &&
        !body["@odata.nextLink"] &&
        !body["odata.nextLink"]
        ? body.value
        : null;
    } catch {
      return null;
    }
  };
  const [media, audio] = await Promise.all([
    rows("OnDemandContent"),
    rows("AudioPeaksContent"),
  ]);
  return evaluateRecording(p, media, audio);
}
module.exports = { durationWarnings, evaluateRecording, getRecordingHealth };
