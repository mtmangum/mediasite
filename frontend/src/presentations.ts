import "./theme";
import { parseCourseTitle } from "./course-title";
import {
  element,
  errorMessage,
  type Analytics,
  type Presentation,
} from "./shared";

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  );
const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
function fmtDuration(ms?: number) {
  if (!ms) return "—";
  const t = Math.round(ms / 1000),
    h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  return (
    (h ? h + ":" + String(m).padStart(2, "0") : m) +
    ":" +
    String(s).padStart(2, "0")
  );
}

interface AnalyticsState {
  data?: Analytics;
  error?: string;
  loading: boolean;
}
const analytics = new Map<string, AnalyticsState>();
const flipped = new Set<string>();
let items: Presentation[] = [];
const state = element("state");
const search = element<HTMLInputElement>("search");
function courseMarkup(p: Presentation, link = false) {
  const parsed = parseCourseTitle(p.title);
  const label = parsed.sections?.includes(",") ? "Sections" : "Section";
  return `<div class="course-heading">${parsed.course ? `<div class="course-line"><span class="course-code">${esc(parsed.course)}</span><span class="course-section">${label} ${esc(parsed.sections)}</span></div>` : ""}<h2>${link ? `<a href="${esc(p.watchUrl)}" target="_blank" rel="noopener">${esc(parsed.title)}</a>` : esc(parsed.title)}</h2></div>`;
}
function instructorMarkup(p: Presentation) {
  const instructor = parseCourseTitle(p.title).instructor;
  return `<dt>${instructor ? "Instructor" : "Presenter"}</dt><dd>${esc(instructor || p.presenter || "—")}</dd>`;
}
function render() {
  const query = search.value.toLowerCase().trim();
  const visible = items.filter((p) =>
    [p.title, p.presenter, p.folder, p.description].some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(query),
    ),
  );
  const sort = element<HTMLSelectElement>("sort").value;
  visible.sort((a, b) =>
    sort === "title"
      ? String(a.title || "").localeCompare(String(b.title || ""))
      : sort === "duration"
        ? (b.durationMs || 0) - (a.durationMs || 0)
        : (Date.parse(b.created || "") || 0) -
          (Date.parse(a.created || "") || 0),
  );
  element("count").textContent = `${visible.length} of ${items.length}`;
  state.hidden = visible.length > 0;
  state.className = "muted";
  state.textContent = items.length
    ? "No presentations match your search."
    : "No viewable presentations are available. Check your login in the API explorer connection settings.";
  element("list").innerHTML = visible
    .map(
      (p) => `
    <article class="card" data-id="${esc(p.id)}">
    <div class="card-face card-front" ${flipped.has(p.id) ? "hidden" : ""}><div class="thumb-wrap"><span aria-hidden="true">▷</span>${p.thumbnail ? `<img class="thumb" src="${esc(p.thumbnail)}" alt="" loading="lazy">` : ""}<span class="duration">${esc(fmtDuration(p.durationMs))}</span></div>
    <div class="info">
      <div class="card-meta"><span class="badge">${p.isLive ? "LIVE" : esc(p.status || "Viewable")}</span><span class="muted">${esc(p.views ?? "—")} views</span></div>
      ${courseMarkup(p, true)}
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
      <dl><dt>Recorded</dt><dd>${esc(fmtDate(p.recorded))}</dd>${instructorMarkup(p)}</dl>
      <details class="presentation-details"><summary>More details</summary><dl><dt>Uploaded</dt><dd>${esc(fmtDate(p.created))}</dd><dt>Owner</dt><dd>${esc(p.owner || "—")}</dd><dt>Folder</dt><dd>${esc(p.folder || "—")}</dd>${parseCourseTitle(p.title).schedule ? `<dt>Schedule</dt><dd>${esc(parseCourseTitle(p.title).schedule)}</dd>` : ""}<dt>Original title</dt><dd>${esc(p.title || "Untitled")}</dd></dl>${p.description ? `<p class="full-description">${esc(p.description)}</p>` : ""}</details>
      <div class="card-actions"><a class="watch" href="${esc(p.watchUrl)}" target="_blank" rel="noopener">Watch ↗</a><button class="secondary" data-action="flip" aria-label="View analytics for ${esc([parseCourseTitle(p.title).course, parseCourseTitle(p.title).title, parseCourseTitle(p.title).sections].filter(Boolean).join(", "))}">Analytics ⤾</button></div>
    </div></div>
    <div class="card-face card-back info" ${flipped.has(p.id) ? "" : "hidden"}>
      <div class="panel-head"><span class="eyebrow">Analytics</span><button class="secondary back-button" data-action="back" aria-label="Back to presentation">⤾ Back</button></div>
      ${courseMarkup(p)}
      <div class="analytics-content" aria-live="polite">${analyticsMarkup(p.id)}</div>
      <button class="secondary analytics-refresh" data-action="refresh" ${analytics.get(p.id)?.loading ? "disabled" : ""}>Refresh analytics ↻</button>
    </div></article>`,
    )
    .join("");
  document
    .querySelectorAll<HTMLImageElement>(".thumb")
    .forEach((img) => (img.onerror = () => img.remove()));
}
function metric(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}
function watchTime(seconds: number | null) {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return hours
    ? `${hours}h ${minutes}m`
    : minutes
      ? `${minutes}m ${Math.floor(seconds % 60)}s`
      : `${Math.floor(seconds)}s`;
}
function platformMarkup(title: string, rows: Analytics["browsers"]) {
  if (rows === null)
    return `<section class="platforms"><h3>${title}</h3><p class="muted">Unavailable</p></section>`;
  return `<section class="platforms"><h3>${title}</h3>${rows.length ? `<dl>${rows.map((row) => `<dt>${esc(row.name)}</dt><dd>${metric(row.views)}</dd>`).join("")}</dl>` : '<p class="muted">No viewing activity yet.</p>'}</section>`;
}
function analyticsMarkup(id: string) {
  const entry = analytics.get(id);
  if (!entry || entry.loading)
    return '<p class="analytics-state muted" role="status">Loading analytics…</p>';
  if (entry.error)
    return `<p class="analytics-state bad" role="alert">${esc(entry.error)}</p>`;
  const data = entry.data!;
  return `<div class="analytics-metrics">${[
    ["Total views", metric(data.totalViews)],
    ["Unique users", metric(data.uniqueUsers)],
    ["Time watched", watchTime(data.watchSeconds)],
    ["Peak connections", metric(data.peakConnections)],
  ]
    .map(
      ([label, value]) =>
        `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`,
    )
    .join("")}</div>
    <dl class="analytics-summary"><dt>On-demand / live</dt><dd>${metric(data.onDemandViews)} / ${metric(data.liveViews)}</dd><dt>First watched</dt><dd>${esc(fmtDate(data.firstWatched || undefined))}</dd><dt>Last watched</dt><dd>${esc(fmtDate(data.lastWatched || undefined))}</dd></dl>
    <div class="platform-grid">${platformMarkup("Browsers", data.browsers)}${platformMarkup("Operating systems", data.systems)}</div>
    ${data.warnings.length ? `<p class="muted analytics-note">Some platform data is unavailable. Summary totals are still shown.</p>` : ""}
    <p class="muted analytics-note">All-time analytics · Loaded ${esc(new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</p>
    <details class="presentation-details"><summary>API responses</summary>${data.requests.map((r) => `<p class="endpoint">${esc(r.endpoint)}<br><span class="${r.status === 200 ? "ok" : "bad"}">${r.status} · ${r.ms} ms</span></p>`).join("")}${data.warnings.map((w) => `<p class="bad">${esc(w)}</p>`).join("")}<pre class="analytics-json">${esc(JSON.stringify(data, null, 2))}</pre></details>`;
}
function updateAnalytics(id: string) {
  const card = Array.from(document.querySelectorAll<HTMLElement>(".card")).find(
    (card) => card.dataset.id === id,
  );
  if (!card) return;
  card.querySelector<HTMLElement>(".analytics-content")!.innerHTML =
    analyticsMarkup(id);
  card.querySelector<HTMLButtonElement>(".analytics-refresh")!.disabled =
    !!analytics.get(id)?.loading;
}
async function loadAnalytics(id: string, refresh = false) {
  if (analytics.get(id)?.loading || (!refresh && analytics.get(id)?.data))
    return;
  analytics.set(id, { loading: true });
  updateAnalytics(id);
  try {
    const response = await fetch(
      `/analytics.json?id=${encodeURIComponent(id)}`,
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    analytics.set(id, { loading: false, data });
  } catch (error) {
    analytics.set(id, { loading: false, error: errorMessage(error) });
  }
  updateAnalytics(id);
}
element("list").addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  const card = button?.closest<HTMLElement>(".card");
  const id = card?.dataset.id;
  if (!button || !card || !id) return;
  if (button.dataset.action === "refresh") {
    void loadAnalytics(id, true);
    return;
  }
  const back = button.dataset.action === "flip";
  if (back) flipped.add(id);
  else flipped.delete(id);
  const frontFace = card.querySelector<HTMLElement>(".card-front")!;
  const backFace = card.querySelector<HTMLElement>(".card-back")!;
  frontFace.hidden = back;
  backFace.hidden = !back;
  (back ? backFace : frontFace)
    .querySelector<HTMLButtonElement>("button[data-action]")!
    .focus({ preventScroll: true });
  if (back) void loadAnalytics(id);
});
async function load() {
  const refresh = element<HTMLButtonElement>("refresh");
  refresh.disabled = true;
  state.hidden = false;
  state.className = "muted";
  state.textContent = "Loading presentations…";
  try {
    const res = await fetch("/recent.json");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    items = data.items;
    render();
  } catch (e) {
    state.className = "bad";
    state.textContent = "Could not refresh presentations: " + errorMessage(e);
    element("count").textContent = items.length
      ? `${items.length} previously loaded`
      : "Unavailable";
  } finally {
    refresh.disabled = false;
  }
}
search.oninput = render;
element<HTMLSelectElement>("sort").onchange = render;
element<HTMLButtonElement>("refresh").onclick = load;
load();
