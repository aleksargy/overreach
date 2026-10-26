# Overreach

A personal PWA that replaces Garmin Connect and Hevy for one person (Alex). It pulls runs, football, rides, swims and watch health data from the Garmin Personal API, and has its own strength logger. It's deployed to Netlify and added to an iPhone home screen. The name is a placeholder (see Renaming).

Look and feel is the top priority. Read the design rules before changing any screen. Running and football are Alex's main sports, so they get the depth; the other sports are synced and shown but get no new work for now.

`README.md` is the guide for people: setup, secrets, deploying, keeping it running. `docs/` has the decisions and why (`decisions.md`), the Garmin API notes (`garmin-api.md`), and what's next, what's unchecked and the ideas on the shelf (`roadmap.md`).

## Working here

- Show it early: a screenshot or a preview before the polish, and let Alex react. Look and feel decides.
- Depth over breadth: running and football get the work, Today and Body stay a clean dashboard, rides, swims and lifting are shown but not extended. Lift stays hidden from the tab bar.
- The analysis is personal: measure against Alex's own baseline, not population norms, and say plainly when the data can't support a claim.
- Few Garmin calls: new fetches go inside the sync step, never a new poll.
- Every change goes through a branch and a pull request; `check` has to pass, and main can't be pushed to directly. Commits are authored as aleksargy, with no AI co-author or session trailers (`.claude/settings.json` turns them off).
- Secrets never go in the repo, the chat or the browser bundle (see Secrets).

## Commands

```sh
npm install          # Node 22 (.nvmrc)
npm run dev          # app on :5173, sample data until the first sync; /api is proxied to :8788
npm run dev:api      # the real functions + a fake Garmin with a year of history on :8788, passphrase "dev"
npm run dev:real     # the same against your real Garmin account: key from .env.local through varlock, 90 days back
npm test             # sync engine against the fake Garmin, the functions against a local Blobs server, the pure logic
npm run typecheck
npm run format       # Prettier (pinned): no semicolons, single quotes, width 180; CI runs format:check
npm run check:env    # varlock audit: every env var the code reads is declared in .env.schema
npm run build        # tsc + vite build into dist/
npm run build:preview  # one self-contained HTML file: dist-preview/preview.html
npm run screens      # every screen at 390 × 844, sample and live, into screens/; --race switches the race card on
npm run icons        # re-render the icon PNGs (Playwright)
```

To see live mode locally, run `npm run dev:api` and `npm run dev` together, open Settings, type `dev` as the passphrase and tap Sync now. The fake's Blobs live in `.netlify/dev-blobs`; delete that folder to start over. `npm run dev:real` keeps its store in `.netlify/real-blobs`, so real and fake data never mix, and it stays on this Mac. Both listen on 127.0.0.1 only.

The preview build uses a memory router. A bare hash picks the first screen: `#run`, `#football`, `#body`, `#feed`, `#lift`, `#prefs`.

## Layout

- `src/screens/` one folder per area: today (plus the + log sheet), run (plus the race report and ghosts), football (log sheet with the points editor, rating reveal, match report, player card), body, feed ("All activity", opened from Today, plus activity detail), settings, and lift (logger overlay, exercises, history), which is built but hidden from the tab bar.
- `src/components/` shared UI (`ui/`), charts (`charts/`), the tab bar, the activity row.
- `src/data/` the store, the derived world, the API client, the backup of what you type, types, exercises, and generated sample data (`sample/`).
- `src/lib/` pure logic with no React: running analysis (`running.ts`), races and race reports (`race.ts`), ghosts (`ghost.ts`), easy and hard by week (`mix.ts`), football rating and analysis, readiness, training load, lift progression, schedule guessing, Hevy CSV import, backup merging, formatting.
- `netlify/functions/` `status`, `sync` (POST), `data`, `stream`, `user` (the copy of what you type), and `scheduled-sync` (once a day, 05:00 UTC).
- `netlify/lib/` the Garmin client, the sync engine, Garmin-to-app mapping, FIT decoding, run weather from Open-Meteo, the Blobs wrapper, request helpers.
- `tests/` the fake Garmin (realistic shapes, range limits, FIT files, slow answers, plus a fake Open-Meteo) and the tests.
- `scripts/` the local API, screenshots, icon rendering, the preview inliner.
- `.github/` `ci.yml` (checks and a preview for every pull request), `deploy.yml` (main to Netlify), Dependabot, the pull request template.
- `.claude/` Claude Code's project settings (permissions, a Prettier hook, attribution off) and skills: `check-screens`, `garmin-shapes`.
- `docs/` decisions, Garmin API notes, roadmap.

## How data flows

- **Store** (`src/data/store.ts`, zustand) holds what the person types: matches, workouts, routines, custom exercises, weigh-ins, profile and sync settings. It's saved to IndexedDB under `overreach:user:v1`; the Garmin cache is saved separately under `overreach:garmin:v1`. Nothing is written until IndexedDB has answered at start-up, so a slow start can't save defaults over real data. Saves happen straight away, except while typing into a live workout (300 ms pause), and any pending save is flushed when the app is hidden.
- **Backup.** What you type is also copied to the server: `src/data/backup.ts` sends it to `/api/user` (Blobs key `user`) a few seconds after each change once the phone has synced, and again on open if a copy didn't make it. The first sync on a phone with none of your data (a new phone, a reset, a removed home-screen app) brings it back. Lists merge by id with the phone's version winning, a match deleted on the phone stays deleted, and the server never swaps a full copy for an empty one. Settings also exports a file and restores from one (`src/lib/backup.ts`).
- **World** (`src/data/world.ts`, `useWorld()`) derives everything the screens show: Garmin activities (or sample data before the first sync) merged with logged workouts and matches, plus load, readiness, the weekly schedule and unrated games. Screens read the world and write through store actions.
- **Readiness** (`src/lib/readiness.ts`) judges the morning against your own normal: HRV against Garmin's baseline (its balanced range), sleep against the sleep Garmin says you needed, Body Battery, resting HR against the last 28 days, and the load ratio. Then recent training caps it: a session still being absorbed (Garmin's training effect of 3, 4 or 5, or 1.4×, 2× or 3× your usual session's load: a day, two or three) holds the day at Good to go, Easy does it or Recover, whatever the night looked like. The verdict names that session and never guesses a plan. Garmin's own recovery time and Training Readiness aren't in the Personal API (see `docs/garmin-api.md`), and the screen says so.
- **Load** is Garmin's training load where the watch worked one out, and TRIMP from time in zones where it didn't. Zones are your Garmin zones once synced, 50–90% of max HR before.
- **Run tab** answers plain questions, one card each: Fitness (the pace you hold at an easy heart rate, from the running model's engine), Endurance (how long heart rate holds at a steady pace before it drifts), Speed (critical speed, marked rough until it rests on hard efforts), and what slows you down (hills, heat). Each card leads with what the number means and folds the method under "How it's worked out". The football hangover stays in the model, so post-game jogs don't drag fitness down, but has no card: Alex only jogs easy after a game.
- **Race report.** A race is a run marked as a race on the watch, or the one on the day of the race set in Settings. The report scales the watch's distance to the race distance (watches measure courses long) and takes the finish from the watch: splits every 1 or 5 km, the gap to goal pace (or to an even pace) along the way, the halves, where heart rate drifted and where the pace fell away, the best before at that distance, and a back-page headline. The Run tab lists races from the last year, and for a month after race day the race card shows the result.
- **Ghosts.** A run's ghosts are your earlier runs on the same route the same way round (`ghostsOf`), matched by place, not by distance: each run summary keeps an outline (a point every 100 m, `ROUTE_STEP`), and two outlines are lined up point by point (dynamic time warping). Nine tenths of each run has to lie within 40 m of the other's route, and neither may get more than 150 m ahead of the other at the same place beyond a steady drift (a watch measuring long), which rules out detours. So the card on a run only shows when it has ghosts, and the screen loads only their streams: it plays them back together on the route, with the order on the road, the gap to each at the same places (`courseOf`), and heart rate against your best there. Run streams from the last year are stored in Blobs during sync, so loading ghosts costs no Garmin calls; older runs have no outline and aren't ghosts.
- **Easy and hard** (`src/lib/mix.ts`) splits running time by heart rate zone, week by week: zones 1–3 easy, 4 tempo, 5 hard. Zone 3 is Garmin's "aerobic" and tops out at 80% of max on zones from max heart rate, so easy and long runs land there. The last 8 weeks are compared with the 8 before only when your history covers them.
- **Race** (`src/lib/race.ts`) is off unless "Training for a race" is on in Settings. Then the Run tab opens with a countdown, the goal pace, the heart rate that pace would take from your own slopes (`hrAtPace`), recent long runs, and a taper target from your biggest week, using common taper guidance, not a fitted rule.
- **Rating prompts** only cover games from the last 14 days that you haven't rated or skipped (`gamesToRate`); a swipe left skips one, and skips are backed up with the rest of what you type.
- **Sample mode** shows generated data with a "Sample data" badge until the first successful sync. After that the app is in live mode.
- **Streams** (HR, speed, GPS, laps) load per activity from `/api/stream?id=g-…`. The server decodes the FIT file once and caches it in Blobs.
- **Run summaries.** During sync the server reads each run's FIT file (runs from the last year, `RUN_DAYS`) and stores a small `run` summary on the activity: speed, heart rate and grade minute by minute, best efforts from 1 to 60 minutes, the start rounded to 0.1° (about 10 km), the route's outline for ghosts, and the temperature and dew point. So the Run tab never needs a stream download.
- **Running model** (`src/lib/running.ts`, `useRunModel()`) is fitted in the browser from those summaries. A within-run regression of heart rate on speed, climb, descent and minutes gives shared slopes; backfitting then splits each run's residual into fitness (a 12-day kernel), heat (bpm per °C above 12) and the football hangover (runs within 36 hours of a game). From that come the aerobic engine (pace at a fixed heart rate, 68% of reserve, flat, cool and fresh), hill, heat and football costs in s/km, durability (the minute heart rate drifts 5 bpm in long, even runs), and critical speed and D′ from the upper hull of 90 days of best efforts, with race predictions. Each claim shows only when the data supports it (`clear`, `solid`, the evidence checks), and the screen says why when it doesn't. The sample data has these effects built in, and `tests/running.test.ts` checks the model finds them.
- **Football.** Match ratings and the player card are computed in `src/lib/football.ts` from what's logged (score, goals, assists, how it felt, what went well and badly) plus the watch's physical numbers when the game was recorded.
- **Points.** What went well and badly is written in your own words, two columns in the log sheet, with suggestions from points written before and the old fixed moments. Each point counts ±0.15 on the rating, a big one ±0.3, and together they move it 0.6 at most (`POINT`, `BIG_POINT`, `POINTS_CAP`); the breakdown lists each one, then the cap. A big point in your own words can make the headline, quoted. Points that come up in more than one of the last ten games show under form. Games rated before this had `moments`: `withPoints` reads them as points, on load and in any copy merged back in.
- **Head to head.** Your record against each opponent you've met twice or more, in the format you're looking at, across seasons, with the bogey team and the favourite fixture. A name matches however it was typed. The match report says which meeting it was.
- **Season heatmap.** During sync each game keeps a `trace`: a point every 15 s of play, in metres from where it was played. `seasonPitch` frames each ground from every game on it, so a winger stays out wide, then turns every half to face the same way: halves are matched to each other (the toss picks the ends and they change at half time), and the side of halfway you stood on at kick-off, the second half's most of all, says which end was yours. When that vote is close the screen says it may be back to front and drops the arrow.
- **Formats.** Alex usually plays 11-a-side and sometimes 7s, and the two aren't compared like for like. The rating's baseline, the thrashing margin (`BIG_MARGIN`) and the match report's medians only use games of the same format, and the Football tab splits season, form, records and matches by format (the switch shows once more than one format has been played). The player card covers every format but judges each game against its own first (`PAR` for goals and assists, `ENGINE_RANGE` for metres per minute and sprints), so only top speed and the rating are shared as they are. An unrated watch game takes its format from `formatOf`: its rated match, else what's usually played at that time of the week (`usualFormatAt`: same weekday, within two hours), else the profile default. The log sheet starts with that format and the team and position last used in it; the opponent starts blank.

## Server (Netlify)

- Environment variables: `GARMIN_PERSONAL_API_KEY` (from connect.garmin.com/app/settings/personalApiToken) and `OVERREACH_PASSPHRASE` (any phrase; the same one is typed into Settings). `OVERREACH_HISTORY_DAYS` shortens the history walk for local runs. All of them are listed in `.env.schema`. The Garmin key must never reach browser code.
- Every endpoint checks the `x-overreach-key` header against the passphrase.
- Data lives in the Blobs store `overreach` (strong consistency). Keys: `state`, `activities`, `dailies`, `body`, `user`, `stream/<id>`, `shapes`, `token`, `lock`.
- Opening the app is the main trigger: it runs a step without forcing, and the server only calls Garmin if its last recent pass was more than 10 minutes ago, however often the app opens. The app downloads `/api/data` only when the server's `dataAt` has moved. Sync now in Settings forces a fresh pass. A job at 05:00 UTC is the safety net (Alex asked for few calls, to stay clear of rate limits and junk requests).
- Sync runs in steps that fit Netlify's limits: from the app, 20 s of work per call with every Garmin request stopped by 24 s (Netlify's docs give synchronous functions 30 s in one place and 60 s in another); for the morning job, 18 s and 22 s (scheduled functions get 30 s); at most 30 Garmin calls per step. A FIT download the deadline cuts off stays first in line for the next step. A lock in Blobs stops the job and the app from overlapping. Each step does, in order: the recent pass (health data since the last pass, at least two weeks; if that's over 180 days the health history is walked again), run and football FIT files still to read, summaries made before they last gained something (`FOOTBALL_SUMMARY`, `RUN_SUMMARY`), brought up to date from the streams stored in Blobs, eight at a time and with no Garmin call (sync isn't done until they all are); the detail of runs and games from the last 30 days (the RPE and feel you enter on the watch; one call each, read once), weather for new runs, the activity backfill (two years), the health backfill (180-day chunks; sleep only for 120 days).
- Garmin limits per call: activities 50 per page, daily summaries and HRV 180 days, sleep 28 days, weight 365 days. Over-long ranges come back as empty 400s or 500s.
- A 429 pauses the sync and keeps what was fetched. A 401 re-exchanges the token once. An endpoint that keeps failing is named in `warnings` and skipped.
- Weather comes from Open-Meteo (free, no key): the archive API, or the forecast API for runs in the last six days. Only the rounded location and a date range go out, one request per place. A failure waits 30 minutes and never holds up the sync.
- `/api/status?shapes` returns the field types Garmin actually sent, without any values. Use it to fix `netlify/lib/mapping.ts` against real data (the `garmin-shapes` skill); the readers there are deliberately tolerant.
- The Personal API is pull-only (no webhooks, no pushing workouts), and keys expire after 30 days to a year and must be renewed by hand.

## Secrets

- `.env.schema` lists every variable and which are sensitive; varlock checks it, and `npm run check:env` fails if the code reads one that isn't listed. Values never go in git or the chat.
- The deployed site gets its values from Netlify's environment variables, set for the Production context only, so a preview never has them. Previews also deploy without functions.
- On this Mac, `.env.local` (gitignored) holds `varlock("local:…")` refs that only this Mac can decrypt. `npm run dev:real` runs through `varlock run`, which redacts sensitive values from piped output.
- The deploy workflow uses a `NETLIFY_AUTH_TOKEN` secret and a `NETLIFY_SITE_ID` variable in GitHub.
- Never give a secret a `VITE_` prefix: Vite puts those in the browser bundle.
- Don't read `.env.local` or `.netlify/real-blobs`, and don't run `varlock reveal` or `varlock printenv`; `.claude/settings.json` denies them. To call the deployed API, let varlock pass the passphrase (see the `garmin-shapes` skill).

## Design rules

- Dark only, minimal and sleek: fewer boxes, more space, quiet type. The chrome is near-black and grey; colour is reserved for data: HR zones z1 to z5 (blue, green, yellow, orange, red), sports (`sportColor()`), match ratings, readiness.
- Type: Geist for everything, Geist Mono only for chart axis labels and code. Sentence case everywhere, no letter-spaced capitals. Hero numbers are big and light (`.num-hero`); other numbers are medium weight with tabular figures (`.num`). Small grey captions are `.label`, secondary lines `.meta`. Screen titles are 30 px semibold, section titles 17 px.
- Surfaces: cards are `.card` (18 px radius, one step lighter than the page, a faint inner ring). A list is one card of rows split by hairlines (`.list`; set `--inset` so the line starts after an icon), not a card per row. Buttons, chips and segmented controls are pills. Inside sheets, surfaces step up to `ink-2`.
- Charts are thin: 1.5 px lines, capsule bars, faint or no grid, small mono labels.
- Colours are RGB CSS variables in `src/styles/index.css`, used through Tailwind (`bg-ink-1`, `text-fg-3`, `text-z4`) or `sportColor()`. Don't hardcode hex colours in components.
- Phone first (390 px wide), 16 px gutters that respect safe areas, bottom tab bar: Today, Run, Football, Body. Input happens in sheets (the + on Today opens the log sheet); reports are full screens.
- Copy is short and plain with some personality (the match report writes back-page headlines). Hide empty things rather than showing dashes or zeros.
- Motion comes from `motion/react` springs, and `MotionConfig reducedMotion="user"` is respected.
- After a UI change, look at it at 390 × 844 in both sample and live mode: `npm run screens` (the `check-screens` skill).

## Gotchas

- Tailwind opacity modifiers on the theme colours must come from Tailwind's scale (`/5`, `/10` up to `/95`) or be arbitrary (`/[0.05]`). Something like `bg-fg/97` silently produces no CSS.
- The sample data in `src/data/sample/` is deterministic (seeded from dates and ids) and has the running effects built in that `tests/running.test.ts` checks, so run `npm test` after changing it. It plays 11s on Sunday mornings and 7s every other Tuesday evening; that schedule is made up, not Alex's. The sample runner has one route for each distance they run from home and a parkrun course, so ghosts and races show; the sample player is a right-sided midfielder on the same ground each week, and the ends change at half time.
- Tailwind only makes the classes it finds written out in full in the source. A class put together from parts (`grid-cols-[${…}]`) silently does nothing; spell each one out.
- Serve `dist-preview/preview.html` as `text/html; charset=utf-8`, or curly quotes and middle dots turn into mojibake.
- Saved shapes are versioned (`UserData.version`, `SyncState.v`, the `:v1` storage keys, the backup's `v`, and each run and game summary's `v`: bump `RUN_SUMMARY` or `FOOTBALL_SUMMARY` when a summary gains something, and sync brings the older ones up to date from the stored streams). `UserData.version` 2 is matches with points instead of moments (`withPoints`, run by `hydrate` and on every copy merged in). When a saved shape changes, bump its version and migrate on load (`hydrate`, `loadAll`), because real data already lives on the phone and in Blobs.
- When a fix to `netlify/lib/mapping.ts` means stored data was read wrong, bump `HEALTH_MAPPING` (days) or `ACTIVITY_MAPPING` (activities) in `sync.ts`: the next steps read that history again (about ten calls for days, a page per 50 activities, no FIT files).

## Renaming

Change `APP_NAME` in `src/config.ts`, the `<title>` in `index.html`, and `name`/`short_name` in `public/manifest.webmanifest`. Run `npm run icons` if the mark changes. The service worker's cache is named after each build, so installed copies pick up the new name and icons on the next deploy. The Blobs store name and the storage keys say "overreach"; leave them unless you also migrate the data.

## Deploying

GitHub Actions deploys; Netlify doesn't build from git. `ci.yml` checks every pull request and puts up a preview of it (sample data, no functions). `deploy.yml` checks main again and deploys it to production, except for changes that only touch docs or Claude's settings, because each production deploy costs 15 of the free plan's 300 monthly credits. Run Deploy by hand after changing an environment variable in Netlify. First-time setup and the iPhone install are in README.md.

## Status

Done: Garmin sync (on app open), the minimal redesign, Today (readiness with a week of history, football, the week, load, latest), Run (aerobic engine and its trend, weekly distance, critical speed with race predictions, durability, what slows you down: hills, heat and football legs; plus an analysis block on each run), football (log a match, rating reveal, match report with heatmap and engine stats, season, form, records, player card after three rated games, all split by format where it matters), body (weight trend, recovery, last night; the weigh-in takes weight only, since Alex doesn't track measurements or body fat yet), all activity and activity detail, the lift logger (routines, RPE, progression targets, custom exercises, Hevy CSV import; hidden from the tab bar), offline shell, backup of what you type to the server, the deploy pipeline, a local mode against the real Garmin account, readiness rebuilt on Garmin's training effect, load, HRV baseline and sleep need, Garmin's view on each activity (training effect, load, your watch RPE), swipe to skip rating a game, the chalked-pitch logo, a race toggle with goal-pace heart rate and a taper check, the Run tab in plain language, what went well and badly in your own words instead of fixed moments, head to head, the season heatmap, race reports, ghosts, easy and hard by week.

Next: check the running model and the season heatmap's ends against Alex's real data, and the race report after the marathon on 8 Nov. Maybe later: D′ balance through interval sessions. The name is still open.
