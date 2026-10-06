import { esc, fmtDate, fmtDuration } from "./format";
import { parseCourseTitle } from "./course-title";
import { healthMarkup } from "./health";
import { viewsTier } from "./views";
import { analyticsLoading, analyticsMarkup } from "./analytics";
import type { Presentation } from "./shared";

function courseMarkup(p: Presentation, link = false) {
  const parsed = parseCourseTitle(p.title);
  const label = parsed.sections?.includes(",") ? "Sections" : "Section";
  return `<div class="course-heading">${parsed.course ? `<div class="course-line"><span class="course-code">${esc(parsed.course)}</span><span class="course-section">${label} ${esc(parsed.sections)}</span></div>` : ""}<h2>${link ? `<a href="${esc(p.watchUrl)}" target="_blank" rel="noopener">${esc(parsed.title)}</a>` : esc(parsed.title)}</h2></div>`;
}

function viewsMarkup(views?: number) {
  const count = views ?? 0;
  return `<span class="views-tag" data-tier="${viewsTier(count)}">${count} ${count === 1 ? "view" : "views"}</span>`;
}

function instructorMarkup(p: Presentation) {
  const instructor = parseCourseTitle(p.title).instructor;
  return `<dt>${instructor ? "Instructor" : "Presenter"}</dt><dd>${esc(instructor || p.presenter || "—")}</dd>`;
}

function detailsMarkup(p: Presentation) {
  const parsed = parseCourseTitle(p.title);
  return `<details class="presentation-details"><summary>More details</summary><dl><dt>Uploaded</dt><dd>${esc(fmtDate(p.created))}</dd><dt>Owner</dt><dd>${esc(p.owner || "—")}</dd><dt>Folder</dt><dd>${esc(p.folder || "—")}</dd>${parsed.schedule ? `<dt>Schedule</dt><dd>${esc(parsed.schedule)}</dd>` : ""}<dt>Original title</dt><dd>${esc(p.title || "Untitled")}</dd></dl>${p.description ? `<p class="full-description">${esc(p.description)}</p>` : ""}</details>`;
}

// A flip card: presentation details on the front, analytics on the back.
export function cardMarkup(p: Presentation, flipped: boolean) {
  const parsed = parseCourseTitle(p.title);
  const flipLabel = [parsed.course, parsed.title, parsed.sections]
    .filter(Boolean)
    .join(", ");
  return `
    <article class="card" data-id="${esc(p.id)}" data-flipped="${flipped}">
    <div class="card-body"><div class="card-face card-front" ${flipped ? 'inert aria-hidden="true"' : ""}><div class="thumb-wrap" ${p.isLive ? "" : "data-preview"} ${p.thumbnail ? "data-loading" : ""}><span aria-hidden="true">▷</span>${p.thumbnail ? `<img class="thumb" src="${esc(p.thumbnail)}" alt="" loading="lazy">` : ""}<span class="duration">${esc(fmtDuration(p.durationMs))}</span><button class="secondary preview-button" data-action="preview" hidden>Preview ↻</button></div>
    <div class="info">
      <div class="card-meta"><span class="badge">${p.isLive ? "LIVE" : esc(p.status || "Viewable")}</span>${viewsMarkup(p.views)}</div>
      ${courseMarkup(p, true)}
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
      <dl>${instructorMarkup(p)}<dt>Recorded</dt><dd>${esc(fmtDate(p.recorded))}</dd></dl>
      <div data-health="${esc(p.id)}">${healthMarkup(p)}</div>
      ${detailsMarkup(p)}
    </div>
    <div class="card-actions">
      <a class="watch" href="${esc(p.watchUrl)}" target="_blank" rel="noopener">Watch ↗</a>
      <button class="secondary flip-button" data-action="flip" aria-label="View analytics for ${esc(flipLabel)}">Analytics ⤾</button>
    </div></div>
    <div class="card-face card-back" ${flipped ? "" : 'inert aria-hidden="true"'}>
    <div class="info card-back-content">
      <div class="panel-head"><span class="eyebrow">Analytics</span></div>
      ${courseMarkup(p)}
      <div class="analytics-content" aria-live="polite">${analyticsMarkup(p.id)}</div>
    </div>
    <div class="card-actions">
      <button class="secondary analytics-refresh" data-action="refresh" ${analyticsLoading(p.id) ? "disabled" : ""}>Refresh ↻</button>
      <button class="secondary flip-button" data-action="flip" aria-label="Back to presentation">Back ⤾</button>
    </div></div></div></article>`;
}

// Shimmer placeholders shown while the list loads.
export function skeletonCards(count: number) {
  return Array.from(
    { length: count },
    () => `<article class="card skeleton-card" aria-hidden="true"><div class="card-body"><div class="card-face card-front">
      <div class="thumb-wrap skeleton"></div>
      <div class="info">
        <div class="sk-row"><span class="skeleton sk-pill"></span><span class="skeleton sk-pill"></span></div>
        <span class="skeleton sk-line sk-short"></span>
        <span class="skeleton sk-line sk-title"></span>
        <span class="skeleton sk-line"></span>
        <span class="skeleton sk-line sk-medium"></span>
      </div>
      <div class="card-actions"><span class="skeleton sk-button"></span><span class="skeleton sk-button"></span></div>
    </div></div></article>`,
  ).join("");
}

// Thumbnails shimmer until their image arrives; a broken image is removed.
export function trackThumbnails() {
  document
    .querySelectorAll<HTMLImageElement>(".thumb")
    .forEach((img) => (img.onerror = () => img.remove()));
  document
    .querySelectorAll<HTMLElement>(".thumb-wrap[data-loading]")
    .forEach((wrap) => {
      const image = wrap.querySelector<HTMLImageElement>(".thumb");
      const done = () => wrap.removeAttribute("data-loading");
      if (!image || (image.complete && image.naturalWidth > 0)) return done();
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
    });
}
