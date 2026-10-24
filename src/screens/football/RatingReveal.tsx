import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Ticker } from '../../components/ui/Ticker'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { ratingTone, result } from '../../lib/football'
import { signed } from '../../lib/format'

const RESULT_WORD = { W: 'Win', D: 'Draw', L: 'Defeat' } as const

const TONE_VAR: Record<string, string> = {
  'bg-strength': '--strength',
  'bg-z1': '--z1',
  'bg-z2': '--z2',
  'bg-z3': '--z3',
  'bg-z4': '--z4',
  'bg-z5': '--z5',
}

/** The full-screen moment after you log a game: the number counts up, then the back page lands. */
export function RatingReveal() {
  const id = useUi((s) => s.reveal)
  const show = useUi((s) => s.showReveal)
  const w = useWorld()
  const nav = useNavigate()
  const m = id ? w.matches.find((x) => x.id === id) : undefined
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDone(false)
    if (!m) return
    const t = setTimeout(() => setDone(true), 1500)
    return () => clearTimeout(t)
  }, [m])

  const tone = m ? ratingTone(m.rating) : null
  const color = tone ? `rgb(var(${TONE_VAR[tone.cls]}))` : 'rgb(var(--fg))'

  return createPortal(
    <AnimatePresence>
      {m && tone && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-ink-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => setDone(true)}
        >
          <motion.div
            className="pointer-events-none absolute left-1/2 top-[26%] h-[520px] w-[520px] rounded-full"
            style={{ x: '-50%', y: '-50%', background: `radial-gradient(circle, ${color} 0%, transparent 62%)` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: done ? 0.28 : 0.1, scale: done ? 1 : 0.8 }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <div className="gutter relative mx-auto flex w-full max-w-app flex-1 flex-col pb-[max(24px,env(safe-area-inset-bottom,0px))] pt-[max(48px,env(safe-area-inset-top,0px))]">
            <div className="label text-center">
              {m.team} {m.scoreFor}–{m.scoreAgainst} {m.opponent} · {RESULT_WORD[result(m)]}
            </div>
            <div className="mt-6 flex flex-col items-center">
              <div className="label">Match rating</div>
              <span className="mt-2 transition-colors duration-500" style={{ color: done ? color : 'rgb(var(--fg))' }}>
                <Ticker value={m.rating} dp={1} duration={1400} className="num block text-[150px] leading-[0.82]" />
              </span>
              <motion.div
                className="mt-3 font-mono text-[12px] font-semibold uppercase tracking-[0.3em]"
                style={{ color }}
                initial={{ opacity: 0, y: 8 }}
                animate={done ? { opacity: 1, y: 0 } : {}}
              >
                {tone.word}
              </motion.div>
            </div>

            <motion.div className="mt-8" initial={{ opacity: 0, y: 16 }} animate={done ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.25, duration: 0.45 }}>
              <span className="bg-bad px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-0">Back page</span>
              <h2 className="mt-2 font-display text-[38px] font-black uppercase leading-[0.92]">{m.headline}</h2>
            </motion.div>

            <div className="mt-6 flex flex-col gap-1.5">
              {m.breakdown.map((f, i) => (
                <motion.div
                  key={f.key}
                  className="flex items-center justify-between gap-3 border-b border-line pb-1.5"
                  initial={{ opacity: 0, x: -10 }}
                  animate={done ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.5 + i * 0.07 }}
                >
                  <span className="text-[14px] text-fg-2">{f.label}</span>
                  <span className={`font-mono text-[13px] font-semibold ${f.value > 0 ? 'text-good' : f.value < 0 ? 'text-bad' : 'text-fg-3'}`}>{signed(f.value, 2)}</span>
                </motion.div>
              ))}
              <motion.div
                className="flex items-center justify-between pt-1"
                initial={{ opacity: 0 }}
                animate={done ? { opacity: 1 } : {}}
                transition={{ delay: 0.5 + m.breakdown.length * 0.07 }}
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-3">Everyone starts on 6.0</span>
                <span className="num text-[20px]" style={{ color }}>
                  {m.rating.toFixed(1)}
                </span>
              </motion.div>
            </div>

            <motion.div className="mt-auto grid grid-cols-2 gap-2 pt-8" initial={{ opacity: 0 }} animate={done ? { opacity: 1 } : {}} transition={{ delay: 0.9 }}>
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  show(null)
                }}
              >
                Done
              </button>
              <button
                className="btn-primary"
                onClick={(e) => {
                  e.stopPropagation()
                  show(null)
                  nav(`/match/${m.id}`)
                }}
              >
                See the report
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
