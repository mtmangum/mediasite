# Mediasite API Tester

A small Node app with a Vite + TypeScript front end for exploring the Mediasite REST API at
`https://utengr.mediasite.com/Mediasite/Api/v1`.

Current version: **0.1.0**. See the [changelog](CHANGELOG.md) for release notes.

- **API explorer** (`/`): send GET/POST/PUT/PATCH/DELETE requests, validate JSON bodies, revisit session request history, and copy or download formatted/raw responses.
- **Recent presentations** (`/recent`): the 100 most recently created viewable presentations, nine per page, with thumbnails, local search, sorting, refresh, watch links, and cards that flip to live aggregate analytics.
- **Smoke test** (`npm run smoke`): quick pass/fail check of key endpoints from the command line.

Requires Node 22.12 or newer. The browser uses native DOM APIs and CSS; Vite, TypeScript, and Prettier are development tools.

Typography uses a self-hosted Inter 4.1 variable font, with system fonts as a fallback
and monospace for API data. The font is bundled with the app, so browsers make no
requests to external font services. Its SIL Open Font License is included at
`frontend/public/fonts/OFL.txt`.

The interface uses [UT's brand palette](https://umac.utexas.edu/brand-center/colors/),
with `#bf5700` burnt orange for primary actions and charcoal/neutral surfaces for
dark mode. Inter remains the UI and card typeface. The primary horizontal university
wordmark in `frontend/public/brand/` comes from the
[Brand Center's official SVG](https://umac.utexas.edu/wp-content/themes/bellmont/dist/images/utexas-primary-horizontal-logo.svg).
Its vector paths and proportions are preserved; the dark-mode asset uses the
[permitted white reverse](https://brand.utexas.edu/identity/logos/).

## Setup

```sh
npm install
cp .env.example .env
```

Then fill in `.env`:

| Variable                                    | Purpose                                |
| ------------------------------------------- | -------------------------------------- |
| `MEDIASITE_BASE_URL`                        | API root (defaults to the utengr site) |
| `MEDIASITE_API_KEY`                         | Sent as the `sfapikey` header          |
| `MEDIASITE_USERNAME` / `MEDIASITE_PASSWORD` | Sent as HTTP Basic auth                |
| `PORT`                                      | Local server port (default 3000)       |

`.env` is gitignored. Credentials stay on the server; the browser never sees them.

## Run

```sh
npm run dev        # http://localhost:3000, front-end live reload
npm start          # type-check, build, and serve production assets
PORT=3100 npm run dev
npm run build      # strict TypeScript check + production build
npm test           # analytics normalization and error-handling checks
npm run typecheck
npm run format:check
npm run format
npm run smoke
```

Restart `npm run dev` after changing backend files or Vite configuration.

Both modes serve the browser and API from the same localhost origin. Production files
are generated in `dist/`. Vite runs as middleware in development; credentials are never
passed to the front-end build. Connection changes apply in memory until restart; blank
password/API key fields retain the existing secrets. Request history stores only the
method, path, and status in page memory, and resets when the page reloads. Presentation
search and sorting (including **Most viewed**) apply to all 100 loaded results and return to page one.
Each card's view count is a color-coded capsule: 0 red, 1–5 orange, 6–10 yellow, 11–20 lime,
21+ green. Use the
numbered pages or previous/next arrows in the top toolbar, or **Previous** / **Next**
below the cards, to browse nine cards at a time. Flip a card with **Analytics** to
load all-time views, unique users, watch time, first/last watched, peak connections,
and browser/operating-system totals. **Refresh analytics** reloads those values;
otherwise they are cached in page memory. The **API responses** disclosure shows
endpoint status/timing and the aggregate JSON. Missing values appear as a dash;
permission errors and unavailable platform data are shown explicitly.

Choose **Viewing charts** on the analytics side of a card to open the expanded
view. The timeline shows reported segment views along the recording; scrub across the plot
or use the keyboard-accessible slider for exact counts. Compact headline numbers,
a stepped area timeline, and rounded histogram bars keep the charts readable. The duration histogram groups sessions
with recorded watch time into equal-width intervals and lists zero-second opens
and unavailable durations separately. Sessions are not unique viewers, and watch
time includes replay. Chart data loads only when opened, follows API pagination,
and is cached in page memory until **Refresh charts** is selected. Viewer names,
IP addresses, and playback tickets are not returned to the browser. Escape or
**Close** returns to the card.

Cards also show recording checks on the front. Recordings under 20 minutes are
flagged for review; live recordings are excluded. File checks look for completed
current-revision audio/video with positive file size and duration. Audio checks
use waveform metadata: a missing waveform means **Audio not verified**, not
confirmed silence. Expand the check for the evidence and explanation. Only the
visible page is checked, with two checks in flight and a five-minute server cache.
External videos skip local-file checks.

Thumbnail previews load as cards enter the viewport. The server samples downloadable
video at approximately 35%, 50%, and 70% through the recording, favors detailed
slide/whiteboard frames, and rejects mostly dark or blank frames. Use the timestamped
**Preview ↻** button to cycle through usable samples. The original thumbnail stays
visible while previews load, or when extraction is unavailable.

Three nearly identical samples produce a **Little visual change** review flag;
three dark/blank samples produce **Blank sampled frames**. These are screening
signals, not proof that a class was empty. Static slides and audio-led lectures can
be valid; listen and review before drawing a conclusion. Checks currently run on
first viewing, not as a scheduled audit of every recording.

Preview extraction needs FFmpeg on the server (`FFMPEG_PATH` can override its
executable). Work is serialized, uses bounded HTTP range reads (up to 24 MiB per
recording), and caches repeated media ranges within each job. Credential-scoped,
revision-aware images are cached locally for seven days under `.cache/thumbnails`,
with a limit of 100 recordings. This directory is ignored by Git. Credentials and
source video URLs stay server-side; Mediasite's original thumbnails are unchanged.

## What needs which credentials

| Endpoint                    | Anonymous | API key only          | API key + login |
| --------------------------- | --------- | --------------------- | --------------- |
| `/Home`, `/$metadata`       | yes       | yes                   | yes             |
| `/Presentations`            | 401       | returns an empty list | yes             |
| `/Folders`, `/UserProfiles` | 401       | 401                   | yes             |

## Notes on the API

- `/Presentations` returns only `Id`, `Title` and `Status` by default. Add `$select=full`
  to get description, dates, duration, owner, thumbnail URL and so on.
- Duration is in milliseconds.
- Scheduled recordings (`Status` of `Record`) have no media or thumbnail yet. The recent
  page filters to `Status eq 'Viewable'`.
- Thumbnails are fetched through the local `/thumb` route, which adds credentials and only
  allows the configured Mediasite host.

## Files

Back end (Node, no dependencies):

- `server.js` — entry point: shared state, route dispatch, static files, optional Vite dev middleware
- `routes/` — one module per concern: `connection.js` (`/config`, `/request`), `presentations.js` (`/recent.json`, `/thumb`), `analytics.js` (`/analytics.json`, `/viewing.json`), `health.js` (`/health.json`), `previews.js` (`/preview.json`, `/preview`)
- `static.js` / `http-utils.js` — static file serving and request/response helpers
- `mediasite.js` — connection config, auth headers (`authHeaders`), and request helper
- `thumbnails.js` — bounded frame extraction, visual review signals, and local preview caching
- `recording-health.js` — duration, current media, and audio-waveform checks
- `analytics.js` — aggregate analytics requests and normalization
- `smoke-test.js` — CLI checks

Front end (Vite + TypeScript):

- `frontend/index.html` / `frontend/recent.html` — accessible page markup
- `frontend/src/explorer.ts` — API explorer page
- `frontend/src/presentations.ts` — presentations page: loading, rendering, paging, and event wiring
- `frontend/src/list.ts` — pure filtering, sorting, and pagination
- `frontend/src/cards.ts` — card markup, view-count tiers, skeleton placeholders
- `frontend/src/pagination.ts` — page-status and page-button markup
- `frontend/src/health.ts` / `previews.ts` / `analytics.ts` — per-card recording checks, frame previews, and analytics
- `frontend/src/viewing-charts.ts` — expanded analytics charts and segment inspection
- `frontend/src/shared.ts` / `format.ts` / `http.ts` / `store.ts` — shared types, formatting and escaping, JSON fetch helpers, loaded-list state
- `frontend/src/style.css` — imports `frontend/src/styles/*.css` in cascade order (base, layout, explorer, list, cards, responsive, card-flip, analytics, dialog, charts, card-extras, loading)
- `vite.config.mjs` / `tsconfig.json` — build and strict type-check settings
