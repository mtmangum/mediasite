const MAX_SLOTS = 7;

// Page numbers to show, with "…" for skipped runs, in at most seven slots:
// 1 2 3 4 5 … 12  |  1 … 5 6 7 … 12  |  1 … 8 9 10 11 12
export function pageWindow(current: number, count: number): (number | "…")[] {
  if (count <= MAX_SLOTS) return Array.from({ length: count }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", count];
  if (current >= count - 3)
    return [1, "…", count - 4, count - 3, count - 2, count - 1, count];
  return [1, "…", current - 1, current, current + 1, "…", count];
}

// "Showing 1–9 of 100 / Page 1 of 12", then Previous, numbered pages, and Next.
export function pageControlsMarkup(
  currentPage: number,
  pageCount: number,
  start: number,
  shown: number,
  total: number,
) {
  const status = `<span class="page-status"><span class="page-range">Showing <strong>${start + 1}–${start + shown}</strong> of <strong>${total}</strong></span><span class="page-of">Page <strong>${currentPage}</strong> of ${pageCount}</span></span>`;
  const previous = `<button class="secondary" data-nav="previous" data-page="${currentPage - 1}" aria-label="Previous page" title="Previous page" ${currentPage === 1 ? "disabled" : ""}>←<span class="page-label"> Previous</span></button>`;
  const numbers = pageWindow(currentPage, pageCount)
    .map((page) =>
      page === "…"
        ? '<span class="page-gap" aria-hidden="true">…</span>'
        : `<button class="secondary page-number" data-page="${page}" aria-label="Page ${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`,
    )
    .join("");
  const next = `<button class="secondary" data-nav="next" data-page="${currentPage + 1}" aria-label="Next page" title="Next page" ${currentPage === pageCount ? "disabled" : ""}><span class="page-label">Next </span>→</button>`;
  return status + previous + numbers + next;
}

// Writes the controls into both the top and bottom navs.
export function renderPageControls(markup: string) {
  document
    .querySelectorAll<HTMLElement>("[data-page-controls]")
    .forEach((controls) => {
      controls.innerHTML = markup;
      // Announce page changes once, from the bottom controls only.
      if (controls.closest("#pagination"))
        controls.querySelector(".page-status")?.setAttribute("role", "status");
    });
}
