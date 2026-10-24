import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

export function Section({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-10 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="text-[17px] font-semibold tracking-[-0.015em]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({
  label,
  value,
  unit,
  sub,
  size = 'md',
  tone,
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  tone?: string
}) {
  const cls = size === 'lg' ? 'text-[40px] font-light' : size === 'sm' ? 'text-[22px]' : 'text-[28px]'
  return (
    <div className="min-w-0">
      <div className="label mb-2 truncate">{label}</div>
      <div className={`num ${cls} ${tone ?? ''}`}>
        {value}
        {unit && <span className="ml-1 text-[13px] font-normal tracking-normal text-fg-3">{unit}</span>}
      </div>
      {sub && <div className="meta mt-1">{sub}</div>}
    </div>
  )
}

/** A change, with an arrow, coloured by whether it's the good direction. */
export function Delta({ value, unit = '', better = 'up', dp = 1 }: { value: number; unit?: string; better?: 'up' | 'down'; dp?: number }) {
  if (!Number.isFinite(value) || Math.abs(value) < 10 ** -dp / 2) return <span className="text-[13px] font-medium tabular-nums text-fg-3">Steady</span>
  const good = better === 'up' ? value > 0 : value < 0
  return (
    <span className={`whitespace-nowrap text-[13px] font-medium tabular-nums ${good ? 'text-good' : 'text-bad'}`}>
      {value > 0 ? '↑' : '↓'} {Math.abs(value).toFixed(dp)}
      {unit}
    </span>
  )
}

export function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2 py-[3px] text-[11px] font-medium leading-none text-warn">
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      Sample data
    </span>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-1.5 p-5">
      <div className="text-[16px] font-semibold tracking-[-0.01em]">{title}</div>
      {children && <p className="text-[14px] leading-snug text-fg-3">{children}</p>}
      {action}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="grid gap-1 rounded-full bg-ink-2 p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-full ${size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-[14px]'} font-medium transition-colors duration-150 ${
            o.value === value ? 'bg-fg/[0.14] text-fg shadow-[0_1px_3px_rgb(0_0_0/0.35)]' : 'text-fg-3'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Big tappable counter used for scores, goals and assists.
 * `stack` puts the buttons under the number, for narrow columns like a scoreboard.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  big,
  stack,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label?: string
  big?: boolean
  stack?: boolean
}) {
  const dec = (
    <button
      aria-label={`Decrease ${label ?? ''}`}
      onClick={() => onChange(Math.max(min, value - 1))}
      className="press grid h-11 w-11 place-items-center rounded-full bg-ink-3 text-fg-2 disabled:opacity-30"
      disabled={value <= min}
    >
      <Minus size={18} />
    </button>
  )
  const inc = (
    <button
      aria-label={`Increase ${label ?? ''}`}
      onClick={() => onChange(Math.min(max, value + 1))}
      className="press grid h-11 w-11 place-items-center rounded-full bg-fg text-ink-0"
    >
      <Plus size={18} />
    </button>
  )
  const num = <Bump value={value} className={`min-w-[1.2ch] text-center ${big ? 'num-hero text-[76px] leading-[0.95]' : 'num text-[36px] font-light'}`} />
  return (
    <div className="flex flex-col items-center gap-2">
      {label && <div className="label">{label}</div>}
      {stack ? (
        <>
          {num}
          <div className="flex items-center gap-2">
            {dec}
            {inc}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {dec}
          {num}
          {inc}
        </div>
      )}
    </div>
  )
}

/** A number that pops when it changes. */
export function Bump({ value, className }: { value: ReactNode; className?: string }) {
  const [k, setK] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setK((x) => x + 1)
  }, [value])
  return (
    <span key={k} className={`${className} ${k ? 'animate-[bump_.28s_cubic-bezier(.2,.8,.2,1)]' : ''}`}>
      {value}
    </span>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-fg' : 'bg-ink-3'}`}
    >
      <span
        className={`absolute top-[3px] h-6 w-6 rounded-full shadow-[0_2px_6px_rgb(0_0_0/0.4)] transition-all duration-200 ${on ? 'left-[23px] bg-ink-0' : 'left-[3px] bg-fg-2'}`}
      />
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      {children}
      {hint && <span className="meta mt-1.5 block">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'h-12 w-full rounded-[14px] bg-ink-2 px-4 text-[16px] text-fg ring-1 ring-inset ring-fg/[0.05] transition-shadow placeholder:text-fg-4 focus:outline-none focus:ring-fg/40'

/** Numeric field that lets you type "72." on the way to "72.5". */
export function NumInput({
  value,
  placeholder,
  onChange,
  decimal,
  label,
  className = numInputCls,
}: {
  value?: number
  placeholder?: string
  onChange: (v: number | undefined) => void
  decimal?: boolean
  label: string
  className?: string
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value === undefined ? '' : String(value))
  }, [value])
  return (
    <input
      aria-label={label}
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      value={draft}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true
        e.currentTarget.select()
      }}
      onBlur={() => {
        focused.current = false
        setDraft(value === undefined ? '' : String(value))
      }}
      onChange={(e) => {
        const t = e.target.value.replace(',', '.')
        if (!(decimal ? /^\d*\.?\d{0,2}$/ : /^\d*$/).test(t)) return
        setDraft(t)
        onChange(t === '' || t === '.' ? undefined : Number(t))
      }}
      className={className}
    />
  )
}

export const numInputCls =
  'num h-9 w-full min-w-0 rounded-[10px] bg-ink-2 text-center text-[17px] placeholder:text-fg-4 focus:bg-ink-3 focus:outline-none focus:ring-1 focus:ring-fg/50'
