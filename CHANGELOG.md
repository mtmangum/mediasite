# Changelog

All notable changes to Mediasite Lab are documented here, newest first.

## [Unreleased]

### Added

- Front-of-card recording warnings for durations under 20 minutes, missing usable media, processing, and unavailable audio evidence, with expandable explanations and bounded, cached checks.
- Expanded viewing analytics with compact charts shown side by side on wider screens: an interactive video timeline and an equal-width watch-duration histogram, scrub readouts, exact session counts, separate zero/unknown durations, refresh, and keyboard-accessible segment inspection.
- On-demand chart fetching follows API pagination and returns aggregate session counts without viewer identities; unavailable or incomplete reports are shown explicitly.

### Changed

- Replaced the presentation-count badge with compact pagination in the top toolbar, synchronized with the existing bottom pagination.
- Removed the static “Local workspace” label from both pages.
- Restyled viewing charts with iOS-inspired headline metrics, a stepped area timeline, rounded histogram bars, subtle grid lines, and compact keyboard-accessible scrubbing.
- Added a fine monochrome grain and restrained shadows to both presentation-card faces for subtle separation from the background.

### Fixed

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
