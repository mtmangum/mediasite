# Changelog

All notable changes to Mediasite Lab are documented here, newest first.

## [Unreleased]

### Added

- Tests for the front-end list logic (filtering, sorting, pagination, view tiers, formatting), course-title parsing, the Mediasite helpers, and the server's HTTP surface against a fake Mediasite.
- “Most viewed” sort option (ties fall back to newest first).
- Cached later-frame thumbnails with a timestamped control to cycle through samples; viewport-triggered, serialized extraction keeps initial card rendering fast and preserves original thumbnails on failure.
- Review flags for three nearly unchanged or blank sampled frames, with clear limitations and sample timestamps.

- Front-of-card recording warnings for durations under 20 minutes, missing usable media, processing, and unavailable audio evidence, with expandable explanations and bounded, cached checks.
- Expanded viewing analytics with compact charts shown side by side on wider screens: an interactive video timeline and an equal-width watch-duration histogram, scrub readouts, exact session counts, separate zero/unknown durations, refresh, and keyboard-accessible segment inspection.
- On-demand chart fetching follows API pagination and returns aggregate session counts without viewer identities; unavailable or incomplete reports are shown explicitly.

### Changed

- The “Viewable” status badge is hidden on cards, since every listed presentation is viewable; LIVE (or any other status) still gets a badge. The view-count tag now sits at the left of the card header.
- Frame previews now step automatically through the samples in recording order (every four seconds, staggered, paused on hover or focus, off under reduced motion) with a crossfade; the cycle button is smaller and shows the timestamp plus one dot per sample.
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
