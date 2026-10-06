# Mediasite API Tester

A small, dependency-free Node app for exploring the Mediasite REST API at
`https://utengr.mediasite.com/Mediasite/Api/v1`.

- **API tester** (`/`): send GET/POST/PUT/PATCH/DELETE requests and inspect the response.
- **Recent presentations** (`/recent`): the last five viewable presentations, with thumbnails and details.
- **Smoke test** (`npm run smoke`): quick pass/fail check of key endpoints from the command line.

Requires Node 22 or newer. There is nothing to install.

## Setup

```sh
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
npm start          # http://localhost:3000
PORT=3100 npm start
npm run smoke
```

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

- `server.js` — local web server and routes (`/`, `/recent`, `/recent.json`, `/request`, `/config`, `/thumb`)
- `mediasite.js` — shared request helper (auth headers, timing)
- `smoke-test.js` — CLI checks
- `public/index.html` — API tester UI
- `public/recent.html` — recent presentations page
