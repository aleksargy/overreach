import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useRef, type ReactNode } from 'react'

/**
 * A row you can swipe left to put away: past the threshold it slides off and
 * calls onSwipe, and the parent's AnimatePresence folds the gap closed. A tap
 * still taps; a drag never does.
 */
export function Swipeable({
  onSwipe,
  hint,
  surface = 'bg-ink-1',
  className = '',
  children,
}: {
  onSwipe: () => void
  hint: string
  surface?: string
  className?: string
  children: ReactNode
}) {
  const x = useMotionValue(0)
  const hintOpacity = useTransform(x, [-110, -30], [1, 0])
  const dragged = useRef(false)
  return (
    <motion.div className={`relative overflow-hidden ${className}`} exit={{ height: 0, opacity: 0, transition: { duration: 0.22 } }}>
      <motion.span aria-hidden style={{ opacity: hintOpacity }} className="absolute inset-y-0 right-5 flex items-center text-[13px] font-medium text-fg-3">
        {hint}
      </motion.span>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.8, right: 0 }}
        style={{ x }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          if (info.offset.x < -100 || info.velocity.x < -500) void animate(x, -480, { duration: 0.2 }).then(onSwipe)
        }}
        onClickCapture={(e) => {
          if (!dragged.current) return
          dragged.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
        className={`relative touch-pan-y ${surface}`}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
