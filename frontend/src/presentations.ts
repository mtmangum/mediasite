import "./theme";
import { fetchJson } from "./http";
import { store } from "./store";
import { queueHealth } from "./health";
import { cyclePreview, observePreviews } from "./previews";
import { expandAnalytics, loadAnalytics } from "./analytics";
import { cardMarkup, skeletonCards, trackThumbnails } from "./cards";
import { filterPresentations, paginate, sortPresentations } from "./list";
import { pageControlsMarkup, renderPageControls } from "./pagination";
import { element, errorMessage, type Presentation } from "./shared";

const PAGE_SIZE = 9;
const flipped = new Set<string>();
let currentPage = 1;

const state = element("state");
const list = element("list");
const search = element<HTMLInputElement>("search");
const sort = element<HTMLSelectElement>("sort");
const refresh = element<HTMLButtonElement>("refresh");

function render() {
  const visible = sortPresentations(
    filterPresentations(store.items, search.value),
    sort.value,
  );
  const page = paginate(visible, currentPage, PAGE_SIZE);
  currentPage = page.currentPage;
  element("paginationTop").hidden = visible.length === 0;
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
    .map((p) => cardMarkup(p, flipped.has(p.id)))
    .join("");
  queueHealth(page.items);
  trackThumbnails();
  observePreviews();
}

async function load() {
  refresh.disabled = true;
  state.hidden = false;
  state.className = "sr-only";
  state.textContent = "Loading presentations…";
  list.innerHTML = skeletonCards(PAGE_SIZE);
  element("paginationTop").hidden = true;
  element("pagination").hidden = true;
  try {
    store.items = (
      await fetchJson<{ items: Presentation[] }>("/recent.json")
    ).items;
    currentPage = 1;
    render();
  } catch (e) {
    list.innerHTML = "";
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
search.oninput = resetPage;
sort.onchange = resetPage;
refresh.onclick = load;
void load();
