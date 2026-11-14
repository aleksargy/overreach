import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Ticker } from '../../components/ui/Ticker'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { ratingTone, result } from '../../lib/football'
import { RatingLines } from './RatingLines'

const RESULT_WORD = { W: 'Win', D: 'Draw', L: 'Loss' } as const

/** The moment after you log a game: the rating counts up on the gold tint, then the lines that made it. */
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
          <div className="gutter relative mx-auto flex w-full max-w-app flex-1 flex-col pb-[max(24px,var(--safe-bottom))] pt-[calc(var(--edge)+4px)]">
            <div className="label">
              {m.team} {m.scoreFor}–{m.scoreAgainst} {m.opponent} · {RESULT_WORD[result(m)]}
            </div>
            <section className="hero mt-3 flex flex-col gap-1.5 bg-gold-tint">
              <h2 className="text-[13px] font-bold text-gold-label">Match rating</h2>
              <div className="mb-2 flex items-baseline gap-2.5">
                <Ticker value={m.rating} dp={1} duration={1400} className="num-hero text-[96px] leading-[0.95] tabular-nums text-gold-head" />
                <motion.span className="text-[17px] font-bold text-gold-label" initial={{ opacity: 0, y: 6 }} animate={done ? { opacity: 1, y: 0 } : {}}>
                  {tone.word}
                </motion.span>
              </div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={done ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.15, duration: 0.4 }}>
                <RatingLines m={m} />
              </motion.div>
            </section>

            <motion.div className="mt-auto grid grid-cols-2 gap-2 pt-8" initial={{ opacity: 0 }} animate={done ? { opacity: 1 } : {}} transition={{ delay: 0.5 }}>
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
