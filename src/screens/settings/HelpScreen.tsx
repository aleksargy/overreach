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
      'Your weakest set aims for one more rep than last time, and the others for at least what they did.',
      'Every set at the top of the range: the weight goes up a step, and the reps start again from the bottom.',
      'A step too big to make the bottom of the range waits: more reps first, until the heavier weight is in reach.',
      'Three reps or more over or under the range: the weight is set again from your weakest set, aiming for the middle.',
      'Under the range twice running, or no reps gained in two sessions: a tenth off, then build back up.',
      'Four weeks off, or three times your usual gap if that’s longer: a tenth off.',
      'Fewer sets than the workout has, or a set done lighter: the weight waits until they’re all done at the top.',
      'Bodyweight: one more rep each time. Holds: five more seconds. Weight added to you counts with your body weight.',
      'Reverse pyramid (set on the exercise): your top set first, then each set two reps higher. Every set moves on its own by the same rules, and a new one starts a tenth lighter than the one above.',
      'A superset is exercises linked in a workout and done in turns, A1 then A2. Each still moves on its own.',
      'Tap a set’s number to make it a warm-up (W) or a drop set (D). A drop set starts a fifth lighter, or as far down as last time. Warm-ups and drop sets count as work but never move a target or set a best.',
      'A best is the heaviest you’ve lifted, or the most reps at that weight or heavier.',
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
      'A morning has to be the most extreme in three weeks. A run has to beat the ten before it, a game the eight before it, a lift its last three sessions.',
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
