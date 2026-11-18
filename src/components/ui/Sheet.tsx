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
  /** as tall as it goes, however little is in it: a list you search keeps still as it narrows */
  full?: boolean
}

/**
 * Bottom sheet: graphite with 26 px top corners, a handle and pills inside. Drag the handle down or tap outside
 * to close; the page behind only dims. It's a layer, so while you type it sits on the keyboard.
 */
export function Sheet({ open, onClose, title, kicker, children, footer, full }: Props) {
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
        <div className="layer z-50">
          <motion.div
            className="absolute inset-0 bg-ink-0/75"
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
            className={`sheet absolute inset-x-0 bottom-0 mx-auto flex max-w-app flex-col rounded-t-sheet bg-ink-1 ${full ? 'h-[min(calc(100%-var(--edge)-8px),860px)]' : 'max-h-[min(calc(100%-var(--edge)-8px),860px)]'}`}
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
              <div className="mx-auto h-[5px] w-10 rounded-full bg-fg/20" />
              {(title || kicker) && (
                <div className="gutter flex items-center justify-between gap-3 pt-3">
                  <div className="min-w-0">
                    {kicker && <div className="label mb-1">{kicker}</div>}
                    {title && <h2 className="display text-[24px] font-extrabold leading-none">{title}</h2>}
                  </div>
                  <button onClick={onClose} aria-label="Close" className="round h-9 w-9 text-fg-2">
                    <X size={17} strokeWidth={2.2} />
                  </button>
                </div>
              )}
            </div>
            <div
              className={`gutter overflow-y-auto overscroll-contain pt-3 [mask-image:linear-gradient(to_bottom,transparent,black_14px)] ${full ? 'min-h-0 flex-1' : ''} ${footer ? 'pb-4' : 'pb-[var(--sheet-foot)]'}`}
            >
              {children}
            </div>
            {footer && <div className="gutter pb-[var(--sheet-foot)] pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
