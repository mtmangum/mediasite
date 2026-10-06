import { esc, fmtDate, fmtTime } from "./format";
import { fetchJson } from "./http";
import { addExtra, findPresentation } from "./store";
import { chartsFor, chartsPath, LIST_PATH } from "./route";
import { parseCourseTitle } from "./course-title";
import { renderViewingCharts } from "./viewing-charts";
import {
  element,
  errorMessage,
  type Analytics,
  type Loadable,
  type Presentation,
  type ViewingCharts,
} from "./shared";

const analytics = new Map<string, Loadable<Analytics>>();
const viewing = new Map<string, Loadable<ViewingCharts>>();
const dialog = element<HTMLDialogElement>("analyticsDialog");
let expandedId: string | null = null;

const metric = (value: number | null) =>
  value === null ? "—" : value.toLocaleString();

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

const loadingState = (label: string, skeleton: string) =>
  `<div class="analytics-state" role="status"><span class="sr-only">${label}</span>${skeleton}</div>`;
const errorState = (message: string) =>
  `<p class="analytics-state bad" role="alert">${esc(message)}</p>`;
const metricsSkeleton = `<div class="sk-metrics" aria-hidden="true">${'<span class="skeleton sk-block"></span>'.repeat(4)}</div>`;
const chartsSkeleton = `<div class="sk-charts" aria-hidden="true">${'<span class="skeleton sk-chart"></span>'.repeat(2)}</div>`;

function platformMarkup(title: string, rows: Analytics["browsers"]) {
  if (rows === null)
    return `<section class="platforms"><h3>${title}</h3><p class="muted">Unavailable</p></section>`;
  return `<section class="platforms"><h3>${title}</h3>${rows.length ? `<dl>${rows.map((row) => `<dt>${esc(row.name)}</dt><dd>${metric(row.views)}</dd>`).join("")}</dl>` : '<p class="muted">No viewing activity yet.</p>'}</section>`;
}

export const analyticsLoading = (id: string) => !!analytics.get(id)?.loading;

// The flip side of a card: aggregate analytics for one presentation.
export function analyticsMarkup(id: string) {
  const entry = analytics.get(id);
  if (!entry || entry.loading)
    return loadingState("Loading analytics…", metricsSkeleton);
  if (entry.error) return errorState(entry.error);
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
    <p class="muted analytics-note">All-time analytics · Loaded ${esc(fmtTime(data.fetchedAt))}</p>
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
    analyticsLoading(id);
}

export async function loadAnalytics(id: string, refresh = false) {
  if (analytics.get(id)?.loading || (!refresh && analytics.get(id)?.data))
    return;
  analytics.set(id, { loading: true });
  updateAnalytics(id);
  try {
    const data = await fetchJson<Analytics>(
      `/analytics.json?id=${encodeURIComponent(id)}`,
    );
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
    content.innerHTML = loadingState("Loading viewing charts…", chartsSkeleton);
  } else if (entry.error) {
    content.innerHTML = errorState(entry.error);
  } else {
    renderViewingCharts(content, entry.data!, findPresentation(id)!);
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
    const data = await fetchJson<ViewingCharts>(
      `/viewing.json?id=${encodeURIComponent(id)}`,
    );
    viewing.set(id, { loading: false, data });
  } catch (error) {
    viewing.set(id, { loading: false, error: errorMessage(error) });
  }
  updateViewing(id);
}

const baseTitle = document.title;
let closingFromRoute = false;

// Opens the full-size viewing-charts dialog for a presentation, and gives it a shareable URL.
export function expandAnalytics(id: string, { push = true } = {}) {
  const parsed = parseCourseTitle(findPresentation(id)!.title);
  expandedId = id;
  if (push && chartsFor(location.pathname) !== id)
    history.pushState({ charts: id }, "", chartsPath(id) + location.search);
  document.title = `Viewing analytics · ${parsed.title}`;
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

// Opens the charts for a presentation named by a URL, fetching it if the list doesn't have it.
// Resolves false when the presentation can't be found.
export async function openChartsFromRoute(id: string) {
  if (!findPresentation(id)) {
    try {
      const { item } = await fetchJson<{ item: Presentation }>(
        `/presentation.json?id=${encodeURIComponent(id)}`,
      );
      addExtra({ ...item, viewsReady: true });
    } catch {
      history.replaceState(null, "", LIST_PATH + location.search);
      return false;
    }
  }
  expandAnalytics(id, { push: false });
  return true;
}

dialog.addEventListener("close", () => {
  expandedId = null;
  document.documentElement.classList.remove("analytics-open");
  document.title = baseTitle;
  if (closingFromRoute || !chartsFor(location.pathname)) return;
  // Closing returns to the list: step back if we pushed the charts URL, else rewrite it.
  if (history.state?.charts) history.back();
  else history.replaceState(null, "", LIST_PATH + location.search);
});

// Browser Back/Forward moves between the list and a presentation's charts.
window.addEventListener("popstate", () => {
  const id = chartsFor(location.pathname);
  if (id) {
    if (expandedId !== id) void openChartsFromRoute(id);
  } else if (dialog.open) {
    closingFromRoute = true;
    dialog.close();
    closingFromRoute = false;
  }
});

const copyLink = element<HTMLButtonElement>("copyChartsLink");
copyLink.onclick = async () => {
  if (!expandedId) return;
  const link = new URL(chartsPath(expandedId), location.origin).href;
  try {
    await navigator.clipboard.writeText(link);
    copyLink.textContent = "Link copied";
  } catch {
    copyLink.textContent = "Copy failed";
    window.prompt("Copy this link", link);
  }
  setTimeout(() => (copyLink.textContent = "Copy link"), 1800);
};
element<HTMLButtonElement>("refreshCharts").onclick = () => {
  if (expandedId) void loadViewing(expandedId, true);
};
