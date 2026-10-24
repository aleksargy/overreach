# Overreach

A personal PWA that replaces Garmin Connect and Hevy for one person (Alex). It pulls runs, football, rides, swims and watch health data from the Garmin Personal API, and has its own strength logger. It's deployed to Netlify and added to an iPhone home screen. The name is a placeholder (see Renaming).

Look and feel is the top priority. Read the design rules before changing any screen.

## Commands

```sh
npm install
npm run dev          # app on :5173, sample data until the first sync; /api is proxied to :8788
npm run dev:api      # the real functions + a fake Garmin with a year of history on :8788, passphrase "dev"
npm test             # sync engine against the fake Garmin, and the functions against a local Blobs server
npm run typecheck
npm run build        # tsc + vite build into dist/
npm run build:preview  # one self-contained HTML file: dist-preview/preview.html
npm run icons        # re-render the icon PNGs (needs Playwright)
npx prettier --write <files>   # no semicolons, single quotes, width 180
```

To see live mode locally, run `npm run dev:api` and `npm run dev` together, open Settings, type `dev` as the passphrase and tap Sync now. The fake's Blobs live in `.netlify/dev-blobs`; delete that folder to start over.

The preview build uses a memory router. A bare hash picks the first screen: `#football`, `#lift`, `#body`, `#feed`, `#prefs`.

## Layout

- `src/screens/` one folder per tab: today, feed (plus activity detail), football (log sheet, rating reveal, match report, player card), lift (logger overlay, exercises, history), body, settings.
- `src/components/` shared UI (`ui/`), charts (`charts/`), the tab bar, the activity row.
- `src/data/` the store, the derived world, the API client, types, exercises, and generated sample data (`sample/`).
- `src/lib/` pure logic with no React: football rating and analysis, readiness, training load, lift progression, schedule guessing, Hevy CSV import, formatting.
- `netlify/functions/` `status`, `sync` (POST), `data`, `stream`, and `scheduled-sync` (hourly).
- `netlify/lib/` the Garmin client, the sync engine, Garmin-to-app mapping, FIT decoding, the Blobs wrapper, request helpers.
- `tests/` the fake Garmin (realistic shapes, range limits, FIT files) and the tests.
- `scripts/` the local API, icon rendering, the preview inliner.

## How data flows

- **Store** (`src/data/store.ts`, zustand) holds what the person types: matches, workouts, routines, custom exercises, weigh-ins, profile and sync settings. It's saved to IndexedDB under `overreach:user:v1`; the Garmin cache is saved separately under `overreach:garmin:v1`. Nothing is written until IndexedDB has answered at start-up, so a slow start can't save defaults over real data. Saves happen straight away, except while typing into a live workout (300 ms pause), and any pending save is flushed when the app is hidden.
- **World** (`src/data/world.ts`, `useWorld()`) derives everything the screens show: Garmin activities (or sample data before the first sync) merged with logged workouts and matches, plus load, readiness, the weekly schedule and unrated games. Screens read the world and write through store actions.
- **Sample mode** shows generated data with a "Sample data" badge until the first successful sync. After that the app is in live mode.
- **Streams** (HR, speed, GPS, laps) load per activity from `/api/stream?id=g-…`. The server decodes the FIT file once and caches it in Blobs.
- Match ratings and the player card are computed in `src/lib/football.ts` from what's logged (score, goals, assists, how it felt, moments) plus the watch's physical numbers when the game was recorded.

## Server (Netlify)

- Environment variables: `GARMIN_PERSONAL_API_KEY` (from connect.garmin.com/app/settings/personalApiToken) and `OVERREACH_PASSPHRASE` (any phrase; the same one is typed into Settings). The Garmin key must never reach browser code.
- Every endpoint checks the `x-overreach-key` header against the passphrase.
- Data lives in the Blobs store `overreach` (strong consistency). Keys: `state`, `activities`, `dailies`, `body`, `stream/<id>`, `shapes`, `token`, `lock`.
- Sync runs in steps that fit Netlify's limits: 25 s per call from the app, 18 s for the hourly job, at most 30 Garmin calls per step. A lock in Blobs stops the hourly job and the app from overlapping. Each step does, in order: the recent pass (every 10 minutes), football FIT files still to read, the activity backfill (two years), the health backfill (180-day chunks; sleep only for 120 days).
- Garmin limits per call: activities 50 per page, daily summaries and HRV 180 days, sleep 28 days, weight 365 days. Over-long ranges come back as empty 400s or 500s.
- A 429 pauses the sync and keeps what was fetched. A 401 re-exchanges the token once. An endpoint that keeps failing is named in `warnings` and skipped.
- `/api/status?shapes` returns the field types Garmin actually sent, without any values. Use it to fix `netlify/lib/mapping.ts` against real data; the readers there are deliberately tolerant.
- The Personal API is pull-only (no webhooks, no pushing workouts), and keys expire after 30 days to a year and must be renewed by hand.

## Design rules

- Dark only. The chrome is monochrome; colour is reserved for data: HR zones z1 to z5 (blue, green, yellow, orange, red), match ratings, readiness.
- Motifs: the spectrum gradient hairline, one chamfered corner on hero cards (`.chamfer`), big condensed numbers.
- Type: Big Shoulders Display for titles and numbers (`.num`), Figtree for body text, JetBrains Mono for labels and kickers (`.label`).
- Colours are RGB CSS variables in `src/styles/index.css`, used through Tailwind (`bg-ink-1`, `text-fg-3`, `border-line`, `text-z4`). Don't hardcode hex colours in components.
- Phone first (390 px wide), 16 px gutters that respect safe areas, bottom tab bar. Input happens in sheets; reports are full screens.
- Copy is short and plain with some personality (the match report writes back-page headlines). Hide empty things rather than showing dashes or zeros.
- Motion comes from `motion/react` springs, and `MotionConfig reducedMotion="user"` is respected.
- After a UI change, look at it at 390 × 844 in both sample and live mode.

## Renaming

Change `APP_NAME` in `src/config.ts`, the `<title>` in `index.html`, and `name`/`short_name` in `public/manifest.webmanifest`. Run `npm run icons` if the mark changes. The Blobs store name and the storage keys say "overreach"; leave them unless you also migrate the data.

## Deploying

1. Netlify: connect the repo. `netlify.toml` already sets the build (`npm run build`), the publish folder (`dist`), the functions folder and the `/api/*` redirect.
2. Add `GARMIN_PERSONAL_API_KEY` and `OVERREACH_PASSPHRASE` in the site's environment variables, then deploy.
3. On the iPhone, open the site in Safari, then Share → Add to Home Screen.
4. In the app: Settings → passphrase → Sync now. The first sync walks two years of history in steps and takes a few minutes. After that the hourly job and app launches keep it fresh.

## Status

Done: Garmin sync, feed, activity detail, Today readiness, football (log a match, rating reveal, match report with heatmap and engine stats, season, form, records, player card after three rated games), the lift logger (routines, RPE, progression targets, custom exercises, Hevy CSV import), body (weight trend, recovery, measurements), offline shell.

Next: check the mapping against Alex's real Garmin data with `/api/status?shapes`, pick a name, then ghost replays.
