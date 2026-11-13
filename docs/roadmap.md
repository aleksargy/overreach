# Roadmap

## Next

1. Restyle the app to Floodlight and take readiness out (`docs/design/floodlight.md`, with mockups in `docs/design/floodlight/`). Today first, shown to Alex before the rest.
2. Alex's first weeks on the Lift tab: does double progression suit how he trains, and are each exercise's rep range and weight step right for him? He can change them per exercise, but the defaults should be close.
3. Whether the things that get circled are the ones he'd have circled, and whether it's the right amount. The bars are `min` on each series in `src/lib/series.ts` (three weeks for a morning's reading) and `headline` in `src/lib/standout.ts` for Today (twice that, and no more than a day and a half old). Replayed over 60 mornings of his data, Today circled something on 17 and each tab on 11 to 15.
4. If the lines still read canned: have Claude write Today's one line from the day's numbers on the server, once a day. It needs an Anthropic API key in Netlify and sends those numbers out, so it's Alex's call.
5. Check that run weather gets filled in from Netlify (it does from the Mac).
6. Once there are ten or so rated games in each format, revisit `PAR`, `ENGINE_RANGE` and `BIG_MARGIN` in `src/lib/football.ts`. They're judgement calls, not fitted to data.
7. Check the season heatmap's ends on real data (it says so when it can't tell). Ghosts: loops run the other way round would be the next step.

## Not checked yet

Everything so far was built and tested against the fake Garmin and generated sample data.

- Real Garmin data over two years: history depth and rate limits (see `garmin-api.md`). The field shapes are checked.
- Open-Meteo: only tested against a fake so far.
- Netlify itself: function time limits, the scheduled job, Blobs in production, and that a preview with no functions behaves.
- On the iPhone: the home-screen install, the offline shell, exporting a backup through the share sheet, and the backup coming back after removing and re-adding the app.
- The running model's fitness trend on real data, which is noisier (GPS drift, wrist heart rate).
- The Lift tab with real sessions: nothing has been logged in it yet.

## Ideas on the shelf

From the first concept pitch, not started. Running and football come first.

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

## Name

"Overreach" is a placeholder. Three rounds so far, no pick:

- **Round one:** Box to Box (the pick), Engine, Bibs, Full Time, Blackbox (the runner-up), Redline, Telemetry, Baseline, Overreach, Supercomp, Afterburn, Zone 5.
- **Round two:** Tifo, Gaffer, Scout, Clean Sheet, Worldie, Nutmeg, Sweeper, Ultra, Lactic, Dossier, Second Wind, Afterglow.
- **Round three, not tied to football:** Torque, Vanta, Onyx, Flux, Sigma, Fast Twitch, Mito, Overload, Adapt, Marginal, Hybrid, Omni, Iron & Lungs, Lungbuster, Spectrum, Prism, Almanac. The favourites were Fast Twitch, Spectrum and Vanta.

`CLAUDE.md` explains how to rename.
