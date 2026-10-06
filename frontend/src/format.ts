const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c] || c);

export const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function fmtDuration(ms?: number) {
  if (!ms) return "—";
  const t = Math.round(ms / 1000),
    h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  return (
    (h ? h + ":" + String(m).padStart(2, "0") : m) +
    ":" +
    String(s).padStart(2, "0")
  );
}
