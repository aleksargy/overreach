# Overreach

A personal PWA that replaces Garmin Connect and Hevy for one person (Alex). It pulls runs, football, rides, swims and watch health data from the Garmin Personal API, and has its own strength logger. It's deployed to Netlify and added to an iPhone home screen. The name is a placeholder (see Renaming).

Look and feel is the top priority. Read the design rules before changing any screen. Running and football are Alex's main sports, so they get the depth; the other sports are synced and shown but get no new work for now.

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

The preview build uses a memory router. A bare hash picks the first screen: `#run`, `#football`, `#body`, `#feed`, `#lift`, `#prefs`.

## Layout

- `src/screens/` one folder per area: today (plus the + log sheet), run, football (log sheet, rating reveal, match report, player card), body, feed ("All activity", opened from Today, plus activity detail), settings, and lift (logger overlay, exercises, history), which is built but hidden from the tab bar.
- `src/components/` shared UI (`ui/`), charts (`charts/`), the tab bar, the activity row.
- `src/data/` the store, the derived world, the API client, types, exercises, and generated sample data (`sample/`).
- `src/lib/` pure logic with no React: running analysis (`running.ts`), football rating and analysis, readiness, training load, lift progression, schedule guessing, Hevy CSV import, formatting.
- `netlify/functions/` `status`, `sync` (POST), `data`, `stream`, and `scheduled-sync` (once a day, 05:00 UTC).
- `netlify/lib/` the Garmin client, the sync engine, Garmin-to-app mapping, FIT decoding, run weather from Open-Meteo, the Blobs wrapper, request helpers.
- `tests/` the fake Garmin (realistic shapes, range limits, FIT files, plus a fake Open-Meteo) and the tests.
- `scripts/` the local API, icon rendering, the preview inliner.

## How data flows

- **Store** (`src/data/store.ts`, zustand) holds what the person types: matches, workouts, routines, custom exercises, weigh-ins, profile and sync settings. It's saved to IndexedDB under `overreach:user:v1`; the Garmin cache is saved separately under `overreach:garmin:v1`. Nothing is written until IndexedDB has answered at start-up, so a slow start can't save defaults over real data. Saves happen straight away, except while typing into a live workout (300 ms pause), and any pending save is flushed when the app is hidden.
- **World** (`src/data/world.ts`, `useWorld()`) derives everything the screens show: Garmin activities (or sample data before the first sync) merged with logged workouts and matches, plus load, readiness, the weekly schedule and unrated games. Screens read the world and write through store actions.
- **Sample mode** shows generated data with a "Sample data" badge until the first successful sync. After that the app is in live mode.
- **Streams** (HR, speed, GPS, laps) load per activity from `/api/stream?id=g-…`. The server decodes the FIT file once and caches it in Blobs.
- **Run summaries.** During sync the server reads each run's FIT file (runs from the last year, `RUN_DAYS`) and stores a small `run` summary on the activity: speed, heart rate and grade minute by minute, best efforts from 1 to 60 minutes, the start rounded to 0.1° (about 10 km), and the temperature and dew point. So the Run tab never needs a stream download.
- **Running model** (`src/lib/running.ts`, `useRunModel()`) is fitted in the browser from those summaries. A within-run regression of heart rate on speed, climb, descent and minutes gives shared slopes; backfitting then splits each run's residual into fitness (a 12-day kernel), heat (bpm per °C above 12) and the football hangover (runs within 36 hours of a game). From that come the aerobic engine (pace at a fixed heart rate, 68% of reserve, flat, cool and fresh), hill, heat and football costs in s/km, durability (the minute heart rate drifts 5 bpm in long, even runs), and critical speed and D′ from the upper hull of 90 days of best efforts, with race predictions. Each claim shows only when the data supports it (`clear`, `solid`, the evidence checks), and the screen says why when it doesn't. The sample data has these effects built in, and `tests/running.test.ts` checks the model finds them.
- Match ratings and the player card are computed in `src/lib/football.ts` from what's logged (score, goals, assists, how it felt, moments) plus the watch's physical numbers when the game was recorded.

## Server (Netlify)

- Environment variables: `GARMIN_PERSONAL_API_KEY` (from connect.garmin.com/app/settings/personalApiToken) and `OVERREACH_PASSPHRASE` (any phrase; the same one is typed into Settings). The Garmin key must never reach browser code.
- Every endpoint checks the `x-overreach-key` header against the passphrase.
- Data lives in the Blobs store `overreach` (strong consistency). Keys: `state`, `activities`, `dailies`, `body`, `stream/<id>`, `shapes`, `token`, `lock`.
- Opening the app is the main trigger: it runs a step without forcing, and the server only calls Garmin if its last recent pass was more than 10 minutes ago, however often the app opens. The app downloads `/api/data` only when the server's `dataAt` has moved. Sync now in Settings forces a fresh pass. A job at 05:00 UTC is the safety net (Alex asked for few calls, to stay clear of rate limits and junk requests).
- Sync runs in steps that fit Netlify's limits: 25 s per call from the app, 18 s for the morning job, at most 30 Garmin calls per step. A lock in Blobs stops the job and the app from overlapping. Each step does, in order: the recent pass (health data since the last pass, at least two weeks; if that's over 180 days the health history is walked again), run and football FIT files still to read, weather for new runs, the activity backfill (two years), the health backfill (180-day chunks; sleep only for 120 days).
- Garmin limits per call: activities 50 per page, daily summaries and HRV 180 days, sleep 28 days, weight 365 days. Over-long ranges come back as empty 400s or 500s.
- A 429 pauses the sync and keeps what was fetched. A 401 re-exchanges the token once. An endpoint that keeps failing is named in `warnings` and skipped.
- Weather comes from Open-Meteo (free, no key): the archive API, or the forecast API for runs in the last six days. Only the rounded location and a date range go out, one request per place. A failure waits 30 minutes and never holds up the sync.
- `/api/status?shapes` returns the field types Garmin actually sent, without any values. Use it to fix `netlify/lib/mapping.ts` against real data; the readers there are deliberately tolerant.
- The Personal API is pull-only (no webhooks, no pushing workouts), and keys expire after 30 days to a year and must be renewed by hand.

## Design rules

- Dark only, minimal and sleek: fewer boxes, more space, quiet type. The chrome is near-black and grey; colour is reserved for data: HR zones z1 to z5 (blue, green, yellow, orange, red), sports (`sportColor()`), match ratings, readiness.
- Type: Geist for everything, Geist Mono only for chart axis labels and code. Sentence case everywhere, no letter-spaced capitals. Hero numbers are big and light (`.num-hero`); other numbers are medium weight with tabular figures (`.num`). Small grey captions are `.label`, secondary lines `.meta`. Screen titles are 30 px semibold, section titles 17 px.
- Surfaces: cards are `.card` (18 px radius, one step lighter than the page, a faint inner ring). A list is one card of rows split by hairlines (`.list`; set `--inset` so the line starts after an icon), not a card per row. Buttons, chips and segmented controls are pills. Inside sheets, surfaces step up to `ink-2`.
- Charts are thin: 1.5 px lines, capsule bars, faint or no grid, small mono labels.
- Colours are RGB CSS variables in `src/styles/index.css`, used through Tailwind (`bg-ink-1`, `text-fg-3`, `text-z4`) or `sportColor()`. Don't hardcode hex colours in components.
- Phone first (390 px wide), 16 px gutters that respect safe areas, bottom tab bar: Today, Run, Football, Body. Input happens in sheets (the + on Today opens the log sheet); reports are full screens.
- Copy is short and plain with some personality (the match report writes back-page headlines). Hide empty things rather than showing dashes or zeros.
- Motion comes from `motion/react` springs, and `MotionConfig reducedMotion="user"` is respected.
- After a UI change, look at it at 390 × 844 in both sample and live mode.

## Renaming

Change `APP_NAME` in `src/config.ts`, the `<title>` in `index.html`, and `name`/`short_name` in `public/manifest.webmanifest`. Run `npm run icons` if the mark changes. The Blobs store name and the storage keys say "overreach"; leave them unless you also migrate the data.

## Deploying

1. Netlify: connect the repo. `netlify.toml` already sets the build (`npm run build`), the publish folder (`dist`), the functions folder and the `/api/*` redirect.
2. Add `GARMIN_PERSONAL_API_KEY` and `OVERREACH_PASSPHRASE` in the site's environment variables, then deploy.
3. On the iPhone, open the site in Safari, then Share → Add to Home Screen.
4. In the app: Settings → passphrase → Sync now. The first sync walks two years of history in steps and takes a few minutes. After that, opening the app keeps it fresh, with the morning job as a backstop.

## Status

Done: Garmin sync (on app open), the minimal redesign, Today (readiness with a week of history, football, the week, load, latest), Run (aerobic engine and its trend, weekly distance, critical speed with race predictions, durability, what slows you down: hills, heat and football legs; plus an analysis block on each run), football (log a match, rating reveal, match report with heatmap and engine stats, season, form, records, player card after three rated games), body (weight trend, recovery, last night; the weigh-in takes weight only, since Alex doesn't track measurements or body fat yet), all activity and activity detail, the lift logger (routines, RPE, progression targets, custom exercises, Hevy CSV import; hidden from the tab bar), offline shell.

Next: check the mapping against Alex's real Garmin data with `/api/status?shapes` (and that the running model behaves on it), pick a name, then ghost replays. Maybe later: D′ balance through interval sessions.
