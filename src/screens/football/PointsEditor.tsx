import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { MatchPoint } from '../../data/types'
import { BIG_POINT, POINT, pointValue } from '../../lib/football'
import { signed } from '../../lib/format'

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * What went well and what didn't, in your words: two columns you add to, and
 * suggestions from the points you've written before. Tapping a point makes it
 * a big one, which counts double.
 */
export function PointsEditor({ points, onChange, suggestions }: { points: MatchPoint[]; onChange: (points: MatchPoint[]) => void; suggestions: MatchPoint[] }) {
  const has = (text: string) => points.some((p) => same(p.text, text))
  const add = (p: MatchPoint) => !has(p.text) && onChange([...points, p])
  const offer = suggestions.filter((s) => !has(s.text)).slice(0, 8)
  return (
    <div>
      <div className="grid grid-cols-2 items-start gap-2">
        {[true, false].map((good) => (
          <Column key={String(good)} good={good} points={points} onChange={onChange} add={add} />
        ))}
      </div>
      <p className="mt-2 px-1 text-[12px] text-fg-4">
        Each point counts {POINT}. Tap one to make it big, {BIG_POINT}.
      </p>
      {offer.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {offer.map((s) => (
            <button key={s.text} onClick={() => add({ ...s })} className="chip">
              <span className={`text-[13px] font-semibold ${s.good ? 'text-z2' : 'text-z5'}`}>{s.good ? '+' : '−'}</span>
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Column({ good, points, onChange, add }: { good: boolean; points: MatchPoint[]; onChange: (points: MatchPoint[]) => void; add: (p: MatchPoint) => void }) {
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const mine = points.map((p, i) => ({ p, i })).filter((x) => x.p.good === good)
  const total = mine.reduce((a, x) => a + pointValue(x.p), 0)
  const commit = (stay: boolean) => {
    if (text.trim()) add({ text: text.trim(), good })
    setText('')
    setTyping(stay)
  }
  const change = (i: number, p?: MatchPoint) => onChange(points.flatMap((x, k) => (k !== i ? [x] : p ? [p] : [])))
  return (
    <div className="rounded-card bg-ink-2 px-3 pb-2 pt-3">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className={`text-[13px] font-semibold ${good ? 'text-z2' : 'text-z5'}`}>{good ? 'Went well' : 'Went badly'}</span>
        {mine.length > 0 && <span className="text-[12px] font-medium tabular-nums text-fg-3">{signed(total, 2)}</span>}
      </div>
      <div className="mt-1.5">
        {mine.map(({ p, i }) => (
          <div key={i} className="flex items-start gap-1 border-t border-line py-2 first:border-t-0">
            <button
              onClick={() => change(i, { ...p, big: !p.big || undefined })}
              aria-pressed={!!p.big}
              aria-label={`${p.text}${p.big ? ', big' : ''}. Tap to make it ${p.big ? 'normal' : 'big'}`}
              className="min-w-0 flex-1 px-0.5 text-left text-[14px] leading-snug"
            >
              <span className={p.big ? 'font-semibold text-fg' : 'text-fg-2'}>{p.text}</span>
              {p.big && (
                <span className={`ml-1.5 inline-block rounded-full px-1.5 text-[11px] font-semibold leading-[18px] ${good ? 'bg-z2/15 text-z2' : 'bg-z5/15 text-z5'}`}>Big</span>
              )}
            </button>
            <button aria-label={`Remove ${p.text}`} onClick={() => change(i)} className="press -mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-4">
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
      {typing ? (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit(true)}
          onBlur={() => commit(false)}
          enterKeyHint="done"
          maxLength={60}
          aria-label={good ? 'Something that went well' : 'Something that went badly'}
          placeholder={good ? 'Won every header' : 'Lost my man'}
          className="mb-1 mt-1 h-10 w-full rounded-[10px] bg-ink-3 px-2.5 text-[16px] text-fg placeholder:text-fg-4 focus:outline-none"
        />
      ) : (
        <button onClick={() => setTyping(true)} className="press -ml-0.5 flex h-9 items-center gap-1 px-0.5 text-[13px] font-medium text-fg-3">
          <Plus size={14} strokeWidth={2} /> Add
        </button>
      )}
    </div>
  )
}
