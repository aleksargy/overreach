# Floodlight

The app's new look, picked by Alex on 13 Nov 2026 from five directions to replace the board (slate and chalk). The mockups sit beside this file in `docs/design/floodlight/`: a PNG of each screen at 390 px wide (shot at 2×), and the HTML it was drawn from, which holds every exact value. Open the HTML in a browser to inspect it.

| Screen       | Mockup                                  |
| ------------ | --------------------------------------- |
| Today        | `today.png`, `today.html`               |
| Run          | `run.png`, `run.html`                   |
| Football     | `football.png`, `football.html`         |
| Body         | `body.png`, `body.html`                 |
| Lift         | `lift.png`, `lift.html`                 |
| Match report | `match-report.png`, `match-report.html` |

The numbers in the mockups are made up to look like the sample data. The screens keep reading the same world as now.

## What changes

- The look, everywhere. The screens, routes, data and features stay as they are on `board` (PR #15): the small Run tab, Lift, the match log with points, ghosts, race reports, and `standout` deciding what's worth saying.
- Readiness comes out of the app. Alex: "i dont want the readiness thing or green light i dont care about that metric for the app". No verdict on Today, no week of readiness, no readiness sheet. Remove `src/lib/readiness.ts`, its tests and its place in `useWorld()` unless something else still reads it, and take it out of `CLAUDE.md`. HRV, resting heart rate and sleep stay on Body as plain readings.
- The player card becomes a black Ultimate Team-style card (see Football). Alex asked for it to look like the cards in FIFA and EA FC, and picked the black one.
- The chalk goes: the hand-drawn marks in `ui/chalk.tsx` (`Circled`, `Underline`, `Tick`, `Mark`), hatching (`.hatch`, `.solid`, `Hatch`), the chalk rules, the outlined `.card`, the smudge, and Libre Franklin and Sofia Sans. What they meant stays (see "From the board to Floodlight").
- The app icon stays the chalked pitch for now.

## The idea

Graphite and big rounded tiles. Each tab has one hero tile tinted in its own muted colour, and everything else sits on plain graphite tiles. Colour is soft, never neon: Alex asked for a more muted palette than the first Floodlight. Nothing glows and nothing is blurred.

## Colour

Keep colours as RGB triplets on `:root` in `src/styles/index.css`, used through Tailwind, and keep the existing token names where they fit, so most components change by value alone. Never hardcode hex in components.

Surfaces and text:

| Token    | Hex       | RGB         | For                                                        |
| -------- | --------- | ----------- | ---------------------------------------------------------- |
| `ink-0`  | `#101214` | 16 18 20    | The page                                                   |
| `ink-1`  | `#1a1d20` | 26 29 32    | Tiles and sheets                                           |
| `ink-2`  | `#23272b` | 35 39 43    | The tab bar, chips, icon buttons, hairlines inside a tile  |
| `ink-3`  | `#2c3136` | 44 49 54    | Pressed                                                    |
| `line-2` | `#3a3f44` | 58 63 68    | Dashed outlines: a planned game, "+ New"                   |
| `fg`     | `#ebe9e4` | 235 233 228 | Text, and the solid pill (current tab, +, primary buttons) |
| `fg-2`   | `#b9bcb8` | 185 188 184 | Reading text on a tile                                     |
| `fg-3`   | `#8e918f` | 142 145 143 | Labels and units                                           |
| `fg-4`   | `#5d6163` | 93 97 99    | Placeholders                                               |

Each tab's colour comes as a set: the colour itself (lines, bars, dots), a tint (the hero tile behind it), a label colour for small text on the tint, and a brighter headline colour for the hero's big text on the tint.

| Set                | Colour    | Tint      | Label     | Headline  | Used for                                                                       |
| ------------------ | --------- | --------- | --------- | --------- | ------------------------------------------------------------------------------ |
| `football` (sage)  | `#c4d39b` | `#252b20` | `#a9b58a` | `#d5e2ad` | Football, Today's week tile, anything new (a best, the one thing worth a look) |
| `run` (dusty blue) | `#8aa0bf` | `#1d232c` | `#93a6c2` | `#c9d6ea` | Running, Run's hero, a game to rate, the next game on Today                    |
| `body` (mauve)     | `#c7a6b8` | `#261f24` | `#b8a0ad` | `#e6d3dd` | Body's weight tile                                                             |
| `strength` (lilac) | `#a99fc4` | `#221f2a` | `#b3abcf` | `#ddd6ee` | Lifting, Lift's next workout                                                   |
| `gold`             | `#c7b078` | `#262217` | `#c7b078` | `#e3d29d` | The match rating tile, and the player card's metal                             |

Data:

| Token                   | Hex                                                   | For                                                       |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `good`                  | `#a3c4a9`                                             | Better, a win, a gain (a W chip is filled with `#94b89e`) |
| `bad`                   | `#c48c8c`                                             | Worse, a loss, a cross                                    |
| `z1` to `z5`            | `#93a9c9`, `#94b89e`, `#d8cf8c`, `#d0a46a`, `#c98383` | Heart-rate zones, in Garmin's order, muted                |
| `ride`, `swim`, `other` | `#7fb5ad`, `#93b4c9`, `#96a0a6`                       | The other sports                                          |
| `warn`                  | `#d0b27a`                                             | The Sample data pill                                      |

Match ratings keep their bands from the board, read through these colours. `mark`, the chalk yellow, goes. Alex doesn't like orange, so the ochre z4 is the nearest thing to it and only appears in zone charts.

## Type

- **Bricolage Grotesque** for anything big: titles, hero numbers and words, numbers on tiles and the card. `@fontsource-variable/bricolage-grotesque/standard.css`: optical size, width and weight. The mockups were drawn with optical sizes on, and `wdth.css` alone sets everything about 5% wider.
- **Manrope** for everything else: labels, reading, buttons, pills. `@fontsource-variable/manrope/wght.css`.
- Remove `@fontsource-variable/libre-franklin` and `@fontsource-variable/sofia-sans-semi-condensed`.

| Use                         | Face      | Size and weight                                                 |
| --------------------------- | --------- | --------------------------------------------------------------- |
| Screen title                | Bricolage | 30 px, 800, −0.02em                                             |
| Hero number                 | Bricolage | 58 to 64 px, 800, −0.04em, line height 0.9; its unit 18 px, 600 |
| Hero words (Today's week)   | Bricolage | 44 px, 800, −0.035em, width 85%                                 |
| A number on a tile          | Bricolage | 20 to 40 px, 700, −0.02em to −0.03em                            |
| The card's numbers and name | Bricolage | 800, width 75%                                                  |
| Label above a value         | Manrope   | 12.5 px, 600, `fg-3` (on a tint, the set's label colour)        |
| Reading                     | Manrope   | 13 to 15 px, 500, `fg-2`                                        |
| Pill                        | Manrope   | 12.5 px, 700                                                    |
| Button                      | Manrope   | 14 to 15 px, 700 to 800                                         |

Sentence case. The only capitals are the card's six stat names and the position. Check whether Bricolage's figures take `tabular-nums`; if they don't, keep `Digits` for numbers that tick.

## Shape and space

- 16 px gutters. Content starts 58 px down (respecting safe areas) and is at most 520 px wide.
- **Tiles**: `ink-1`, 22 px corners, 16 px padding, no border, no shadow. **Hero tiles**: 26 px corners, 18 px padding, in the tab's tint. 10 px between tiles, 8 to 10 px inside a grid.
- **Pills** for anything you press or pick. Chips are 36 px tall on `ink-1`. The format switch is a pill track (`ink-1`, 4 px padding) with the picked option as a solid `fg` pill. A status pill (12.5 px, 700) sits on its colour at about 12 to 14%.
- **Icon buttons** are 40 px circles: the + is solid `fg` with an `ink-0` glyph, the rest are `ink-2`.
- **The primary button** is a 50 px pill: `fg` with `ink-0` text, or on a hero tile its headline colour with near-black text (Lift's Start workout).
- **The tab bar** is a floating pill: centred, 26 px above the bottom safe area, 60 px tall, `ink-2`, 30 px corners, no blur. Idle tabs are 44 px circles with the icon in `fg-3`; the current tab grows into a solid `fg` pill with its icon and name. Today, Run, Football, Lift, Body, with the drawn icons kept. Content scrolls under it, so leave room at the foot of every screen.
- **Sheets**: `ink-1`, 26 px top corners, a handle, pills inside. The page behind dims; nothing is blurred.
- **Lists** are rows inside one tile, split by `ink-2` hairlines.
- **Pushed screens** (a match report, an activity, a workout) get round 40 px Back and action buttons at the top instead of "‹ Back" in text.

## Charts

- Lines are 2.5 px with round caps, in the tab's colour. The latest reading is a 5 px `fg` dot, or a ring when it's the one worth a look.
- Raw readings are 2 px dots at 40% of the colour.
- Bars are capsules (5 to 6 px corners) in the colour at about 20%, the one that matters solid, the current week in `fg`. A dashed `line-2` line marks the usual week.
- Progress against the usual is an 8 px rounded track: the colour on the colour at 16%.
- Sleep is one 12 px stacked bar with 3 px gaps: deep `#6f86ab`, REM lilac, light `#3f4550`, awake `bad`, with the legend and each time underneath.
- The heatmap is a dark pitch (`#16191c`, lines `#2e3338`) with soft blobs going from sage to gold.
- No grids and no axes; a label only where it's needed (Manrope 10 to 11 px, `fg-3`).

## From the board to Floodlight

| Board                                                                                 | Floodlight                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Circled` and `StandoutLine`: the one thing worth a look                              | The reading big on a tile with one sage line under it ("Lightest in 3 months"). Still only from `standout`, still rare, and still nothing on an ordinary day. |
| `Underline` under what's picked                                                       | The solid `fg` pill                                                                                                                                           |
| `Tick` for done                                                                       | A filled circle in the sport's colour                                                                                                                         |
| `Mark`, the nought and cross                                                          | A small ring in `good` and a cross in `bad`, beside each point in the rating breakdown                                                                        |
| Hatching, with the one that matters filled                                            | Faint capsule bars, with the one that matters solid                                                                                                           |
| `.card` outlines                                                                      | `ink-1` tiles                                                                                                                                                 |
| A chalk rule across the board above each section                                      | Space. A section is a tile with a small label at its top.                                                                                                     |
| `RatingBadge`                                                                         | A pill: the rating in 800 on its colour's tint                                                                                                                |
| `SampleBadge`                                                                         | A pill in `warn`                                                                                                                                              |
| The docked bars (tab bar, the top bar once scrolled, rest timer, a minimised workout) | The tab bar is the floating pill. The others become `ink-2` pills or tiles floating just above it.                                                            |

## Screens

### Today (`today.png`)

1. The date, "Evening, Alex", + (the log sheet) and A (Settings).
2. **This week** (football tint): load against the usual in the label row ("Load 1043 · usually 1182"), the headline ("4 sessions, 14.6 km run"), then the week as seven 34 px circles. A done session is filled in its sport's colour with a short label (R, 7s, L), today is ringed in the headline colour, a planned game is dashed in sage with its format, and an empty day is faint. This replaces readiness and the load chart.
3. Two tiles: **Next game** (run tint: "Sunday 10:30", the format, the last result with its rating) and **Weight** (the latest weigh-in, and the one thing worth a look in sage when there is one).
4. A game to rate, when there is one, as on Football.
5. **Latest**: the last activity with its route drawn small and its three numbers, then "All activity ›".

### Run (`run.png`)

1. "28 runs since August" and Run.
2. **This week** (run tint): the distance huge, "Usually 23 km" as a pill, a track against the usual week, twelve weeks of bars (the biggest solid in the run colour, this week in `fg`), and the biggest week in one line when it's the standout.
3. **Fitness**: the pace at an easy 145 bpm, the change as a `good` pill, and the trend.
4. **Bests**: a small tile each. A new best gets the football tint and says "new".
5. Races and recent runs (not drawn): rows in a tile each, and the race card on top when "Training for a race" is on.

### Football (`football.png`)

1. "Season 26/27 · 16 rated", Football and + (the match log), then the format switch once two formats have been played.
2. **The player card** beside the season (apps, goals · assists, the average rating, and a W-D-L bar):
   - 200 × 300, the shield `M100 4C130 4 150 9 168 18H196V236C196 257 160 275 100 296C40 275 4 257 4 236V18H32C50 9 70 4 100 4Z`.
   - A black body: a gradient from `#2b2c31` through `#16171a` to `#0c0c0e`, top left to bottom right, faint diagonal stripes (white at 3.5%), a 2.5 px metal edge (`#ecdcaa` to `#8a7646`) and a 1 px inner line at 30%.
   - Top left: the overall (50 px), the position, a short rule, the ball icon, and "In form" when the form stat is high. A silhouette fills the top right.
   - Then the name, a hairline, and the six stats in two columns split by a hairline: the value 19 px, 800, width 75%; the stat's name 11.5 px, 700, in the darker metal (`#a8996c`). Lettering `#eadcae`, the name `#f1e6c2`.
   - The tier sets the metal: gold as drawn, silver and bronze done the same way in muted metals. Keep the tiers, the stats and "How the card is built" from `football.ts`. The rating reveal can turn this card over.
3. **A game to rate** (run tint) with a Rate pill. A swipe left still skips it.
4. **Form**: the last eight as rounded chips, W in `#94b89e`, L in `bad`, D in `ink-2` with light text, each with its rating. "Keeps coming up" goes underneath (not drawn), as rows with a ring or a cross.
5. Not drawn: records, where you play (the season heatmap, drawn like the match report's), head to head, and the matches. A tile each.

### Body (`body.png`)

1. "Weight and sleep", Body and + (a weigh-in).
2. **Weight** (body tint): the 7-day average huge, "↓ 0.5 kg in 4 weeks" as a pill, the weigh-ins as dots under the trend line with the latest ringed, and the one thing worth a look in one line.
3. **Last night**: the time asleep, a sleep score pill, and the stages bar with its legend.
4. **Last 7 days, against your usual**: HRV, resting heart rate, sleep and steps as four small tiles, each with its change in `good`, or in `fg-3` when it's neither better nor worse.

### Lift (`lift.png`)

1. "10 sessions in 4 weeks", Lift and + (a new workout).
2. **Next up** (strength tint): when it was last done, its name huge, its muscles, each exercise with its sets and the rule in play and the target at the right, then Start workout.
3. The workouts as a row of chips that scrolls sideways: the next one tinted, "+ New" dashed.
4. **Progress**: the lifts done most in eight weeks, each with a step line, the current weight and the gain in `good`.
5. Recent sessions (not drawn): rows in a tile, with a session's bests said in sage.

### Match report (`match-report.png`)

1. Round Back and Edit buttons; the date, kick-off, format and which meeting it was. No headline and no summary: Alex dropped them on 13 Nov ("i dont want any cringe one liners or fake summaries"), so the score comes straight after.
2. **The score**: both teams as initials in circles (yours in the football tint), the score huge, a Win, Draw or Loss pill, then goals, assists and how it felt.
3. **The rating** (gold tint): the rating huge with its word, the median for that format as a pill, then every line that moved it from 6.00. Points from the log carry a ring or a cross, and a big point is quoted.
4. **From the watch**: distance, top speed, sprints and metres a minute.
5. **Where you played**: the heatmap and "Attacking →" (tap it to turn the pitch round).

### Not drawn

The sheets (the log sheet, the match log and its points editor, the weigh-in, the exercise sheets), the workout logger with its minimised bar and rest timer, the rating reveal, All activity, an activity, the race report, ghosts and Settings. Build them from the same pieces, and show Alex a screenshot of each before polishing.

## Motion

Keep the `motion/react` springs and `MotionConfig reducedMotion="user"`. Tiles rise 10 px as they fade in. The current tab's pill slides between tabs (a shared `layoutId`). Hero numbers can count up the first time they show (`Ticker`).

## Order of work

1. Tokens, fonts and `tailwind.config.js`, and the chalk pieces out.
2. The tab bar, the screen frame, tiles, pills, the format switch and sheets.
3. Today, with readiness taken out. Run `npm run screens`, compare it with `today.png`, and show Alex before going on.
4. Football with the card, then Run, Body, Lift and the match report, each compared with its mockup.
5. The screens that weren't drawn.
6. Rewrite the design rules in `CLAUDE.md` for Floodlight, add to `docs/decisions.md`, and open a pull request into main. It carries PR #15's work too, so close #15 when this one merges, or merge #15 first.
