# Roadmap

## Next

1. Check the running model against Alex's real runs: do the engine, heat, hill and football costs, durability and critical speed match how those runs felt?
2. Go through every screen on real data at 390 × 844. On the Run tab, check that the engine, critical speed, durability and costs appear, and that the reasons shown when there isn't enough data make sense. Loosen or tighten the evidence checks in `src/lib/running.ts` if needed.
3. Check that run weather gets filled in from Netlify (it does from the Mac).
4. Once there are ten or so rated games in each format, revisit `PAR`, `ENGINE_RANGE` and `BIG_MARGIN` in `src/lib/football.ts`. They're judgement calls, not fitted to data.
5. Check the new reports on real data: whether the season heatmap gets the ends right (it says so when it can't tell), whether ghosts find Alex's repeated routes, and the race report after the marathon on 8 Nov. Ghosts match whole routes only; segments would be the next step.
6. Maybe later: D′ balance through interval sessions, showing how deep each rep goes, from critical speed and D′.

## Not checked yet

Everything so far was built and tested against the fake Garmin and generated sample data.

- Real Garmin data over two years: history depth and rate limits (see `garmin-api.md`). The field shapes are checked.
- Open-Meteo: only tested against a fake so far.
- Netlify itself: function time limits, the scheduled job, Blobs in production, and that a preview with no functions behaves.
- On the iPhone: the home-screen install, the offline shell, exporting a backup through the share sheet, and the backup coming back after removing and re-adding the app.
- The running model's evidence checks on real data, which is noisier (GPS drift, wrist heart rate).

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
