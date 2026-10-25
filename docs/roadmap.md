# Roadmap

## Next

1. Deploy (README, "Deploying").
2. Run the real key locally with `npm run dev:real`, then fix `netlify/lib/mapping.ts` from `/api/status?shapes` (the `garmin-shapes` skill) and copy the real shapes into `tests/fake-garmin.ts`.
3. Go through every screen on real data at 390 × 844. On the Run tab, check that the engine, critical speed, durability and costs appear, and that the reasons shown when there isn't enough data make sense. Loosen or tighten the evidence checks in `src/lib/running.ts` if needed.
4. Check that run weather gets filled in (Open-Meteo from Netlify).
5. Once there are ten or so rated games in each format, revisit `PAR`, `ENGINE_RANGE` and `BIG_MARGIN` in `src/lib/football.ts`. They're judgement calls, not fitted to data.
6. Ghost replays, the next feature Alex liked: pick a repeated route or segment and watch today's run race every past attempt, with heart rate overlaid, to see where time was won or lost. The GPS and time streams come from `/api/stream`.
7. Maybe later: D′ balance through interval sessions, showing how deep each rep goes, from critical speed and D′.

## Not checked yet

Everything so far was built and tested against the fake Garmin and generated sample data.

- Real Garmin data: field names, history depth, rate limits (see `garmin-api.md`).
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
