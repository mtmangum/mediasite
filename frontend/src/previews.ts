import { fmtDuration } from "./format";
import { previewWarnings, updateHealth } from "./health";

interface PreviewState {
  frames: { seconds: number; url: string }[];
  index: number;
}
const previews = new Map<string, Promise<PreviewState | null>>();
const resolved = new Map<string, PreviewState>();
const dueAt = new Map<string, number>();
let previewObserver: IntersectionObserver | undefined;

// Frames advance on their own (earlier → later in the recording) unless motion is reduced.
const STEP_MS = 4000;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

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
    if (!reducedMotion.matches)
      thumb.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 400,
        easing: "ease-out",
      });
    const many = preview.frames.length > 1;
    const time = fmtDuration(frame.seconds * 1000);
    button.hidden = false;
    button.disabled = !many;
    button.innerHTML = `${many ? `<span class="pv-dots" aria-hidden="true">${preview.frames.map((_, i) => `<i${i === selectedIndex ? ' class="on"' : ""}></i>`).join("")}</span>` : ""}<span>${time}</span>${many ? '<span aria-hidden="true">↻</span>' : ""}`;
    button.title = many
      ? `Frame ${selectedIndex + 1} of ${preview.frames.length} (${time}). Show the next frame.`
      : "Sampled frame from this recording";
    button.setAttribute(
      "aria-label",
      `Preview frame ${selectedIndex + 1} of ${preview.frames.length}, at ${time}${many ? ". Show the next frame" : ""}`,
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
          if (!data.frames?.length) return null;
          // The server ranks the most detailed frame first; show that one, then step in recording order.
          const best = data.frames[0];
          const frames = [...data.frames].sort(
            (
              a: PreviewState["frames"][number],
              b: PreviewState["frames"][number],
            ) => a.seconds - b.seconds,
          );
          const state = { frames, index: frames.indexOf(best) };
          resolved.set(id, state);
          return state;
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

function advance(id: string, card: HTMLElement, preview: PreviewState) {
  preview.index = (preview.index + 1) % preview.frames.length;
  dueAt.set(id, performance.now() + STEP_MS);
  applyPreview(card, preview);
}

// Shows the next sampled frame for a card (the button), restarting its auto-step timer.
export function cyclePreview(id: string, card: HTMLElement) {
  void previews.get(id)?.then((preview) => {
    if (preview) advance(id, card, preview);
  });
}

// Steps visible, idle cards on their own; hovering or focusing a card pauses it.
function autoStep() {
  if (document.hidden || reducedMotion.matches) return;
  const now = performance.now();
  document.querySelectorAll<HTMLElement>(".card[data-id]").forEach((card) => {
    const id = card.dataset.id!;
    const preview = resolved.get(id);
    if (!preview || preview.frames.length < 2) return;
    if (card.dataset.flipped === "true") return;
    const { top, bottom } = card.getBoundingClientRect();
    if (bottom < 0 || top > innerHeight) return;
    if (card.matches(":hover") || card.contains(document.activeElement)) {
      dueAt.set(id, now + STEP_MS);
      return;
    }
    if (!dueAt.has(id)) {
      // Stagger first steps so the cards don't all change at once.
      const jitter = Array.from(id).reduce((n, c) => n + c.charCodeAt(0), 0);
      dueAt.set(id, now + STEP_MS + (jitter % 2000));
      return;
    }
    if (now >= dueAt.get(id)!) advance(id, card, preview);
  });
}
setInterval(autoStep, 500);
