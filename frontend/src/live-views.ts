import { fetchJson } from "./http";
import { findPresentation } from "./store";

interface LiveViews {
  views: number;
  users: number;
  lastWatched: string | null;
}

const BATCH_SIZE = 30;

// The list's own view count lags by days, so totals come from each presentation's analytics.
// Visible cards load first; `onBatch` runs after each batch so tags can update in place.
// A failed batch falls back to the list's count rather than leaving tags pending.
export async function loadLiveViews(
  visibleIds: string[],
  allIds: string[],
  options: {
    fresh: boolean;
    isCurrent: () => boolean;
    onBatch: (ids: string[]) => void;
  },
) {
  const rest = allIds.filter((id) => !visibleIds.includes(id));
  const batches = [visibleIds];
  for (let i = 0; i < rest.length; i += BATCH_SIZE)
    batches.push(rest.slice(i, i + BATCH_SIZE));
  for (const ids of batches.filter((b) => b.length)) {
    let totals: Record<string, LiveViews | null> = {};
    try {
      totals = (
        await fetchJson<{ views: Record<string, LiveViews | null> }>(
          `/views.json?ids=${ids.join(",")}${options.fresh ? "&fresh=1" : ""}`,
        )
      ).views;
    } catch {
      /* keep the list's counts for this batch */
    }
    if (!options.isCurrent()) return;
    for (const id of ids) {
      const p = findPresentation(id);
      if (!p) continue;
      const live = totals[id];
      if (live) p.views = live.views;
      p.viewsReady = true;
    }
    options.onBatch(ids);
  }
}
