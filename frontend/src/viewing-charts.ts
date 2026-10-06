import type { Presentation, ViewingCharts } from "./shared";

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const time = (seconds: number) => {
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};
const count = (value: number) => value.toLocaleString();
const y = (value: number, max: number) => 176 - (value / max) * 168;
const headline = (value: number | undefined, label: string) =>
  `<div class="chart-headline"><strong>${value === undefined ? "—" : count(value)}</strong><span>${label}</span></div>`;

function plot(
  kind: string,
  title: string,
  description: string,
  max: number,
  marks: string,
  labels: { fraction: number; label: string }[],
  axis: string,
) {
  return `<div class="chart-plot"><div class="chart-y-axis" aria-hidden="true"><span>${count(max)}</span><span>${count(max / 2)}</span><span>0</span></div>
    <svg data-plot="${kind}" viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="${esc(title)}"><desc>${esc(description)}</desc><path class="chart-grid" d="M0 8H600 M0 92H600 M0 176H600"/>${marks}</svg>
    </div><div class="chart-x-axis" aria-hidden="true">${labels.map(({ fraction, label }) => `<span style="left:${fraction * 100}%" class="${fraction === 0 ? "axis-start" : fraction === 1 ? "axis-end" : ""}">${esc(label)}</span>`).join("")}</div><div class="chart-axis-label muted">${axis} · min:sec</div>`;
}
function inspector(kind: string, max: number, index: number) {
  return `<div class="segment-inspector"><label for="${kind}Slider">Slide to inspect</label><output id="${kind}Readout" for="${kind}Slider"></output><input id="${kind}Slider" type="range" min="0" max="${max}" value="${index}" step="1" aria-label="${kind === "segment" ? "Video segment" : "Watch-duration interval"}" aria-describedby="${kind}Readout"></div>`;
}

export function renderViewingCharts(
  container: HTMLElement,
  data: ViewingCharts,
  presentation: Presentation,
) {
  const { timeline, histogram } = data;
  const end = presentation.durationMs
    ? presentation.durationMs / 1000
    : Math.max(
        1,
        ...(timeline || []).map((s) => s.startSeconds + s.durationSeconds),
      );
  const peak = timeline?.length ? Math.max(...timeline.map((s) => s.views)) : 0;
  const timelineMax = Math.max(2, Math.ceil(peak / 2) * 2);
  let timelineMarkup: string;
  if (timeline === null) {
    timelineMarkup = `<p class="chart-state bad">${esc(data.timelineError || "Viewing timeline unavailable.")}</p>`;
  } else if (!timeline.length || !peak) {
    timelineMarkup =
      '<p class="chart-state muted">No segment viewing activity has been reported yet.</p>';
  } else {
    // Stepped segments preserve the API's actual reporting intervals, including gaps.
    let line = "";
    let lastEnd = 0;
    timeline.forEach((segment, index) => {
      const start = Math.min(end, segment.startSeconds);
      const stop = Math.min(
        end,
        segment.startSeconds + segment.durationSeconds,
      );
      if (stop <= start) return;
      const x1 = (start / end) * 600,
        x2 = (stop / end) * 600;
      if (!line) line = `M${x1} ${y(segment.views, timelineMax)}`;
      else if (start > lastEnd)
        line += ` L${(lastEnd / end) * 600} 176 L${x1} 176 L${x1} ${y(segment.views, timelineMax)}`;
      else line += ` L${x1} ${y(segment.views, timelineMax)}`;
      line += ` H${x2}`;
      lastEnd = stop;
    });
    const marks = `<defs><linearGradient id="timelineWash" x1="0" y1="0" x2="0" y2="1"><stop class="chart-wash-top" offset="0"/><stop class="chart-wash-bottom" offset="1"/></linearGradient></defs><path class="chart-area" d="${line} L${(lastEnd / end) * 600} 176 L${(Math.min(end, timeline[0].startSeconds) / end) * 600} 176 Z"/><path class="chart-line" d="${line}"/><g class="chart-selection"><path class="chart-crosshair" d="M0 0V180"/><circle class="chart-point" r="4" cy="0"/></g>`;
    timelineMarkup =
      plot(
        "segment",
        "Segment views along the recording",
        `${timeline.length} segments. Peak ${count(peak)} views. Use the video segment slider for exact counts.`,
        timelineMax,
        marks,
        [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
          fraction,
          label: time(end * fraction),
        })),
        "Video position",
      ) +
      inspector(
        "segment",
        timeline.length - 1,
        timeline.findIndex((s) => s.views === peak),
      );
  }
  let histogramMarkup: string;
  if (histogram === null) {
    histogramMarkup = `<p class="chart-state bad">${esc(data.histogramError || "Watch-duration histogram unavailable.")}</p>`;
  } else {
    const { bins } = histogram;
    if (bins.length) {
      const binPeak = Math.max(...bins.map((b) => b.sessions));
      const max = Math.max(2, Math.ceil(binPeak / 2) * 2);
      const bars = bins
        .map((bin, index) => {
          const slot = 600 / bins.length,
            gap = Math.min(12, slot * 0.24);
          const height = 176 - y(bin.sessions, max),
            x = slot * index + gap / 2,
            width = slot - gap;
          const radius = Math.min(7, height / 2, width / 2);
          // Round only the top corners; every bar retains the same zero baseline.
          return `<path class="chart-bar" data-bin="${index}" d="M${x} 176 V${176 - height + radius} Q${x} ${176 - height} ${x + radius} ${176 - height} H${x + width - radius} Q${x + width} ${176 - height} ${x + width} ${176 - height + radius} V176 Z"/>`;
        })
        .join("");
      histogramMarkup =
        plot(
          "duration",
          "Sessions by recorded watch duration",
          `${count(histogram.watchedSessions)} watched sessions in equal ${histogram.binSeconds / 60}-minute intervals. Use the watch-duration slider for exact counts.`,
          max,
          bars,
          [
            ...new Set(
              [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(bins.length * f)),
            ),
          ].map((index) => ({
            fraction: index / bins.length,
            label: time(index * histogram.binSeconds),
          })),
          "Watch time",
        ) +
        inspector(
          "duration",
          bins.length - 1,
          bins.findIndex((b) => b.sessions === binPeak),
        ) +
        `<details class="chart-data"><summary>View exact counts</summary><table><caption>Watch time per session (minutes:seconds)</caption><thead><tr><th scope="col">Time watched</th><th scope="col">Sessions</th></tr></thead><tbody>${bins.map((b) => `<tr><th scope="row">${time(b.startSeconds)}–&lt;${time(b.endSeconds)}</th><td>${count(b.sessions)}</td></tr>`).join("")}</tbody></table></details>`;
    } else
      histogramMarkup =
        '<p class="chart-state muted">No watch time has been recorded yet.</p>';
    histogramMarkup += `<div class="session-notes"><span>${count(histogram.totalSessions)} total sessions</span><span>${count(histogram.zeroSeconds)} zero-second opens</span>${histogram.unknownSeconds ? `<span>${count(histogram.unknownSeconds)} unavailable durations</span>` : ""}</div>`;
  }
  container.innerHTML = `<div class="viewing-grid"><section class="chart-panel"><div class="chart-heading"><h3>Viewing timeline</h3><span class="chart-kind">SEGMENTS</span></div>${headline(timeline ? peak : undefined, "peak segment views")}<p class="chart-description muted">Views across the recording, including replay.</p>${timelineMarkup}</section><section class="chart-panel"><div class="chart-heading"><h3>Watch duration</h3><span class="chart-kind">HISTOGRAM</span></div>${headline(histogram?.watchedSessions, "watched sessions")}<p class="chart-description muted">${histogram?.bins.length ? `${histogram.binSeconds / 60}-minute intervals · ` : ""}Watch time per session, including replay.</p>${histogramMarkup}</section></div><p class="chart-caption muted">Updated ${esc(new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))} · Sessions are not unique viewers. Timeline counts can differ because of reporting thresholds.</p>`;

  function bind(
    kind: string,
    select: (index: number) => string,
    locate: (fraction: number) => number,
  ) {
    const slider = container.querySelector<HTMLInputElement>(`#${kind}Slider`);
    const svg = container.querySelector<SVGSVGElement>(`[data-plot="${kind}"]`);
    if (!slider || !svg) return;
    const update = () => {
      const label = select(Number(slider.value));
      container.querySelector<HTMLOutputElement>(`#${kind}Readout`)!.value =
        label;
      slider.setAttribute("aria-valuetext", label);
      slider.style.setProperty(
        "--range-progress",
        `${Number(slider.max) ? (Number(slider.value) / Number(slider.max)) * 100 : 0}%`,
      );
    };
    slider.oninput = update;
    const scrub = (event: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      slider.value = String(
        locate(
          Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        ),
      );
      update();
    };
    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      svg.setPointerCapture(event.pointerId);
      scrub(event);
      slider.focus({ preventScroll: true });
    });
    svg.addEventListener("pointermove", (event) => {
      if (
        event.pointerType === "mouse" ||
        svg.hasPointerCapture(event.pointerId)
      )
        scrub(event);
    });
    update();
  }
  if (timeline?.length && peak)
    bind(
      "segment",
      (index) => {
        const segment = timeline[index];
        const x = Math.min(
          600,
          ((segment.startSeconds +
            Math.min(
              segment.durationSeconds,
              Math.max(0, end - segment.startSeconds),
            ) /
              2) /
            end) *
            600,
        );
        const selection =
          container.querySelector<SVGGElement>(".chart-selection")!;
        selection.setAttribute("transform", `translate(${x},0)`);
        selection
          .querySelector("circle")!
          .setAttribute("cy", String(y(segment.views, timelineMax)));
        return `${count(segment.views)} ${segment.views === 1 ? "view" : "views"} · ${time(segment.startSeconds)}–${time(Math.min(end, segment.startSeconds + segment.durationSeconds))}`;
      },
      (fraction) => {
        const seconds = fraction * end;
        let closest = 0,
          distance = Infinity;
        timeline.forEach((s, index) => {
          const d =
            seconds < s.startSeconds
              ? s.startSeconds - seconds
              : seconds > s.startSeconds + s.durationSeconds
                ? seconds - s.startSeconds - s.durationSeconds
                : 0;
          if (d < distance) {
            closest = index;
            distance = d;
          }
        });
        return closest;
      },
    );
  if (histogram?.bins.length)
    bind(
      "duration",
      (index) => {
        container
          .querySelectorAll<SVGPathElement>("[data-bin]")
          .forEach((bar) =>
            bar.classList.toggle("selected", Number(bar.dataset.bin) === index),
          );
        const bin = histogram.bins[index];
        return `${count(bin.sessions)} ${bin.sessions === 1 ? "session" : "sessions"} · ${time(bin.startSeconds)}–<${time(bin.endSeconds)}`;
      },
      (fraction) =>
        Math.min(
          histogram.bins.length - 1,
          Math.floor(fraction * histogram.bins.length),
        ),
    );
}
