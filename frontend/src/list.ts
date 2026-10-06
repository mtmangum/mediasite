import type { Presentation } from "./shared";

export type SortKey = "newest" | "title" | "views" | "duration";

const created = (p: Presentation) => Date.parse(p.created || "") || 0;

export function filterPresentations(items: Presentation[], query: string) {
  const needle = query.toLowerCase().trim();
  return items.filter((p) =>
    [p.title, p.presenter, p.folder, p.description].some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(needle),
    ),
  );
}

const comparators: Record<
  SortKey,
  (a: Presentation, b: Presentation) => number
> = {
  title: (a, b) => String(a.title || "").localeCompare(String(b.title || "")),
  // Most viewed first; ties fall back to newest.
  views: (a, b) => (b.views || 0) - (a.views || 0) || created(b) - created(a),
  duration: (a, b) => (b.durationMs || 0) - (a.durationMs || 0),
  newest: (a, b) => created(b) - created(a),
};

export function sortPresentations(items: Presentation[], sort: string) {
  return items.sort(comparators[sort as SortKey] ?? comparators.newest);
}

// Presentations in `incoming` that the page doesn't have yet.
export function newPresentations(
  known: Presentation[],
  incoming: Presentation[],
) {
  const seen = new Set(known.map((p) => p.id));
  return incoming.filter((p) => !seen.has(p.id));
}

export interface Page {
  currentPage: number;
  pageCount: number;
  start: number;
  items: Presentation[];
}

// Clamps the requested page into range and slices that page's items.
export function paginate(
  items: Presentation[],
  requestedPage: number,
  pageSize: number,
): Page {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const start = (currentPage - 1) * pageSize;
  return {
    currentPage,
    pageCount,
    start,
    items: items.slice(start, start + pageSize),
  };
}
