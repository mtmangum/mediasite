import { fmtDuration } from "./format";
import { previewWarnings, updateHealth } from "./health";

interface PreviewState {
  frames: { seconds: number; url: string }[];
  index: number;
}
const previews = new Map<string, Promise<PreviewState | null>>();
let previewObserver: IntersectionObserver | undefined;

function applyPreview(card: HTMLElement, preview: PreviewState) {
  const selectedIndex = preview.index;
  const frame = preview.frames[selectedIndex];
  const image = new Image();
  image.onload = () => {
    if (!card.isConnected || selectedIndex !== preview.index) return;
    let thumb = card.querySelector<HTMLImageElement>(".thumb");
    if (!thumb) {
      thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.alt = "";
      card.querySelector(".thumb-wrap")!.append(thumb);
    }
    thumb.src = image.src;
    const button = card.querySelector<HTMLButtonElement>(".preview-button")!;
    button.hidden = false;
    button.disabled = preview.frames.length < 2;
    button.textContent = `Preview ${fmtDuration(frame.seconds * 1000)}${preview.frames.length > 1 ? " ↻" : ""}`;
    button.title =
      preview.frames.length > 1
        ? `Frame ${preview.index + 1} of ${preview.frames.length}. Try another frame.`
        : "Sampled frame from this recording";
    button.setAttribute(
      "aria-label",
      `Preview at ${fmtDuration(frame.seconds * 1000)}${preview.frames.length > 1 ? ". Show another preview frame" : ""}`,
    );
  };
  image.src = frame.url;
}

// Fetches sampled frames (and any visual-review flag) for one recording, once.
function loadPreview(id: string) {
  if (!previews.has(id))
    previews.set(
      id,
      (async () => {
        try {
          const response = await fetch(
            `/preview.json?id=${encodeURIComponent(id)}`,
          );
          if (!response.ok) return null;
          const data = await response.json();
          if (data.review) {
            previewWarnings.set(id, {
              code: `visual-${data.review.kind}`,
              label: data.review.label,
              detail: `${data.review.detail} Sample positions: ${data.review.seconds.map((s: number) => fmtDuration(s * 1000)).join(", ")}.`,
              severity: "warning",
            });
            updateHealth(id);
          }
          return data.frames?.length ? { frames: data.frames, index: 0 } : null;
        } catch {
          return null;
        }
      })(),
    );
  return previews.get(id)!;
}

// Previews load as cards approach the viewport.
export function observePreviews() {
  previewObserver?.disconnect();
  previewObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        previewObserver!.unobserve(entry.target);
        const card = entry.target.closest<HTMLElement>(".card")!;
        void loadPreview(card.dataset.id!).then((preview) => {
          if (preview) applyPreview(card, preview);
        });
      });
    },
    { rootMargin: "100px" },
  );
  document
    .querySelectorAll<HTMLElement>(".thumb-wrap[data-preview]")
    .forEach((thumb) => previewObserver!.observe(thumb));
}

// Shows the next sampled frame for a card.
export function cyclePreview(id: string, card: HTMLElement) {
  void previews.get(id)?.then((preview) => {
    if (!preview) return;
    preview.index = (preview.index + 1) % preview.frames.length;
    applyPreview(card, preview);
  });
}
