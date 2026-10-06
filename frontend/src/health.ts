import { esc } from "./format";
import { fetchJson } from "./http";
import { findPresentation } from "./store";
import {
  errorMessage,
  type Loadable,
  type Presentation,
  type RecordingHealth,
  type RecordingWarning,
} from "./shared";

const CHECK_TTL_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_CHECKS = 2;

const recordingHealth = new Map<string, Loadable<RecordingHealth>>();
const healthQueue = new Set<string>();
let activeChecks = 0;
// Visual-review flags come from frame previews rather than the health endpoint.
export const previewWarnings = new Map<string, RecordingWarning>();

const WARN_ICON =
  '<svg class="warn-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M8 1.5 15 14H1z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v4" stroke="var(--panel)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.8" r="0.9" fill="var(--panel)"/></svg> ';

export function healthMarkup(p: Presentation) {
  const entry = recordingHealth.get(p.id);
  const warnings = [
    ...(entry?.data?.warnings || p.recordingWarnings || []),
    ...(previewWarnings.has(p.id) ? [previewWarnings.get(p.id)!] : []),
  ];
  const label = warnings.length
    ? `${warnings[0].label}${warnings.length > 1 ? ` +${warnings.length - 1}` : ""}`
    : entry?.error
      ? "Recording checks unavailable"
      : entry?.data
        ? "Recording checks"
        : "Checking recording…";
  const classes = [
    "recording-health",
    warnings.some((w) => w.severity === "warning") && "has-warning",
    !entry?.data && !entry?.error && "checking",
  ]
    .filter(Boolean)
    .join(" ");
  const details = entry?.data
    ? `<p><strong>Files:</strong> ${esc(entry.data.media)}</p><p><strong>Audio:</strong> ${esc(entry.data.audio)}</p>`
    : `<p>${esc(entry?.error || "Media and audio-waveform metadata are being checked.")}</p>`;
  return `<details class="${classes}"><summary>${warnings.length ? WARN_ICON : ""}${esc(label)}</summary><div>${warnings.map((w) => `<p><strong>${esc(w.label)}.</strong> ${esc(w.detail)}</p>`).join("")}${details}</div></details>`;
}

export function updateHealth(id: string) {
  const slot = Array.from(
    document.querySelectorAll<HTMLElement>("[data-health]"),
  ).find((e) => e.dataset.health === id);
  const p = findPresentation(id);
  if (slot && p) {
    const wasOpen = slot.querySelector("details")?.open;
    const hadFocus = slot.contains(document.activeElement);
    slot.innerHTML = healthMarkup(p);
    if (wasOpen) slot.querySelector("details")!.open = true;
    if (hadFocus) slot.querySelector("summary")!.focus({ preventScroll: true });
  }
}

// Only visible cards are checked, with a couple of requests in flight at a time.
export function queueHealth(pageItems: Presentation[]) {
  healthQueue.clear();
  pageItems.forEach((p) => {
    const entry = recordingHealth.get(p.id);
    if (
      !entry ||
      (entry.data &&
        Date.now() - Date.parse(entry.data.fetchedAt) > CHECK_TTL_MS)
    )
      healthQueue.add(p.id);
  });
  const pump = () => {
    while (activeChecks < MAX_CONCURRENT_CHECKS && healthQueue.size) {
      const id = healthQueue.values().next().value!;
      healthQueue.delete(id);
      activeChecks++;
      recordingHealth.set(id, { loading: true });
      void (async () => {
        try {
          const data = await fetchJson<RecordingHealth>(
            `/health.json?id=${encodeURIComponent(id)}`,
          );
          recordingHealth.set(id, { loading: false, data });
        } catch (error) {
          recordingHealth.set(id, {
            loading: false,
            error: errorMessage(error),
          });
        }
        updateHealth(id);
        activeChecks--;
        pump();
      })();
    }
  };
  pump();
}
