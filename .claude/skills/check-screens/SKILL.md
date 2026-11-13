---
name: check-screens
description: Screenshot every Overreach screen at 390 × 844, in sample mode and in live mode on the fake Garmin, and review the shots against the Floodlight design rules in CLAUDE.md and the mockups in docs/design/floodlight/. Use after any change to a screen, a component or the styles, or when asked how the app looks.
---

# Check the screens

The design rules say every UI change gets looked at on a phone-sized screen in both modes. This does it in one go.

1. Run `npm run screens` (every screen, both modes, a few minutes). One screen: `npm run screens -- settings`. One mode: `--sample` or `--live`. `--race` switches on "Training for a race" (a marathon two weeks out, goal 3:30) so the race card shows. `--bar` takes the first screenful only and leaves the floating tab bar in, which is how the mockups are drawn. `--webkit` renders in Safari's engine, which is what the home-screen app runs on, into `screens/<mode>-webkit`. If a browser is missing, run `npx playwright install chromium` (or `webkit`) first.
2. Open the PNGs it lists (`screens/<mode>/<screen>.png`) with the Read tool. They're full-page captures with the tab bar hidden. The `lift-…` ones walk through a workout: the logger a few sets in, finishing it, and the session it saved. `log-sheet`, `weigh-in` and `exercise-sheet` are sheets, and `reveal` is the rating counting up after a match is logged.
3. For Today, Run, Football, Body, Lift and the match report, put the `--bar` shot next to its mockup (`docs/design/floodlight/<screen>.png`) and look for differences in spacing, size, weight and colour.
4. Check them against the design rules in CLAUDE.md, especially the ones that slip most often:
   - graphite tiles (`ink-1`, 22 px corners) with one tinted hero a tab; hairlines inside a tile, never chalk rules or outlines
   - pills for anything pressed or picked; no glows, blur, gradients on surfaces, or Geist/Inter
   - Bricolage Grotesque for anything big, Manrope for everything else; sentence case
   - colour only from the tokens: a tab's set on its own screens, sage for anything new, good and bad for better or worse, ochre only in zone charts
   - no generated copy (headlines, summaries, quips), nothing that explains its method, nothing empty on show (no dashes, zeros or blank boxes)
   - text that wraps awkwardly or gets cut off at 390 px
5. Say what's off and in which file, fix it, then run the same screen again.

Live mode on the fake has no logged matches or workouts, so it has no match report, and Lift shows what a first visit looks like; sample mode has both.
