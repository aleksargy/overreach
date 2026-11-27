# Roadmap

## Next

1. Equipment: on Alex's own lateral raises, that Equipment on the lift's page splits the dumbbell sessions from the cable ones in one go, and that the targets then go on from the cable sessions alone. Then whether a lift's step and rep range should be kept for each thing it's done with too (they're the exercise's for now).
2. Floodlight on the iPhone: check that the tab bar stays 26 px off the foot on every screen, that each screen's first line is clear of the frost under the status bar, that sheets and the logger reach the bottom, and that while typing they sit on the keyboard (the picker's search, a new exercise's name, reps in the logger) without the page sliding away. The stand-in keyboard in `npm run screens` shows the layout, but not what iOS itself does. `npm run screens -- --phone` draws the insets and the frost, but the 62 px layout bug only happens on the phone itself.
3. Alex's first weeks on the Lift tab: do the targets suit how he trains (when the weight goes up, when it waits, when a tenth comes off), and are each exercise's rep range and weight step right for him? He can change them per exercise, but the defaults should be close. Since 26 Nov, also: a pyramid's steps down, the belt his chin-ups and dips share, and stuck being five weeks with the step taken when it's in reach. Since 27 Nov: the things drawn from his pick of mockups, on his own data and his phone, and a session drawn as its sets on Today. Does the belt's card suit how he logs the pair (the tall box, the lift's tag for a warm-up, + Drop asking which lift), are the bars and steps readable at a glance, is a best as it's ticked the right amount of sage, and does the muscle figure's half a set for a helping muscle match how he counts?
4. Whether the readings picked out as worth a look are the ones he'd have picked, and whether it's the right amount. The bars are `min` on each series in `src/lib/series.ts` (three weeks for a morning's reading) and `headline` in `src/lib/standout.ts` for Today (twice that, and no more than a day and a half old). Replayed over 60 mornings of his data, Today picked something out on 17 and each tab on 11 to 15.
5. Check that run weather gets filled in from Netlify (it does from the Mac).
6. Once there are ten or so rated games in each format, revisit `PAR`, `ENGINE_RANGE` and `BIG_MARGIN` in `src/lib/football.ts`. They're judgement calls, not fitted to data. Since 18 Nov metres a minute and sprints per 10 minutes count minutes played, not half time, so they read about a tenth higher than before.
7. Half time on Alex's own games: that the report's halves start and stop where he paused the watch, and where a game he didn't pause had its break. A lap pressed at half time would be one more thing to read, if he does that.
8. Check the season heatmap's ends on real data (it says so when it can't tell). Ghosts: loops run the other way round would be the next step.

## Not checked yet

Everything so far was built and tested against the fake Garmin and generated sample data.

- Real Garmin data over two years: history depth and rate limits (see `garmin-api.md`). The field shapes are checked.
- Open-Meteo: only tested against a fake so far.
- Netlify itself: function time limits, the scheduled job, Blobs in production, and that a preview with no functions behaves.
- On the iPhone: the home-screen install, the offline shell, exporting a backup through the share sheet, and the backup coming back after removing and re-adding the app.
- The running model's fitness trend on real data, which is noisier (GPS drift, wrist heart rate).
- Whether his sessions the day after a game are weaker, measured on his own sessions, before any rule about lifting after football is built: there aren't enough weeks of both yet.
- The match replay and the run map on real data: real GPS wobbles more than the sample's, and real runs start from more than one place. The fake Garmin's runs all go round one circle, so live mode locally draws a single loop.
- The Lift tab's rules over months of real sessions: Alex has a few weeks logged. The 26 Nov rules were tuned on simulated lifters, who tire the same amount every set and whose reps follow Epley exactly; his won't.

## Ideas on the shelf

From the first concept pitch, not started. Running and football come first.

- The Pint Tax: tag a night out and see what it cost your HRV, resting heart rate and sleep, and how long until you're back to normal.
- An n-of-1 lab for testing habits.
- An interference radar, for when the schedule fights itself (squats the day before a tempo run).
- Heart-rate cost per lifting set.
- Fog-of-war territory maps: Where you run (27 Nov) draws every run around home; the streets nearby never run would be the next step.
- A "$YOU" stock ticker.
- A kickoff clock: your best time of day to perform.
- Swim analysis.
- A monthly "Wrapped".

## Name

"Overreach" is a placeholder. Three rounds so far, no pick:

- **Round one:** Box to Box (the pick), Engine, Bibs, Full Time, Blackbox (the runner-up), Redline, Telemetry, Baseline, Overreach, Supercomp, Afterburn, Zone 5.
- **Round two:** Tifo, Gaffer, Scout, Clean Sheet, Worldie, Nutmeg, Sweeper, Ultra, Lactic, Dossier, Second Wind, Afterglow.
- **Round three, not tied to football:** Torque, Vanta, Onyx, Flux, Sigma, Fast Twitch, Mito, Overload, Adapt, Marginal, Hybrid, Omni, Iron & Lungs, Lungbuster, Spectrum, Prism, Almanac. The favourites were Fast Twitch, Spectrum and Vanta.

`CLAUDE.md` explains how to rename.
