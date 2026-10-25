# Handoff

Where Overreach stands after its first build, written on 25 October 2026 so the work can carry on in Claude Code in VS Code.

Read `CLAUDE.md` first. It covers the commands, the architecture, the sync design and the design rules, and it is kept current. This file adds what `CLAUDE.md` doesn't: who the app is for, what Alex asked for and decided, what has and hasn't been checked, and what comes next. A good first prompt in VS Code: "Read HANDOFF.md, then help me deploy and check the app against my real Garmin data."

## Where things stand

- The code is on GitHub at [aleksargy/overreach](https://github.com/aleksargy/overreach). `main` has everything up to the Body change (5b6661c). The football formats work and this file are in the `football-formats` pull request, so merge that first.
- The app isn't deployed yet and has never run against Alex's real Garmin account. Everything so far was built and tested against a fake Garmin and generated sample data.
- All 24 tests pass, and typecheck and build are clean.
- A preview on sample data, private to Alex's claude.ai account: https://claude.ai/artifact/8yaKEmYWnv6SkVzwjvuscy. The original concept pitch: https://claude.ai/code/artifact/36d5a5f8-f224-4016-969e-44471bed5c48.

## Who it's for

One person, Alex, using it from an iPhone home screen. Alex runs and plays football (usually 11-a-side, sometimes 7s), and also rides, swims and lifts. The starting point: Alex isn't a fan of Garmin Connect, whose dashboards and insights are weak, and wanted "something cool and fun and modern and edgy" that brings running, football, biking, swimming, watch health data and strength training into one personal app. For lifting, Alex liked Hevy's interface and its suggestions (when to go up in weight, what to lift in a session) but wanted RPE, custom exercises and progress tracking.

How Alex likes to work:

- Look and feel comes first: "it's very important we nail the look and feel". After the first, louder pass, Alex asked for minimal and sleek. Show a preview early and let Alex react to it.
- Don't spread thin. Running and football are the main sports and get the depth. Today and Body are a clean dashboard. Rides, swims and lifting are synced and shown but get no new work for now.
- The analysis should be serious and personal: things Garmin and Strava don't do, measured against Alex's own baseline rather than population averages.
- Few Garmin calls. Alex asked for a sync when the app opens rather than a frequent schedule, to stay clear of rate limits and junk requests.
- Alex doesn't track tape measurements or body fat, so the Body tab doesn't ask for them.
- Alex's messages are short and casual, often one line. Keep replies short and lead with the result.

## Decisions so far

| When   | Decision                                                                                                                                                          | Why                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 24 Oct | Use the Garmin Personal API, with the key in a Netlify Function and never in the browser.                                                                         | It's free and self-serve, and a key in browser code would expose Alex's health data.                                   |
| 24 Oct | The first milestone is "balanced", with football up front: the match report (score, goals, assists, how it felt, then a rating). Ghost replays come later.        | Alex's pick from the concept pitch.                                                                                    |
| 24 Oct | Build from scratch. TrainLog (`aleksargy/fitness`) is retired and none of its data is imported.                                                                   | Alex's call.                                                                                                           |
| 24 Oct | Store data in Netlify Blobs instead of Supabase.                                                                                                                  | One platform, nothing extra to sign up for.                                                                            |
| 24 Oct | Use a fresh repo, `aleksargy/overreach`, with clean history.                                                                                                      | Alex created it.                                                                                                       |
| 24 Oct | Sync when the app opens (the server calls Garmin at most once every 10 minutes), plus one job at 05:00 UTC, instead of hourly.                                    | Alex wanted fewer calls. Hourly made about 120 calls a day, nearly all finding nothing.                                |
| 24 Oct | Focus on the body and dashboard, a minimal look, deep running analysis and football.                                                                              | Alex: "i dont want to spread ourselves too thin just yet".                                                             |
| 24 Oct | Minimal redesign: Geist only, sentence case, colour only for data. Tabs are Today, Run, Football and Body, and the full feed moved under Today as "All activity". | Follows the focus above.                                                                                               |
| 24 Oct | Hide the Lift tab without deleting it.                                                                                                                            | Alex was asked (hiding was recommended) and hasn't answered, so it stays hidden until they say otherwise.              |
| 24 Oct | The Run tab gets the aerobic engine, durability, critical speed with race predictions, and hill, heat and football costs.                                         | Proposed to Alex as the analysis Garmin doesn't do.                                                                    |
| 25 Oct | The weigh-in takes weight only.                                                                                                                                   | Alex doesn't track measurements or body fat yet.                                                                       |
| 25 Oct | Remove "usual opponent" from Settings, and compare 11s and 7s separately.                                                                                         | Alex: "doesnt make too much sense to have so much overlap in comparison between the two, some yes but not everything". |

The name is still a placeholder (see Name below).

## How football formats work

Alex usually plays 11-a-side and sometimes 7s. Goals, scorelines and running numbers mean different things on the two pitches, so:

- **Split by format:** the season record, win rate, average rating, form, records and match list on the Football tab (a switch appears once more than one format has been played), and every comparison in the match report (the median rating, distance, sprints and top speed in that format). The rating's baseline is per format too, and so is what counts as a thrashing: a four-goal win in 11s, five in 7s.
- **Shared:** the player card, because it's about the player. Each game is still judged against its own format first. A goal a game is a lot in 11s and ordinary in 7s (`PAR`), and the same metres per minute is a bigger shift on an 11s pitch (`ENGINE_RANGE`). Only top speed and the rating are taken as they are.
- A watch game's format comes from its logged match if there is one. Otherwise it's what's usually played at that time of the week (same weekday, within two hours), and failing that the usual format in Settings. The log sheet starts with that format and with the team and position last used in it. The opponent starts blank.
- `PAR`, `ENGINE_RANGE` and `BIG_MARGIN` in `src/lib/football.ts` are judgement calls, not fitted to data. Revisit them once Alex has ten or so real rated games in each format.

## What's checked and what isn't

Checked:

- The sync engine and every function, against the fake Garmin in `tests/fake-garmin.ts`. Its shapes and endpoints come from Garmin's own client code (through the `garmin-personal-mcp` npm package), with the real range limits, rate limits, expired tokens, refused endpoints and football FIT files.
- The running model, against sample data with heat, hills, football legs and fitness changes built in. It finds them to within about 15%.
- Every screen at 390 × 844, in sample mode and in live mode on the fake.
- The preview inside a locked-down iframe, the way the Artifact host shows it.

Not checked yet:

- **Real Garmin data.** Field names and types may differ. `netlify/lib/mapping.ts` reads them tolerantly, but it has never seen the real thing. Look first at how Alex's football is recorded (Garmin's `soccer` type, or "other" with a name like "7-a-side", which the mapper also catches), Garmin's GMT times, weight units, and the sleep and HRV shapes.
- **Whether the Personal API's FIT files are complete.** Runalyze reported in October 2026 that Garmin strips some proprietary fields (VO2 max, training effect, recovery time, performance condition) from API FIT files. The app doesn't depend on any of them.
- **How far back history goes, and the real rate limits.** Garmin doesn't publish them.
- **Open-Meteo.** The cloud machine couldn't reach it, so run weather is only tested against a fake.
- **Netlify itself:** function time limits, the scheduled job and Blobs in production.
- **The home-screen install and offline shell** on Alex's iPhone.
- **The running model's evidence checks** on real data, which is noisier (GPS drift, wrist heart rate).

## Next steps

1. Merge the `football-formats` pull request.
2. Deploy, following "Deploying" in `CLAUDE.md`. Alex creates the Garmin key at connect.garmin.com/app/settings/personalApiToken.
3. After the first sync, open `/api/status?shapes` (with the `x-overreach-key` header) and fix `netlify/lib/mapping.ts` against what Garmin really sends. Copy the real shapes into `tests/fake-garmin.ts` so the tests keep matching reality.
4. Go through every screen on real data at 390 × 844. On the Run tab, check that the engine, critical speed, durability and costs appear, and that the reasons shown when there isn't enough data make sense. Loosen or tighten the evidence checks in `src/lib/running.ts` if needed.
5. Check that run weather gets filled in (Open-Meteo from Netlify).
6. Ask Alex whether Lift stays hidden.
7. Pick a name (below).
8. Build ghost replays, the next feature Alex liked: pick a repeated route or segment and watch today's run race every past attempt, with heart rate overlaid, to see where time was won or lost. The GPS and time streams come from `/api/stream`.
9. Maybe later: D′ balance through interval sessions, showing how deep each rep goes, from critical speed and D′.

## Ideas on the shelf

These are from the first concept pitch and haven't been started:

- The Pint Tax: tag a night out and see what it cost your HRV, resting heart rate and sleep, and how long until you're back to normal.
- An n-of-1 lab for testing habits.
- An interference radar, for when the schedule fights itself (squats the day before a tempo run).
- Heart-rate cost per lifting set.
- Fog-of-war territory maps.
- A "$YOU" stock ticker.
- A kickoff clock: your best time of day to perform.
- Coach personas for the daily verdict.
- Swim analysis.
- A monthly "Wrapped".

Running and football come first, so treat these as later.

## Name

"Overreach" is a placeholder. Alex asked for three rounds of names and hasn't picked one.

- **Round one:** Box to Box (the pick), Engine, Bibs, Full Time, Blackbox (the runner-up), Redline, Telemetry, Baseline, Overreach, Supercomp, Afterburn, Zone 5.
- **Round two:** Tifo, Gaffer, Scout, Clean Sheet, Worldie, Nutmeg, Sweeper, Ultra, Lactic, Dossier, Second Wind, Afterglow.
- **Round three, not tied to football:** Torque, Vanta, Onyx, Flux, Sigma, Fast Twitch, Mito, Overload, Adapt, Marginal, Hybrid, Omni, Iron & Lungs, Lungbuster, Spectrum, Prism, Almanac. The favourites were Fast Twitch, Spectrum and Vanta.

`CLAUDE.md` explains how to rename.

## Garmin Personal API

Researched on 24 October 2026. The key is free and self-serve, and it only covers your own account. It expires after 30 days to a year and has to be renewed by hand. The API is pull only: there are no webhooks, and no pushing workouts or routes (those APIs are business-only). `netlify/lib/garmin.ts` and `netlify/lib/sync.ts` already use these:

- The host is `https://personal.connectapi.garmin.com`. Exchange the key at `POST /personalapitoken-service/personal-api/personal-api-key/token` with `Authorization: ApiKey <key>`. The reply is a JWT that lasts about a day, sent as `Authorization: Bearer <jwt>`.
- Activities: `/activitylist-service/activities/search/activities` (`start`, `limit` up to 50, `startDate`, `endDate`). One activity: `/activity-service/activity/{id}`. The FIT file: `/download-service/files/activity/{id}`, a zip holding `<id>_ACTIVITY.fit`.
- Daily summaries (`/usersummary-service/v2/dailysummaries`) and HRV (`/hrv-service/hrv/daily/{start}/{end}`) allow 180 days per call. Sleep (`/sleep-service/sleep/dailySleepSummariesByDate`) and Body Battery (`/wellness-service/wellness/bodyBattery/reports/daily`) allow 28. Stress and steps (`/usersummary-service/stats/{stress|steps}/daily/{start}/{end}`) allow 7. Weight (`/weight-service/weight/range/{start}/{end}?includeAll=true`) allows 365.
- Heart-rate zones are at `/biometric-service/heartRateZones/v2`, and the profile at `/userprofile-service/userprofile/settings`.
- A range that's too long comes back as an empty 400 or 500. A path that isn't allowed gives a 404.

## Working on it

- Use Node 22. Run `npm install`, then `npm run dev:api` and `npm run dev` in two terminals for live mode on the fake (passphrase `dev`), or just `npm run dev` for sample mode.
- There's no ESLint. Format changed files with `npx prettier --write <files>`.
- Tailwind opacity modifiers on the theme colours must come from Tailwind's scale (`/5`, `/10` up to `/95`) or be arbitrary (`/[0.05]`). Something like `bg-fg/97` silently produces no CSS.
- The sample data in `src/data/sample/` is deterministic (seeded from dates and ids). It has the running effects built in that `tests/running.test.ts` checks, so run `npm test` after changing it. It plays 11s on Sunday mornings and 7s every other Tuesday evening; that schedule is made up, not Alex's.
- To see the app the way Alex does, drive it with Playwright at 390 × 844. A fresh browser profile shows sample mode, and a kept profile that has synced shows live mode. After Sync now, wait for Settings to say it's up to date before moving on.
- `npm run build:preview` makes `dist-preview/preview.html`, one self-contained file. A hash like `#football` opens that screen. Serve it as `text/html; charset=utf-8`, or curly quotes and middle dots turn into mojibake.
- To start the fake's data over, delete `.netlify/dev-blobs` and clear the site's IndexedDB.
- Keep the Garmin key out of anything that ships to the browser. Keep the "overreach" Blobs store and storage key names unless you also migrate the data.
