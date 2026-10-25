---
name: check-screens
description: Screenshot every Overreach screen at 390 × 844, in sample mode and in live mode on the fake Garmin, and review the shots against the design rules in CLAUDE.md. Use after any change to a screen, a component or the styles, or when asked how the app looks.
---

# Check the screens

The design rules say every UI change gets looked at on a phone-sized screen in both modes. This does it in one go.

1. Run `npm run screens` (every screen, both modes, about a minute). One screen: `npm run screens -- settings`. One mode: `--sample` or `--live`. `--race` switches on "Training for a race" (a marathon two weeks out, goal 3:30) so the race card shows. If Chromium is missing, run `npx playwright install chromium` first.
2. Open the PNGs it lists (`screens/<mode>/<screen>.png`) with the Read tool. They're full-page captures with the tab bar hidden; it's the same on every screen.
3. Check them against the design rules in CLAUDE.md, especially the ones that slip most often:
   - colour only on data (zones, sports, ratings, readiness); the chrome stays near-black and grey
   - one card of rows split by hairlines, not a card per row; 16 px gutters on both sides
   - sentence case, no letter-spaced capitals; tabular figures; hero numbers big and light
   - nothing empty on show: no dashes, zeros or blank cards
   - text that wraps awkwardly or gets cut off at 390 px
4. Say what's off and in which file, fix it, then run the same screen again.

Live mode on the fake has no logged matches, so it has no match report; sample mode does.
