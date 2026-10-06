import "./theme";
import { parseCourseTitle } from "./course-title";
import { renderViewingCharts } from "./viewing-charts";
import {
  element,
  errorMessage,
  type Analytics,
  type Presentation,
  type ViewingCharts,
  type RecordingHealth,
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
const recordingHealth = new Map<
  string,
  { data?: RecordingHealth; error?: string; loading: boolean }
>();
const healthQueue = new Set<string>();
let activeChecks = 0;
function healthMarkup(p: Presentation) {
  const entry = recordingHealth.get(p.id);
  const warnings = entry?.data?.warnings || p.recordingWarnings || [];
  const label = warnings.length
    ? `${warnings[0].label}${warnings.length > 1 ? ` +${warnings.length - 1}` : ""}`
    : entry?.error
      ? "Recording checks unavailable"
      : entry?.data
        ? "Recording checks"
        : "Checking recording…";
  return `<details class="recording-health ${warnings.some((w) => w.severity === "warning") ? "has-warning" : ""}"><summary>${warnings.length ? '<span aria-hidden="true">△</span> ' : ""}${esc(label)}</summary><div>${warnings.map((w) => `<p><strong>${esc(w.label)}.</strong> ${esc(w.detail)}</p>`).join("")}${entry?.data ? `<p><strong>Files:</strong> ${esc(entry.data.media)}</p><p><strong>Audio:</strong> ${esc(entry.data.audio)}</p>` : `<p>${esc(entry?.error || "Media and audio-waveform metadata are being checked.")}</p>`}</div></details>`;
}
function updateHealth(id: string) {
  const slot = Array.from(
    document.querySelectorAll<HTMLElement>("[data-health]"),
  ).find((e) => e.dataset.health === id);
  const p = items.find((p) => p.id === id);
  if (slot && p) slot.innerHTML = healthMarkup(p);
}
function queueHealth(pageItems: Presentation[]) {
  // Only visible cards are checked, with two requests in flight at a time.
  healthQueue.clear();
  pageItems.forEach((p) => {
    const entry = recordingHealth.get(p.id);
    if (
      !entry ||
      (entry.data &&
        Date.now() - Date.parse(entry.data.fetchedAt) > 5 * 60 * 1000)
    )
      healthQueue.add(p.id);
  });
  const pump = () => {
    while (activeChecks < 2 && healthQueue.size) {
      const id = healthQueue.values().next().value!;
      healthQueue.delete(id);
      activeChecks++;
      recordingHealth.set(id, { loading: true });
      void (async () => {
        try {
          const response = await fetch(
            `/health.json?id=${encodeURIComponent(id)}`,
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || response.statusText);
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
const analytics = new Map<string, AnalyticsState>();
const viewing = new Map<
  string,
  { data?: ViewingCharts; error?: string; loading: boolean }
>();
const dialog = element<HTMLDialogElement>("analyticsDialog");
let expandedId: string | null = null;
const flipped = new Set<string>();
let items: Presentation[] = [];
const pageSize = 9;
let currentPage = 1;
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
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  currentPage = Math.min(currentPage, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageItems = visible.slice(start, start + pageSize);
  element("paginationTop").hidden = visible.length === 0;
  element("pagination").hidden = visible.length === 0;
  element("pageRange").textContent = visible.length
    ? `Showing ${start + 1}–${start + pageItems.length} of ${visible.length} · Page ${currentPage} of ${pageCount}`
    : "";
  const pageControls = `<button class="secondary" data-page="${currentPage - 1}" aria-label="Previous page" title="Previous page" ${currentPage === 1 ? "disabled" : ""}>←<span class="page-label"> Previous</span></button>${Array.from(
    { length: pageCount },
    (_, index) => {
      const page = index + 1;
      return `<button class="secondary page-number" data-page="${page}" aria-label="Page ${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`;
    },
  ).join(
    "",
  )}<button class="secondary" data-page="${currentPage + 1}" aria-label="Next page" title="Next page" ${currentPage === pageCount ? "disabled" : ""}><span class="page-label">Next </span>→</button>`;
  document
    .querySelectorAll<HTMLElement>("[data-page-controls]")
    .forEach((controls) => (controls.innerHTML = pageControls));
  state.hidden = visible.length > 0;
  state.className = "muted";
  state.textContent = items.length
    ? "No presentations match your search."
    : "No viewable presentations are available. Check your login in the API explorer connection settings.";
  element("list").innerHTML = pageItems
    .map(
      (p) => `
    <article class="card" data-id="${esc(p.id)}" data-flipped="${flipped.has(p.id)}">
    <div class="card-body"><div class="card-face card-front" ${flipped.has(p.id) ? 'inert aria-hidden="true"' : ""}><div class="thumb-wrap"><span aria-hidden="true">▷</span>${p.thumbnail ? `<img class="thumb" src="${esc(p.thumbnail)}" alt="" loading="lazy">` : ""}<span class="duration">${esc(fmtDuration(p.durationMs))}</span></div>
    <div class="info">
      <div class="card-meta"><span class="badge">${p.isLive ? "LIVE" : esc(p.status || "Viewable")}</span><span class="muted">${esc(p.views ?? "—")} views</span></div>
      ${courseMarkup(p, true)}
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
      <dl><dt>Recorded</dt><dd>${esc(fmtDate(p.recorded))}</dd>${instructorMarkup(p)}</dl>
      <div data-health="${esc(p.id)}">${healthMarkup(p)}</div>
      <details class="presentation-details"><summary>More details</summary><dl><dt>Uploaded</dt><dd>${esc(fmtDate(p.created))}</dd><dt>Owner</dt><dd>${esc(p.owner || "—")}</dd><dt>Folder</dt><dd>${esc(p.folder || "—")}</dd>${parseCourseTitle(p.title).schedule ? `<dt>Schedule</dt><dd>${esc(parseCourseTitle(p.title).schedule)}</dd>` : ""}<dt>Original title</dt><dd>${esc(p.title || "Untitled")}</dd></dl>${p.description ? `<p class="full-description">${esc(p.description)}</p>` : ""}</details>
    </div>
    <div class="card-actions">
      <a class="watch" href="${esc(p.watchUrl)}" target="_blank" rel="noopener">Watch ↗</a>
      <button class="secondary flip-button" data-action="flip" aria-label="View analytics for ${esc([parseCourseTitle(p.title).course, parseCourseTitle(p.title).title, parseCourseTitle(p.title).sections].filter(Boolean).join(", "))}">Analytics ⤾</button>
    </div></div>
    <div class="card-face card-back" ${flipped.has(p.id) ? "" : 'inert aria-hidden="true"'}>
    <div class="info card-back-content">
      <div class="panel-head"><span class="eyebrow">Analytics</span></div>
      ${courseMarkup(p)}
      <div class="analytics-content" aria-live="polite">${analyticsMarkup(p.id)}</div>
    </div>
    <div class="card-actions">
      <button class="secondary analytics-refresh" data-action="refresh" ${analytics.get(p.id)?.loading ? "disabled" : ""}>Refresh ↻</button>
      <button class="secondary flip-button" data-action="flip" aria-label="Back to presentation">Back ⤾</button>
    </div></div></div></article>`,
    )
    .join("");
  document
    .querySelectorAll<HTMLImageElement>(".thumb")
    .forEach((img) => (img.onerror = () => img.remove()));
  queueHealth(pageItems);
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
    <button class="secondary expand-analytics" data-action="expand">Viewing charts ↗</button>
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
function updateViewing(id: string) {
  if (expandedId !== id || !dialog.open) return;
  const entry = viewing.get(id);
  const content = element("viewingCharts");
  element<HTMLButtonElement>("refreshCharts").disabled = !!entry?.loading;
  if (!entry || entry.loading) {
    content.innerHTML =
      '<p class="analytics-state muted" role="status">Loading viewing charts…</p>';
  } else if (entry.error) {
    content.innerHTML = `<p class="analytics-state bad" role="alert">${esc(entry.error)}</p>`;
  } else {
    renderViewingCharts(
      content,
      entry.data!,
      items.find((p) => p.id === id)!,
    );
  }
}
async function loadViewing(id: string, refresh = false) {
  if (viewing.get(id)?.loading || (!refresh && viewing.get(id)?.data)) {
    updateViewing(id);
    return;
  }
  viewing.set(id, { loading: true });
  updateViewing(id);
  try {
    const response = await fetch(`/viewing.json?id=${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    viewing.set(id, { loading: false, data });
  } catch (error) {
    viewing.set(id, { loading: false, error: errorMessage(error) });
  }
  updateViewing(id);
}
function expandAnalytics(id: string) {
  const p = items.find((p) => p.id === id)!;
  const parsed = parseCourseTitle(p.title);
  expandedId = id;
  element("analyticsTitle").textContent = parsed.title;
  element("analyticsCourse").textContent = [
    parsed.course,
    parsed.sections
      ? `Section${parsed.sections.includes(",") ? "s" : ""} ${parsed.sections}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  dialog.showModal();
  document.documentElement.classList.add("analytics-open");
  void loadViewing(id);
}
dialog.addEventListener("close", () => {
  expandedId = null;
  document.documentElement.classList.remove("analytics-open");
});
element<HTMLButtonElement>("refreshCharts").onclick = () => {
  if (expandedId) void loadViewing(expandedId, true);
};
element("list").addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  const card = button?.closest<HTMLElement>(".card");
  const id = card?.dataset.id;
  if (!button || !card || !id) return;
  if (button.dataset.action === "expand") {
    expandAnalytics(id);
    return;
  }
  if (button.dataset.action === "refresh") {
    void loadAnalytics(id, true);
    return;
  }
  const back = !flipped.has(id);
  if (back) flipped.add(id);
  else flipped.delete(id);
  const frontFace = card.querySelector<HTMLElement>(".card-front")!;
  const backFace = card.querySelector<HTMLElement>(".card-back")!;
  card.dataset.flipped = String(back);
  frontFace.inert = back;
  frontFace.setAttribute("aria-hidden", String(back));
  backFace.inert = !back;
  backFace.setAttribute("aria-hidden", String(!back));
  (back ? backFace : frontFace)
    .querySelector<HTMLButtonElement>('[data-action="flip"]')!
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
    currentPage = 1;
    render();
  } catch (e) {
    state.className = "bad";
    state.textContent = "Could not refresh presentations: " + errorMessage(e);
  } finally {
    refresh.disabled = false;
  }
}
function resetPage() {
  currentPage = 1;
  render();
}
function changePage(event: Event) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-page]");
  if (!button || button.disabled) return;
  const page = Number(button.dataset.page);
  if (page === currentPage) return;
  const controls = button.closest<HTMLElement>("[data-page-controls]")!;
  const fromBottom = !!controls.closest("#pagination");
  const buttonIndex = Array.from(controls.querySelectorAll("button")).indexOf(
    button,
  );
  const { scrollX, scrollY } = window;
  currentPage = page;
  render();
  if (fromBottom) {
    const list = element("list");
    list.focus({ preventScroll: true });
    list.scrollIntoView({ block: "start" });
  } else {
    // Rendering replaces the buttons; retain focus for repeated navigation.
    const replacement = controls.querySelectorAll("button")[buttonIndex];
    const focusTarget = replacement?.disabled
      ? controls.querySelector<HTMLButtonElement>('[aria-current="page"]')
      : replacement;
    focusTarget?.focus({ preventScroll: true });
    window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
  }
}
document
  .querySelectorAll<HTMLElement>("[data-page-controls]")
  .forEach((controls) => controls.addEventListener("click", changePage));
search.oninput = resetPage;
element<HTMLSelectElement>("sort").onchange = resetPage;
element<HTMLButtonElement>("refresh").onclick = load;
load();
