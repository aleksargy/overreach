import { X } from 'lucide-react'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  kicker?: string
  children: ReactNode
  footer?: ReactNode
}

/** Bottom sheet: drag the handle down or tap outside to close. */
export function Sheet({ open, onClose, title, kicker, children, footer }: Props) {
  const controls = useDragControls()
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-ink-0/70 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[min(92%,860px)] max-w-app flex-col rounded-t-sheet bg-ink-1 shadow-[0_-24px_64px_rgb(0_0_0/0.55),inset_0_1px_0_rgb(var(--fg)/0.06)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 42 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose()
            }}
          >
            <div className="cursor-grab touch-none pb-1 pt-2.5 active:cursor-grabbing" onPointerDown={(e) => controls.start(e)}>
              <div className="mx-auto h-[5px] w-9 rounded-full bg-ink-3" />
              {(title || kicker) && (
                <div className="gutter flex items-center justify-between gap-3 pt-3">
                  <div className="min-w-0">
                    {kicker && <div className="label mb-1">{kicker}</div>}
                    {title && <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.025em]">{title}</h2>}
                  </div>
                  <button onClick={onClose} aria-label="Close" className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-3 text-fg-2">
                    <X size={16} strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>
            <div
              className={`gutter overflow-y-auto overscroll-contain pt-3 [mask-image:linear-gradient(to_bottom,transparent,black_14px)] ${footer ? 'pb-4' : 'pb-[max(16px,env(safe-area-inset-bottom,0px))]'}`}
            >
              {children}
            </div>
            {footer && <div className="gutter pb-[max(16px,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-1px_0_rgb(var(--line))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
