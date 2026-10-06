# Changelog

All notable changes to Mediasite Lab are documented here, newest first.

## [Unreleased]

### Added

- A static demo for GitHub Pages (`npm run build:demo`, published by `.github/workflows/pages.yml` to `https://<user>.github.io/<repo>/`). It is the real UI running against a built-in sample API (`frontend/src/demo-api.ts`): fictional courses, people, sessions, and generated thumbnails, all derived from the same sessions so counts, charts, and the heatmap agree. No credentials or Mediasite data are involved, the demo code is absent from the normal build, and the demo omits the university wordmarks and carries a “sample data” banner. Chart links work on Pages through a `404.html` fallback, and the app now works from a sub-path (`import.meta.env.BASE_URL`).
- The intro and footer show how many presentations the library actually holds instead of a fixed “100”.
- Redesigned viewing analytics: a headline row (sessions, typical watch time, share who watched nearly all, viewers and returning viewers, busiest day, most-replayed moment), plain-language insights, an engagement timeline with its most-replayed moment labelled, views by day, a weekday-by-hour heatmap of when people watch, a retention curve of how long people stay (median marked), and a device and returning-viewer panel. Charts read by hover or tap (a tooltip anchored to the mark), arrow keys on the focused timeline and retention curve, and a table behind every chart. The scrub slider is gone. Colors were checked with the dataviz palette validator (orange and blue, plus neutral gray, in light and dark).
- Shareable links for the viewing charts: `/recent/<presentation-id>/charts` opens the page with that presentation's charts dialog open. Opening the dialog updates the URL; Back and Forward move between the list and the charts, closing returns to `/recent`, and a **Copy link** button sits in the dialog header. Recordings outside the latest 100 are fetched by id (`/presentation.json`), and an unknown id shows a message instead of an empty dialog.
- Session summaries on `/viewing.json` are anonymous (device class, open time, watch time, coverage) with viewer counts by network address; IP addresses, user names, and playback tickets never leave the server.
- Quiet check for new recordings: every three minutes (and when a long-hidden tab returns) the page looks for recordings it doesn't have yet and offers them in a “N new recordings available · Show” prompt instead of reshuffling the list. `?poll=<seconds>` changes the interval for testing.
- View counts that fall back to the list's lagging number (because the live lookup failed) are shown with an asterisk, a dashed outline, and an explanatory tooltip instead of silently showing a wrong count.
- Tests for the front-end list logic (filtering, sorting, pagination, view tiers, formatting), course-title parsing, the Mediasite helpers, and the server's HTTP surface against a fake Mediasite.
- “Most viewed” sort option (ties fall back to newest first).
- Cached later-frame thumbnails with a timestamped control to cycle through samples; viewport-triggered, serialized extraction keeps initial card rendering fast and preserves original thumbnails on failure.
- Review flags for three nearly unchanged or blank sampled frames, with clear limitations and sample timestamps.

- Front-of-card recording warnings for durations under 20 minutes, missing usable media, processing, and unavailable audio evidence, with expandable explanations and bounded, cached checks.
- Expanded viewing analytics with compact charts shown side by side on wider screens: an interactive video timeline and an equal-width watch-duration histogram, scrub readouts, exact session counts, separate zero/unknown durations, refresh, and keyboard-accessible segment inspection.
- On-demand chart fetching follows API pagination and returns aggregate session counts without viewer identities; unavailable or incomplete reports are shown explicitly.

### Changed

- Course titles parse far more often (398 of 400 titles in the library, up from 347): cross-listed courses (`M E 336P/N E 336P`), codes with no dash or space (`CS311-…`), decimal and sub-sections (`ENM 382E.2`, `ECE 382N-11`), lone-surname instructors, recording-number suffixes (`_013`), and titles repeated around a dash. Non-course titles still lose their trailing record date. The charts dialog shows the parsed course and title instead of the raw file name.
- Course codes are burnt orange (orange on dark) and instructor and presenter names are slate blue on the cards, for a little color without distraction.
- Paired chart cards in the viewing analytics are the same height, with their data tables and notes pinned to the bottom.
- Pagination is shorter: page numbers collapse into a window of at most seven slots (for example `1 … 5 6 7 … 12`) instead of listing every page.
- “Little visual change” is now reserved for recordings where nothing changes anywhere in the frame (an idle screen, an empty room with no movement). Frames are compared at 192×108 grayscale and flagged only when fewer than 1% of pixels differ between samples, so handwriting, slide changes, and people moving no longer trigger it; on 14 real recordings the old rule flagged 5 and the new one flags only the genuinely idle lock screen. Cached previews are regenerated once to apply the new rule.
- Previews cycle only while a card is hovered: frames step through the samples in recording order every 1.5 seconds with a crossfade, and idle cards stay still. The cycle button appears only on hover or keyboard focus (touch screens always show it), and automatic stepping is off under reduced motion.
- The “Viewable” status badge is hidden on cards, since every listed presentation is viewable; LIVE (or any other status) still gets a badge. The view-count tag now sits at the left of the card header.
- The preview cycle button is smaller and shows the timestamp plus one dot per sampled frame, in recording order.
- A recording warning (such as “Little visual change”) now appears to the right of the “Recording checks” label instead of replacing it, so the row reads the same with or without a warning.
- Internal restructure with no intended behavior change: the server is split into route modules; the presentations page script is split into focused modules (cards, pagination, list logic, health, previews, analytics, formatting, HTTP helpers); the stylesheet is split by area into `frontend/src/styles/`. Duplicated auth-header logic, HTML escaping, time formatting, and fetch/error handling are now shared, and `mediasite.js` is formatted with Prettier like the rest.
- The API explorer's “Recent presentations” preset now requests 100 items, matching the Presentations page.
- Loading states use shimmer placeholders: skeleton cards while the list loads or refreshes, a sweeping highlight on thumbnails until the image arrives, a placeholder for pending recording checks, and skeleton blocks for analytics and viewing charts. Reduced-motion users get static placeholders.
- The “Showing 1–9 of 100” range, with “Page 1 of 12” on a second line, now lives inside the pagination controls at the start of both the top and bottom controls (the top shows the range line only), with the numbers emphasized, instead of as separate text below the cards.
- View counts on cards are now color-coded capsules: 0 red, 1–5 orange, 6–10 yellow, 11–20 lime, and 21+ green (with correct singular “1 view”).
- The presentation library now loads the 100 most recently created viewable presentations instead of 30.
- Instructor now appears above Recorded on the card front.
- Replaced the presentation-count badge with compact pagination in the top toolbar, synchronized with the existing bottom pagination.
- Removed the static “Local workspace” label from both pages.
- Restyled viewing charts with iOS-inspired headline metrics, a stepped area timeline, rounded histogram bars, subtle grid lines, and compact keyboard-accessible scrubbing.
- Added a fine monochrome grain and restrained shadows to both presentation-card faces for subtle separation from the background.

### Fixed

- Security: a web page open in your browser could silently re-point the local server's API address at its own server, after which the app sent your Mediasite username, password, and API key to that server (demonstrated against a throwaway instance). The server now refuses requests whose `Host` is not this machine (DNS rebinding), refuses cross-site API calls (`Sec-Fetch-Site` and `Origin`), requires JSON bodies for writes (which plain cross-site forms cannot send), accepts a new base URL only if it is https (http only for localhost) with no embedded login, caps request bodies at 1 MB, and sends anti-framing and anti-sniffing headers. Regression tests cover each. The static demo is unaffected (it never contacts Mediasite), and its connection form is now disabled so nobody types real credentials into it.
- View counts on the cards were far too low: the presentation list's own `NumberOfViews` is a lagging roll-up (every recording created on 09-28 read 0 while analytics showed 95 views; across the latest 100 it reported 368 against 596 real). Counts now come from each presentation's `PresentationAnalytics` total, fetched through a cached `/views.json` route (visible cards first, then the rest, with a shimmering placeholder until each arrives), so the tags, tiers, and “Most viewed” sort match the analytics on the back of the card.
- Recording warnings use a proper warning icon (triangle with exclamation mark) instead of a plain “△” that read as a delta.
- Top pagination preserves scroll position and keyboard focus; bottom pagination brings the new results into view instead of aligning the search bar with the top of the window.

## [0.1.0] - 2026-10-06

Initial release of the local Mediasite API workspace.

### Added

- Lean Vite + TypeScript front end with native DOM interactions, responsive CSS, and Prettier formatting.
- API explorer with endpoint presets, JSON body validation, session request history, and response copy/download tools.
- Server-side Mediasite authentication, connection configuration, and authenticated thumbnail fetching.
- Presentation library showing the 30 most recently created viewable presentations, nine per page, with numbered pagination, Previous/Next controls, search, sorting, refresh, and watch links.
- Readable course headings that separate course code, title, and section numbers and omit the redundant record date; expandable details retain the original title and metadata.
- On-demand aggregate analytics for each presentation, including views, unique users, watch time, viewing dates, peak connections, and browser/operating-system totals, with refresh and API response details.
- Persistent light/dark themes with system preference support and cross-tab synchronization.
- Self-hosted Inter 4.1 variable font with its SIL Open Font License, compact card typography, and aligned form controls.
- UT Austin brand colors and official horizontal wordmarks, including a white reverse for dark mode, while retaining Inter for the cards.
- A cleaner header with navigation on the right, workspace/theme controls below the divider, and Mediasite Lab lettering balanced with the UT wordmark.
- Analytics unit tests and CLI smoke checks for core API and analytics endpoints.

### Fixed

- Card flips now rotate the entire visible card, including its background and action buttons, with perspective, hidden reverse faces, and reduced-motion support.
- Analytics and Back controls occupy the same position on their respective card faces; focus follows the active face and inactive controls are inert.
- Production assets serve bundled fonts and license text with the appropriate content types.
