# Mediasite API Tester

A small Node app with a Vite + TypeScript front end for exploring the Mediasite REST API at
`https://utengr.mediasite.com/Mediasite/Api/v1`.

- **API explorer** (`/`): send GET/POST/PUT/PATCH/DELETE requests, validate JSON bodies, revisit session request history, and copy or download formatted/raw responses.
- **Recent presentations** (`/recent`): the 30 most recently created viewable presentations, nine per page, with thumbnails, local search, sorting, refresh, watch links, and cards that flip to live aggregate analytics.
- **Smoke test** (`npm run smoke`): quick pass/fail check of key endpoints from the command line.

Requires Node 22.12 or newer. The browser uses native DOM APIs and CSS; Vite, TypeScript, and Prettier are development tools.

## Setup

```sh
npm install
cp .env.example .env
```

Then fill in `.env`:

| Variable | Purpose |
| --- | --- |
| `MEDIASITE_BASE_URL` | API root (defaults to the utengr site) |
| `MEDIASITE_API_KEY` | Sent as the `sfapikey` header |
| `MEDIASITE_USERNAME` / `MEDIASITE_PASSWORD` | Sent as HTTP Basic auth |
| `PORT` | Local server port (default 3000) |

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
search and sorting apply to all 30 loaded results and return to page one. Use the
numbered pages or **Previous** / **Next** to browse nine cards at a time. Flip a card with **Analytics** to
load all-time views, unique users, watch time, first/last watched, peak connections,
and browser/operating-system totals. **Refresh analytics** reloads those values;
otherwise they are cached in page memory. The **API responses** disclosure shows
endpoint status/timing and the aggregate JSON. Missing values appear as a dash;
permission errors and unavailable platform data are shown explicitly.

## What needs which credentials

| Endpoint | Anonymous | API key only | API key + login |
| --- | --- | --- | --- |
| `/Home`, `/$metadata` | yes | yes | yes |
| `/Presentations` | 401 | returns an empty list | yes |
| `/Folders`, `/UserProfiles` | 401 | 401 | yes |

## Notes on the API

- `/Presentations` returns only `Id`, `Title` and `Status` by default. Add `$select=full`
  to get description, dates, duration, owner, thumbnail URL and so on.
- Duration is in milliseconds.
- Scheduled recordings (`Status` of `Record`) have no media or thumbnail yet. The recent
  page filters to `Status eq 'Viewable'`.
- Thumbnails are fetched through the local `/thumb` route, which adds credentials and only
  allows the configured Mediasite host.

## Files

- `server.js` — local web server and routes (`/`, `/recent`, `/recent.json`, `/request`, `/config`, `/thumb`, `/analytics.json?id=…`)
- `analytics.js` — aggregate analytics requests and normalization
- `mediasite.js` — shared request helper (auth headers, timing)
- `smoke-test.js` — CLI checks
- `frontend/index.html` / `frontend/recent.html` — accessible page markup
- `frontend/src/explorer.ts` / `presentations.ts` — page interactions
- `frontend/src/shared.ts` — shared DOM helpers and API types
- `frontend/src/style.css` — responsive visual system
- `vite.config.mjs` / `tsconfig.json` — build and strict type-check settings
