---
name: check-screens
description: Screenshot every Overreach screen at 390 × 844, in sample mode and in live mode on the fake Garmin, and review the shots against the design rules in CLAUDE.md. Use after any change to a screen, a component or the styles, or when asked how the app looks.
---

# Check the screens

The design rules say every UI change gets looked at on a phone-sized screen in both modes. This does it in one go.

1. Run `npm run screens` (every screen, both modes, a few minutes). One screen: `npm run screens -- settings`. One mode: `--sample` or `--live`. `--race` switches on "Training for a race" (a marathon two weeks out, goal 3:30) so the race card shows. `--bar` takes the first screenful only and leaves the tab bar in. `--webkit` renders in Safari's engine, which is what the home-screen app runs on, into `screens/<mode>-webkit`. If a browser is missing, run `npx playwright install chromium` (or `webkit`) first.
2. Open the PNGs it lists (`screens/<mode>/<screen>.png`) with the Read tool. They're full-page captures with the tab bar hidden; it's the same on every screen. The `lift-…` ones walk through a workout: the logger a few sets in, finishing it, and the session it saved.
3. Check them against the design rules in CLAUDE.md, especially the ones that slip most often:
   - it still looks like the board: outlines not filled cards, hatching not solid bars (only the one that matters is filled in), nearly square corners, no pills, gradients or glows
   - Big Shoulders for numbers, titles and buttons, Sofia Sans for reading; sentence case
   - coloured chalk only on data (zones, sports, ratings, readiness); one circled number a screen at most
   - few words: nothing explains its method, nothing restates a chart, and nothing empty is on show (no dashes, zeros or blank boxes)
   - text that wraps awkwardly or gets cut off at 390 px
4. Say what's off and in which file, fix it, then run the same screen again.

Live mode on the fake has no logged matches or workouts, so it has no match report, and Lift shows what a first visit looks like; sample mode has both.
