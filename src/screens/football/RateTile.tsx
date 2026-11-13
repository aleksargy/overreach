import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Swipeable } from '../../components/ui/Swipe'
import type { Activity, Format } from '../../data/types'
import { useSkipRating, useUi } from '../../data/ui'
import type { World } from '../../data/world'
import { dur, fmt, km } from '../../lib/format'
import { FORMATS, formatOf, usualOf } from '../../lib/football'

/** A game's format, when it's known: its rated match, its kind, or what you usually play then. Before any game is logged it isn't. */
export function formatOfGame(a: Activity, w: World): Format | undefined {
  const usual = usualOf(w.matches).format
  if (usual) return formatOf(a, w.matches, w.matchByActivity, usual)
  const k = Number(a.kind) as Format
  return FORMATS.includes(k) ? k : undefined
}

/** A game from the last two weeks still to rate, on the run tint with a Rate pill. Swipe it left to skip it. Wrap in AnimatePresence. */
export function RateTile({ a, w }: { a: Activity; w: World }) {
  const open = useUi((s) => s.open)
  const skip = useSkipRating()
  const ago = differenceInCalendarDays(w.now, parseISO(a.start))
  const when = ago === 0 ? 'today’s game' : ago === 1 ? 'yesterday’s game' : ago < 7 ? fmt(a.start, 'EEEE') : `the ${fmt(a.start, 'd MMM')} game`
  const format = formatOfGame(a, w)
  return (
    <Swipeable hint="Skip" onSwipe={() => skip(a.id)} surface="bg-run-tint" className="rounded-tile">
      <button onClick={() => open({ type: 'logMatch', activityId: a.id })} className="flex w-full items-center gap-3 py-3.5 pl-4 pr-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">Rate {when}</span>
          <span className="block truncate text-[12.5px] text-run-head/80">
            {[format && `${format}s`, `${km(a.distanceM, 1)} km`, a.football ? `${a.football.sprints} sprints` : dur(a.durationS)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="grid h-[38px] shrink-0 place-items-center rounded-full bg-fg px-[18px] text-[14px] font-extrabold text-ink-0">Rate</span>
      </button>
    </Swipeable>
  )
}
