// Color tiers for view counts: 0 red, 1–5 orange, 6–10 yellow, 11–20 lime, 21+ green.
export function viewsTier(views = 0) {
  return views === 0
    ? "none"
    : views <= 5
      ? "low"
      : views <= 10
        ? "some"
        : views <= 20
          ? "good"
          : "high";
}
