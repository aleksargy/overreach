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
            className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
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
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[min(92%,860px)] max-w-app flex-col rounded-t-sheet border-t border-line-2 bg-ink-2 shadow-[0_-20px_60px_rgba(0,0,0,0.6)]"
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
              <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
              {(title || kicker) && (
                <div className="gutter flex items-end justify-between pt-3">
                  <div>
                    {kicker && <div className="label mb-1">{kicker}</div>}
                    {title && <h2 className="font-display text-[30px] font-black uppercase leading-none">{title}</h2>}
                  </div>
                  <button onClick={onClose} aria-label="Close" className="press grid h-9 w-9 place-items-center rounded-full bg-ink-3 text-fg-2">
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>
            <div
              className={`gutter overflow-y-auto overscroll-contain pt-3 [mask-image:linear-gradient(to_bottom,transparent,black_14px)] ${footer ? 'pb-4' : 'pb-[max(16px,env(safe-area-inset-bottom,0px))]'}`}
            >
              {children}
            </div>
            {footer && <div className="gutter border-t border-line pb-[max(16px,env(safe-area-inset-bottom,0px))] pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
