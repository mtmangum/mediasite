import "./demo-hook";
import "./theme";
import { fetchJson } from "./http";
import { store } from "./store";
import { queueHealth } from "./health";
import { cyclePreview, observePreviews } from "./previews";
import {
  expandAnalytics,
  loadAnalytics,
  openChartsFromRoute,
} from "./analytics";
import { chartsFor } from "./route";
import {
  cardMarkup,
  refreshViewsTag,
  skeletonCards,
  trackThumbnails,
} from "./cards";
import { loadLiveViews } from "./live-views";
import {
  filterPresentations,
  newPresentations,
  paginate,
  sortPresentations,
} from "./list";
import { pageControlsMarkup, renderPageControls } from "./pagination";
import { findPresentation } from "./store";
import { element, errorMessage, type Presentation } from "./shared";

const PAGE_SIZE = 9;
let view: "grid" | "list" = "grid";
try {
  if (localStorage.getItem("mediasite-view") === "list") view = "list";
} catch {
  /* View switching still works when storage is unavailable. */
}
const flipped = new Set<string>();
let currentPage = 1;
// How often to quietly look for new recordings; `?poll=<seconds>` overrides it (for testing).
const CHECK_MS =
  Number(new URLSearchParams(location.search).get("poll")) * 1000 ||
  3 * 60 * 1000;
let pendingItems: Presentation[] | null = null; // the latest list, once it has new recordings
let loading = false;
let lastCheck = Date.now();
let viewsRun = 0;
let routeOpened = false; // identifies the latest load, so stale view batches are ignored

const state = element("state");
const list = element("list");
const search = element<HTMLInputElement>("search");
const sort = element<HTMLSelectElement>("sort");
const refresh = element<HTMLButtonElement>("refresh");

function syncView() {
  list.dataset.view = view;
  document
    .querySelectorAll<HTMLButtonElement>("button[data-view]")
    .forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
}
syncView();

function render() {
  const visible = sortPresentations(
    filterPresentations(store.items, search.value),
    sort.value,
  );
  const page = paginate(visible, currentPage, PAGE_SIZE);
  currentPage = page.currentPage;
  element("pagination").hidden = visible.length === 0;
  renderPageControls(
    pageControlsMarkup(
      page.currentPage,
      page.pageCount,
      page.start,
      page.items.length,
      visible.length,
    ),
  );
  state.hidden = visible.length > 0;
  state.className = "muted";
  state.textContent = store.items.length
    ? "No presentations match your search."
    : "No viewable presentations are available. Check your login in the API explorer connection settings.";
  list.innerHTML = page.items
    .map((p) => cardMarkup(p, view === "grid" && flipped.has(p.id), view))
    .join("");
  queueHealth(page.items);
  trackThumbnails();
  observePreviews();
}

// The intro and footer name how many presentations the library holds (up to 100).
function setLibraryCount() {
  document
    .querySelectorAll("[data-library-count]")
    .forEach((el) => (el.textContent = String(store.items.length)));
}

// Fetches live view totals for the visible cards first, then the rest in the background.
function hydrateViews(fresh: boolean) {
  const run = ++viewsRun;
  const visibleIds = Array.from(
    list.querySelectorAll<HTMLElement>(".card[data-id]"),
    (card) => card.dataset.id!,
  );
  void loadLiveViews(
    visibleIds,
    store.items.map((p) => p.id),
    {
      fresh,
      isCurrent: () => run === viewsRun,
      onBatch: (ids) => {
        ids.forEach((id) => {
          const p = findPresentation(id);
          if (p) refreshViewsTag(p);
        });
      },
    },
  ).then(() => {
    // Counts changed, so a views sort may need a new order.
    if (run === viewsRun && sort.value === "views") render();
  });
}

function showNewRecordings(count: number) {
  element("newRecordingsText").textContent =
    `${count} new recording${count === 1 ? "" : "s"} available`;
  element("newRecordings").hidden = false;
}
function hideNewRecordings() {
  pendingItems = null;
  element("newRecordings").hidden = true;
}

// Quietly looks for recordings the page doesn't have yet, and offers them rather than
// reshuffling the list under the reader.
async function checkForNew() {
  lastCheck = Date.now();
  if (document.hidden || loading) return;
  try {
    const { items } = await fetchJson<{ items: Presentation[] }>(
      "/recent.json",
    );
    const fresh = newPresentations(store.items, items);
    if (loading) return;
    if (fresh.length) {
      pendingItems = items;
      showNewRecordings(fresh.length);
    } else hideNewRecordings();
  } catch {
    /* try again at the next interval */
  }
}

function showPending() {
  if (!pendingItems) return;
  store.items = pendingItems;
  setLibraryCount();
  hideNewRecordings();
  currentPage = 1;
  render();
  hydrateViews(false);
  window.scrollTo({ top: 0, behavior: "instant" });
}

// A shared link (/recent/<id>/charts) opens that presentation's charts once the page is ready.
async function openRouteIfAny() {
  const id = chartsFor(location.pathname);
  if (!id || routeOpened) return;
  routeOpened = true;
  if (await openChartsFromRoute(id)) return;
  state.hidden = false;
  state.className = "bad";
  state.textContent =
    "That presentation couldn't be found, so its charts can't be opened.";
}

async function load(fresh = false) {
  loading = true;
  hideNewRecordings();
  refresh.disabled = true;
  state.hidden = false;
  state.className = "sr-only";
  state.textContent = "Loading presentations…";
  list.innerHTML = skeletonCards(PAGE_SIZE);
  element("pagination").hidden = true;
  try {
    store.items = (
      await fetchJson<{ items: Presentation[] }>("/recent.json")
    ).items;
    setLibraryCount();
    currentPage = 1;
    render();
    hydrateViews(fresh);
    void openRouteIfAny();
  } catch (e) {
    list.innerHTML = "";
    state.className = "bad";
    state.textContent = "Could not refresh presentations: " + errorMessage(e);
  } finally {
    loading = false;
    lastCheck = Date.now();
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
  currentPage = page;
  render();
  list.focus({ preventScroll: true });
  list.scrollIntoView({ block: "start" });
}

// Turns a card over, moving focus and inertness to the visible face.
function flipCard(card: HTMLElement, id: string) {
  const toBack = !flipped.has(id);
  if (toBack) flipped.add(id);
  else flipped.delete(id);
  const frontFace = card.querySelector<HTMLElement>(".card-front")!;
  const backFace = card.querySelector<HTMLElement>(".card-back")!;
  card.dataset.flipped = String(toBack);
  frontFace.inert = toBack;
  frontFace.setAttribute("aria-hidden", String(toBack));
  backFace.inert = !toBack;
  backFace.setAttribute("aria-hidden", String(!toBack));
  (toBack ? backFace : frontFace)
    .querySelector<HTMLButtonElement>('[data-action="flip"]')!
    .focus({ preventScroll: true });
  if (toBack) void loadAnalytics(id);
}

list.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  const card = button?.closest<HTMLElement>(".card");
  const id = card?.dataset.id;
  if (!button || !card || !id) return;
  switch (button.dataset.action) {
    case "preview":
      return cyclePreview(id, card);
    case "expand":
      return expandAnalytics(id);
    case "refresh":
      return void loadAnalytics(id, true);
    default:
      return flipCard(card, id);
  }
});
document
  .querySelectorAll<HTMLElement>("[data-page-controls]")
  .forEach((controls) => controls.addEventListener("click", changePage));
document
  .querySelectorAll<HTMLButtonElement>("button[data-view]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view === "list" ? "list" : "grid";
      try {
        localStorage.setItem("mediasite-view", view);
      } catch {
        /* Keep the preference for this session. */
      }
      syncView();
      if (!loading) render();
    });
  });
search.oninput = resetPage;
sort.onchange = resetPage;
refresh.onclick = () => void load(true);
element("showNew").onclick = showPending;
setInterval(() => void checkForNew(), CHECK_MS);
// Catch up promptly when a long-hidden tab comes back.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastCheck > CHECK_MS) void checkForNew();
});
void load();
