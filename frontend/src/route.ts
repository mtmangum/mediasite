// Shareable URLs: /recent is the list; /recent/<presentation-id>/charts opens that
// presentation's viewing charts. The app may be served from a sub-path (the GitHub Pages
// demo lives under /mediasite/), so every path is relative to the build's base.
const BASE: string = import.meta.env?.BASE_URL ?? "/";

const CHARTS_ROUTE = /^\/recent\/([A-Za-z0-9_-]{1,128})\/charts\/?$/;

export const LIST_PATH = `${BASE}recent`;

// The presentation id a path points at, or null for any other path.
export function chartsFor(pathname: string): string | null {
  const relative = pathname.startsWith(BASE)
    ? `/${pathname.slice(BASE.length)}`
    : pathname;
  return CHARTS_ROUTE.exec(relative)?.[1] ?? null;
}

export const chartsPath = (id: string) =>
  `${LIST_PATH}/${encodeURIComponent(id)}/charts`;
