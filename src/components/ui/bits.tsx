import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

export function Section({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-8 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="font-display text-[22px] font-extrabold uppercase leading-none tracking-wide">{title}</h2>}
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
  const cls = size === 'lg' ? 'text-[44px]' : size === 'sm' ? 'text-[24px]' : 'text-[32px]'
  return (
    <div className="min-w-0">
      <div className="label mb-1.5 truncate">{label}</div>
      <div className={`num ${cls} ${tone ?? ''}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-[13px] font-medium tracking-normal text-fg-3">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[12px] text-fg-3">{sub}</div>}
    </div>
  )
}

export function Delta({ value, unit = '', better = 'up', dp = 1 }: { value: number; unit?: string; better?: 'up' | 'down'; dp?: number }) {
  if (!Number.isFinite(value) || Math.abs(value) < 10 ** -dp / 2) return <span className="font-mono text-[11px] text-fg-3">±0{unit}</span>
  const good = better === 'up' ? value > 0 : value < 0
  return (
    <span className={`font-mono text-[11px] font-semibold ${good ? 'text-good' : 'text-bad'}`}>
      {value > 0 ? '▲' : '▼'} {Math.abs(value).toFixed(dp)}
      {unit}
    </span>
  )
}

export function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-warn">
      <span className="h-1 w-1 rounded-full bg-warn" />
      Sample data
    </span>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-2 p-5">
      <div className="font-display text-xl font-extrabold uppercase">{title}</div>
      {children && <p className="text-[14px] text-fg-3">{children}</p>}
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
    <div className={`grid gap-1 rounded-[10px] border border-line bg-ink-1 p-1`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`press rounded-[7px] ${size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-[14px]'} font-semibold transition-colors ${
            o.value === value ? 'bg-fg text-ink-0' : 'text-fg-3'
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
      className="press grid h-11 w-11 place-items-center rounded-full border border-line-2 bg-ink-1 text-fg-2 disabled:opacity-30"
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
  const num = <Bump value={value} className={`num min-w-[1.2ch] text-center ${big ? 'text-[72px] leading-[0.9]' : 'text-[40px]'}`} />
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
      className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-fg' : 'bg-ink-3'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full transition-all ${on ? 'left-6 bg-ink-0' : 'left-1 bg-fg-3'}`} />
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-fg-3">{hint}</span>}
    </label>
  )
}

export const inputCls = 'h-12 w-full rounded-[10px] border border-line-2 bg-ink-1 px-3.5 text-[16px] text-fg placeholder:text-fg-4 focus:border-fg focus:outline-none'

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
  'num h-9 w-full min-w-0 rounded-[7px] bg-ink-2 text-center text-[18px] placeholder:text-fg-4 focus:bg-ink-3 focus:outline-none focus:ring-1 focus:ring-fg/60'
