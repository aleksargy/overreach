import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Screen } from '../../components/ui/Screen'

/**
 * How things are worked out, in one place, so the screens can stay numbers and labels. Opened from the ⓘ in
 * Settings; `/help#lift` opens on a topic. Keep each line short and true to the code it describes.
 */
const TOPICS: { key: string; title: string; lines: string[] }[] = [
  {
    key: 'lift',
    title: 'What to lift',
    lines: [
      'Each exercise has a rep range and one working weight: your heaviest working set. Warm-ups don’t count.',
      'Lighter sets before your first at the working weight are your ramp up to it. They keep their weight and reps, and don’t move the target.',
      'Your weakest set aims for one more rep than last time, and the others for at least what they did.',
      'Each week (Monday to Sunday) counts once, as your best session of a lift that week. Do a lift twice in a week and it goes on from the better one, so a tired second go doesn’t pull it down.',
      'Every set at the top of the range: the weight goes up a step, or more if a step would leave you over the top. The reps start again from what that weight should leave you, never under the bottom of the range.',
      'A step too big to make the bottom of the range waits: more reps first, until the heavier weight is in reach.',
      'Every set at the working weight three reps or more under the range: the weight is set again from the weakest, aiming for the middle. One set falling away doesn’t.',
      'Under the range two weeks running: a tenth off, then build back up.',
      'Five weeks at one weight with nothing gained: up a step if your weakest set would still make the range there, a tenth off if it wouldn’t.',
      'Four weeks off, or three times your usual gap if that’s longer: a tenth off.',
      'Fewer sets than the workout has, or a set done lighter after the working weight: the weight waits until they’re all done at the top.',
      'Bodyweight: one more rep each time. Holds: five more seconds. Weight added to you counts with your body weight.',
      'Reverse pyramid (set on the exercise): your top set first, then each set a tenth lighter and two reps higher. Lighter sets before the top one are a warm-up to it.',
      'The top set moves by the rules above. At the top of its range it goes up to what it says you’d lift for a rep over the bottom of it, and the sets after it go up with it.',
      'A set after the top one that was already a step down keeps its weight and adds a rep. Any other goes a tenth under the set above, at the reps its last go says you’d get there.',
      'A superset is exercises linked in a workout and done in turns, A1 then A2. Each still moves on its own.',
      'Two lifts that add weight to you, done in turns, share the belt: the weaker one sets the weight and the other does more reps. A lift is only ever held back that way, and three reps over its range it goes its own way.',
      'The bars beside a lift are its sets, each as tall as its weight against the heaviest, the working weight solid. On the lift’s own page, sets at more than one weight are steps with their numbers.',
      'A lift keeps a history for each thing it’s done with. Put it on other equipment and it starts again there, with the sessions before set aside until you go back.',
      'Equipment, beside a lift’s sessions, is for the ones that were on something else: say what, and the last session that was. It and the ones before it move.',
    ],
  },
  {
    key: 'log',
    title: 'In the logger',
    lines: [
      'The reps follow the weight: change it on a set and its reps change with it, the sets under it in a pyramid are placed again under it, and the other lift on the belt takes it too.',
      'Lifts on one belt are logged a round at a time, with one box for the belt: type it once and it goes on each of them. Split, behind ⋯, gives each its own card again.',
      'Tap a set’s number (in a round, the lift’s tag) to make it a warm-up (W) or a drop set (D). A drop set starts a fifth lighter, or as far down as last time. Warm-ups and drop sets count as work but never move a target or set a best.',
      'On a barbell lift the plates drawn are what goes on each side for your next set, on a 20 kg bar.',
      'A set that’s a new best turns its tick sage, at the session’s heaviest weight.',
    ],
  },
  {
    key: 'progress',
    title: 'Bests and progress',
    lines: [
      'A best is the heaviest you’ve lifted, or the most reps at that weight or heavier.',
      'A finished session is drawn as its sets: a group of bars for each lift, a new best in sage.',
      'Progress is your estimated max: what your best set says you could lift once, a thirtieth more for every rep. So reps gained at one weight count, and what a lift has gained is said as weight, or as reps at the same weight.',
      'Weight added to you counts with your body weight, and its estimated max is said as what you’d add.',
    ],
  },
  {
    key: 'programme',
    title: 'Programmes',
    lines: [
      'A programme is some of your workouts, run so many times a week, for a number of weeks or with no end.',
      'Next up only comes from the programme you’re on: the workout that’s waited longest. Your other workouts stay saved for when you go back to them.',
      'Weeks run Monday to Sunday, from the week it started. The short bars beside its week are this week’s sessions, solid for each one done.',
      'Starting a programme ends the one you were on. When its weeks are up it carries on until you run it again, start another or stop it.',
      'Each lift’s target follows it from programme to programme, so switching doesn’t start anything over.',
      'On its page each week is a column: a capsule for each session planned, solid for each one done.',
      'Goals: a set to reach on a lift by the end of the run, or ten weeks on with no end. The one suggested keeps the reps of your best set that week and adds weight at the rate the lift has gone up over the last twelve weeks: a quarter to one and a half percent a week, half a percent with less to go on, and each week past eight counting half.',
      'Move a goal a step either way. Stretch means it needs half as fast again as you’ve been going on that lift, or over a percent a week.',
      'A goal’s bar is your best set since you set it, against the goal by estimated one-rep max. Done is the goal’s weight lifted for its reps. On pace or behind shows after three weeks, from where your weekly bests are heading.',
      'A goal sits ahead of the line on its lift’s chart until you reach it.',
      'Sets a week: every set counts for the lift’s main muscle and half for each one that helps (Also works, on the exercise), and a workout comes round as often as your sessions a week share out between the programme’s workouts. A muscle left graphite gets nothing.',
      'A run that’s over stays on the programme’s page: its weeks, its sessions and how each goal ended.',
    ],
  },
  {
    key: 'rating',
    title: 'Match rating',
    lines: [
      'Everyone starts on 6.0.',
      'A win adds 0.5, a draw 0.1, and a defeat takes off 0.4. Winning or losing by four or more in 11s (five in 7s) counts a little more.',
      'Goals and assists count against the share of your team’s goals your position would usually have.',
      'Goals conceded count against your usual, more for keepers and defenders, and a clean sheet adds a little.',
      'Each thing that went well or badly counts 0.15, a big one 0.3, and all of them 0.6 at most. Tap one in the log to make it big.',
      'From the watch: metres a minute and sprints against your usual, and a new top speed.',
      'Fading late takes off 0.1: the last ten minutes or more under 85% of your first half’s metres a minute, and no five minutes of them back over 90%.',
      'How you say you played moves it too.',
      'Each game is judged against games of its own format.',
    ],
  },
  {
    key: 'football',
    title: 'From the watch',
    lines: [
      'Half time is when you paused the watch between the halves, and any standing about either side.',
      'Without a pause, it’s the longest spell of standing about with play either side, the two halves about the same length.',
      'Minutes and metres a minute run from kick-off to the final whistle, without half time. A warm-up and the walk off don’t count.',
      'Walking is under 7 km/h, jogging to 14.4, running to 18, and sprinting faster. High intensity is running and sprinting.',
      'A sprint is 18 km/h or more for two seconds.',
    ],
  },
  {
    key: 'card',
    title: 'Player card',
    lines: [
      'It shows after three rated games, for the position you’ve played most this season.',
      'PAC is your top speeds. STA is metres a minute, less for fading late. WRK is sprints per 10 minutes.',
      'SHO and PAS are goals and assists a game against what’s normal in the format. FRM is your average rating over the last five.',
      'Each game is judged against its own format first, so a goal in 11s counts for more than one in 7s.',
      'The edge is bronze under 65, silver from 65 and gold from 75. It says you’re in form when FRM is 85 or more.',
    ],
  },
  {
    key: 'run',
    title: 'Running',
    lines: [
      'Fitness is the pace you hold at an easy heart rate (68% of your reserve), with heat, hills and the day after football taken out.',
      'Bests are your fastest 1 km, 5 km, 10 km, half and marathon in the last year, by the clock. A race counts at its finish time.',
      'A race is a run marked as one on the watch, or your run on race day.',
      'Training for a race: Run opens with a countdown and your goal pace, and for a month afterwards with the result.',
      'Ghosts are your earlier runs that shared at least 3 km of this one, the same way round, raced on moving time.',
    ],
  },
  {
    key: 'news',
    title: 'What gets picked out',
    lines: [
      'Only what’s rare for you: the highest or lowest in a while, against your own readings.',
      'A morning has to be the most extreme in three weeks. A run has to beat the ten before it, a game the eight before it, a lift its last three sessions, by its best set’s estimated max.',
      'Today shows one only when it’s twice as rare, and from the last day or so. Most days nothing is.',
    ],
  },
  {
    key: 'load',
    title: 'Training load',
    lines: [
      'Garmin’s training load when the watch worked one out, otherwise your time in each heart-rate zone.',
      'A workout counts how hard it felt times its minutes.',
      'Your zones and your resting and maximum heart rate come from the watch.',
    ],
  },
  {
    key: 'sync',
    title: 'Sync and backups',
    lines: [
      'The app checks Garmin when you open it, at most every 10 minutes, and once early every morning.',
      'What you type is copied to your server a few seconds after each change, and comes back on a new phone.',
      'Export saves your matches, workouts, exercises and weigh-ins as a file. Restoring adds what’s in it and replaces nothing.',
      'Garmin is optional. Without it, what you log stays on this phone, so export a backup now and then.',
      'Sample data (Settings, Demo) shows the app with a made-up athlete instead of your Garmin data. What you log stays as it is.',
    ],
  },
]

/** How it works: one topic open at a time. */
export function HelpScreen() {
  const { hash } = useLocation()
  const [open, setOpen] = useState<string | null>(hash.slice(1) || null)
  // a link to a topic opens it, even with the page already up
  useEffect(() => {
    if (hash) setOpen(hash.slice(1))
  }, [hash])
  return (
    <Screen title="How it works" back>
      <div className="list ruled">
        {TOPICS.map((t) => {
          const on = open === t.key
          return (
            <section key={t.key}>
              <button onClick={() => setOpen(on ? null : t.key)} aria-expanded={on} className="flex w-full items-center gap-3 py-4 text-left">
                <h2 className="min-w-0 flex-1 text-[16px] font-semibold leading-5">{t.title}</h2>
                <ChevronDown size={17} strokeWidth={2} className={`shrink-0 text-fg-3 transition-transform duration-200 ${on ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 40 }}
                    className="overflow-hidden"
                  >
                    <ul className="flex flex-col gap-2.5 pb-5">
                      {t.lines.map((line) => (
                        <li key={line} className="text-[14.5px] leading-snug text-fg-2">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )
        })}
      </div>
    </Screen>
  )
}
