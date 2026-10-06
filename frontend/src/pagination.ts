// "Showing 1–9 of 100 / Page 1 of 12", then Previous, numbered pages, and Next.
export function pageControlsMarkup(
  currentPage: number,
  pageCount: number,
  start: number,
  shown: number,
  total: number,
) {
  const status = `<span class="page-status"><span class="page-range">Showing <strong>${start + 1}–${start + shown}</strong> of <strong>${total}</strong></span><span class="page-of">Page <strong>${currentPage}</strong> of ${pageCount}</span></span>`;
  const previous = `<button class="secondary" data-page="${currentPage - 1}" aria-label="Previous page" title="Previous page" ${currentPage === 1 ? "disabled" : ""}>←<span class="page-label"> Previous</span></button>`;
  const numbers = Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    return `<button class="secondary page-number" data-page="${page}" aria-label="Page ${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`;
  }).join("");
  const next = `<button class="secondary" data-page="${currentPage + 1}" aria-label="Next page" title="Next page" ${currentPage === pageCount ? "disabled" : ""}><span class="page-label">Next </span>→</button>`;
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
