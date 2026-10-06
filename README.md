# Mediasite API Tester

A small Node app with a Vite + TypeScript front end for exploring the Mediasite REST API at
`https://utengr.mediasite.com/Mediasite/Api/v1`.

Current version: **0.1.0**. See the [changelog](CHANGELOG.md) for release notes.

- **API explorer** (`/`): send GET/POST/PUT/PATCH/DELETE requests, validate JSON bodies, revisit session request history, and copy or download formatted/raw responses.
- **Recent presentations** (`/recent`): the 100 most recently created viewable presentations, nine per page, with grid/list views, thumbnails, local search, sorting, refresh, watch links, and live analytics.
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

## Quick start

You need **[Node.js](https://nodejs.org/) 22.12+** (includes npm), **Git**, and a
Mediasite API key plus username/password. Your account needs **API Access** and
permission to read your presentations; browser SSO alone is not enough.

### 1. Install

```sh
git clone https://github.com/mtmangum/mediasite.git
cd mediasite
npm ci
cp .env.example .env
```

Already have a checkout? Run the last two commands in the folder containing
`package.json`. On PowerShell, use `Copy-Item .env.example .env` to copy the file.

### 2. Get an API key

1. Open `https://YOUR-SERVER/Mediasite/Api/Docs/ApiKeyRegistration.aspx` ([UT Engineering](https://utengr.mediasite.com/Mediasite/Api/Docs/ApiKeyRegistration.aspx)). Adjust the installation path for your server.
2. Sign in as an administrator, enter an application name, and click **Submit**.
3. Copy the generated key. If you lack access, ask your Mediasite administrator for a key and an API account.

See [Mediasite's official guide](https://learn.mediasite.com/course/getting-started-with-mediasite-api/lessons/setting-up-an-api-key/).

### 3. Configure

Edit `.env` with your connection details:

```dotenv
MEDIASITE_BASE_URL=https://YOUR-SERVER/Mediasite/Api/v1
MEDIASITE_USERNAME="your-api-username"
MEDIASITE_PASSWORD="your-api-password"
MEDIASITE_API_KEY="your-generated-api-key"
PORT=3000
```

The supplied example defaults to UT Engineering. Keep `.env` private (it is
gitignored), and restart the app after changing it.

### 4. Run

```sh
npm run dev
```

Open **[Presentations](http://localhost:3000/recent)** or the
**[API explorer](http://localhost:3000)**. Leave the terminal running; **Ctrl+C** stops
it. Use `npm start` to build and serve without live reload.

**Check access:** in the explorer, send GET `/Presentations?$top=3&$select=full`.
Expect `200` with items in `value`. `npm run smoke` also checks your `.env` connection,
but can pass with no visible recordings.

**Optional previews:** install [FFmpeg](https://ffmpeg.org/download.html) and check
`ffmpeg -version`. If needed, set `FFMPEG_PATH="/path/to/ffmpeg"` in `.env`.
**No credentials yet?** Try the [sample-data demo](#demo-site-github-pages).

### Common issues

| Problem                              | Fix                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Port in use                          | Set `PORT=3100` in `.env`, restart, and open `http://localhost:3100`.          |
| `401` / `403` or empty library       | Check key, login, API Access, and content permissions with your administrator. |
| Timeout / login page instead of JSON | Check VPN/network access and the API URL ending in `/Api/v1`.                  |
| Build fails                          | Check `node --version` is 22.12+ and run `npm ci`.                             |

## Development commands

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run build`        | Type-check and build into `dist/`        |
| `npm test`             | Run tests against a local fake Mediasite |
| `npm run typecheck`    | Check TypeScript                         |
| `npm run format:check` | Check formatting                         |
| `npm run format`       | Apply formatting                         |
| `npm run smoke`        | Check the configured Mediasite API       |

Restart the dev server after backend or Vite configuration changes.

## Using the app

Both modes serve the browser and API from the same localhost origin. Production files
are generated in `dist/`. Vite runs as middleware in development; credentials are never
passed to the front-end build. Connection changes apply in memory until restart; blank
password/API key fields retain the existing secrets. Request history stores only the
method, path, and status in page memory, and resets when the page reloads. Presentation
search and sorting (including **Most viewed**) apply to all 100 loaded results and return to page one.
Each card's view count is a color-coded capsule: 0 red, 1–5 orange, 6–10 yellow, 11–20 lime,
21+ green. Use the
numbered pages or **Previous** / **Next** below the presentations to browse nine at a time.
Switch between **Grid** and **List** in the toolbar; your choice is saved in the browser
and switching keeps your current page, search, and sort. List rows open the viewing
charts directly with **Analytics**. In grid view, flip a card with **Analytics** to
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
slide/whiteboard frames, and rejects mostly dark or blank frames. Starting from the
most detailed frame, a card stays still until you hover over it, then steps through
the samples in recording order (beginning, middle, end) every second and a half, with a
crossfade; reduced-motion settings turn automatic stepping off. On hover (or keyboard
focus; always on touch screens), a small button at the top left shows the frame's
timestamp and one dot per sample; click it to step manually. The original thumbnail
stays visible while previews load, or when extraction is unavailable.

Two screening flags exist, and both are meant for recordings with nothing happening.
**Blank sampled frames** means all three samples are dark or visually blank.
**Little visual change** means the three samples are essentially identical across the
whole frame (fewer than 1% of pixels differ noticeably, compared at 192×108 grayscale),
such as an idle lock screen over an empty room. Slides that change, new handwriting, or
anyone moving in the camera view all count as change, so ordinary lectures with long
stretches of one slide are not flagged. Tuned on real recordings: an idle screen changed
0.3–0.5% between samples, while every real lecture changed 2.4% or more. These are
screening signals, not proof that a class was empty; listen and review before drawing a
conclusion. Checks currently run on first viewing, not as a scheduled audit of every
recording.

Preview extraction needs FFmpeg on the server (`FFMPEG_PATH` can override its
executable). Work is serialized, uses bounded HTTP range reads (up to 24 MiB per
recording), and caches repeated media ranges within each job. Credential-scoped,
revision-aware images are cached locally for seven days under `.cache/thumbnails`,
with a limit of 100 recordings. This directory is ignored by Git. Credentials and
source video URLs stay server-side; Mediasite's original thumbnails are unchanged.

## About view counts

The presentation list's `NumberOfViews` is a lagging roll-up: new recordings read 0 for
days even when they are being watched. The cards therefore show `TotalViews` from each
presentation's `PresentationAnalytics` record, the same number as the back of the card.
`/PresentationAnalytics` ignores `$filter` and `$orderby` and fails on `or` filters, so
totals are looked up one presentation at a time (eight in parallel, visible cards first),
cached on the server for five minutes, and bypassed by the **Refresh** button. A shimmering
placeholder stands in until each count arrives; if a lookup fails, the list's count is used.

## Demo site (GitHub Pages)

`npm run build:demo` builds a static copy of the presentations page into `dist-demo/` that
runs entirely in the browser against built-in sample data (fictional courses and viewers,
generated thumbnails; no Mediasite connection, credentials, or real recordings). The API
explorer is local-only and is not part of the public site. `npm run preview:demo`
serves it at http://localhost:4173/mediasite/. The sub-path comes from `DEMO_BASE` (default
`/mediasite/`).

To publish it, enable **Settings → Pages → Build and deployment → Source: GitHub Actions**
on the repository. After that every push to `main` runs `.github/workflows/pages.yml`
(format check, tests, demo build, deploy) and the site appears at
`https://<user>.github.io/<repo>/` (the presentations page; `/recent` is the same page). Shareable chart links work there through a `404.html`
copy of the app, which GitHub Pages serves for unknown paths.

## Viewing analytics and shareable links

Open **Viewing charts** from the back of a grid card, or **Analytics** from a list row. The dialog shows headline numbers, a few
plain-language observations, and charts for engagement across the recording, views by day,
when people watch (in your time zone), how long people stay, and the audience. Hover or tap
a chart to read it; every chart has a "View exact counts" table. Sessions are summarized on
the server without identities: device class, open time, watch time and coverage, plus counts
of distinct and returning viewers by network address (all viewing here is anonymous, so
Mediasite's own "unique users" is always 1).

Each presentation's charts have a URL: `/recent/<presentation-id>/charts`. Opening the
dialog sets it, **Copy link** copies it, Back and Forward move between the list and the
charts, and a link to an older recording (outside the latest 100) works too.

## New recordings

The page does not poll constantly: every three minutes (and when a tab that was hidden for
a while becomes visible) it quietly fetches the list again. If there are recordings it
has not shown yet, a prompt offers them; nothing moves until you click **Show**. The
**Refresh** button reloads immediately. Add `?poll=10` to the URL to check every ten
seconds while testing.

## Security notes

The local server holds your Mediasite login and API key and calls Mediasite on your behalf,
so it is built to be reachable only by this app's own pages:

- It listens on `127.0.0.1` only, and answers only requests addressed to `localhost`,
  `127.0.0.1`, or `[::1]` on its own port, which defeats DNS-rebinding pages.
- Cross-site requests (anything a browser labels `Sec-Fetch-Site` other than `same-origin`
  or `none`, or with a foreign `Origin`) are refused, and writes must be `application/json`.
- A new base URL must be `https://` (or `http://` for localhost) with no embedded login,
  because your credentials are sent to it. Credentials are never returned to the browser.
- Responses are sent with `X-Frame-Options: DENY`, `nosniff`, and `no-referrer`.

The API explorer is **read-only by default**: only `GET` can be selected until you switch on
**Allow changes** (it resets on every page load). With the switch on, `POST`, `PUT`, `PATCH`,
and `DELETE` are sent to Mediasite with your real credentials and can modify or delete data,
so use an account with only the permissions you want it to have. The server enforces this too:
it refuses any write the page has not explicitly allowed. The GitHub Pages demo does not
include the explorer and never contacts Mediasite.

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
- `routes/` — one module per concern: `connection.js` (`/config`, `/request`), `presentations.js` (`/recent.json`, `/presentation.json?id=…`, `/thumb`), `analytics.js` (`/analytics.json`, `/viewing.json`), `views.js` (`/views.json?ids=…`), `health.js` (`/health.json`), `previews.js` (`/preview.json`, `/preview`)
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
- `frontend/src/health.ts` / `previews.ts` / `analytics.ts` / `live-views.ts` — per-card recording checks, frame previews, analytics, and live view totals
- `frontend/src/viewing-charts.ts` / `viewing-stats.ts` — viewing analytics charts, and the pure statistics behind them
- `frontend/src/route.ts` — shareable chart-link URLs (base-path aware)
- `frontend/src/demo-api.ts` / `demo-install.ts` / `demo-hook.ts` — the demo build's built-in sample API and the switch that installs it
- `vite.demo.config.mjs` / `.github/workflows/pages.yml` — the static demo build and its GitHub Pages deployment
- `frontend/src/shared.ts` / `format.ts` / `http.ts` / `store.ts` — shared types, formatting and escaping, JSON fetch helpers, loaded-list state
- `frontend/src/style.css` — imports `frontend/src/styles/*.css` in cascade order (base, layout, explorer, list, cards, responsive, card-flip, analytics, dialog, charts, card-extras, loading)
- `vite.config.mjs` / `tsconfig.json` — build and strict type-check settings
