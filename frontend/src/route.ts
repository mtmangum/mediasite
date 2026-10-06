// Shareable URLs: /recent is the list; /recent/<presentation-id>/charts opens that
// presentation's viewing charts.
const CHARTS_ROUTE = /^\/recent\/([A-Za-z0-9_-]{1,128})\/charts\/?$/;

export const LIST_PATH = "/recent";

// The presentation id a path points at, or null for any other path.
export function chartsFor(pathname: string): string | null {
  return CHARTS_ROUTE.exec(pathname)?.[1] ?? null;
}

export const chartsPath = (id: string) =>
  `${LIST_PATH}/${encodeURIComponent(id)}/charts`;
