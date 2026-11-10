import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Underline } from './chalk'

export function Section({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-9 ${className}`}>
      {(title || action) && (
        <>
          <div className="rule -mx-4" />
          <div className="mb-3.5 mt-4 flex items-baseline justify-between gap-3">
            {title && <h2 className="t-section">{title}</h2>}
            {action}
          </div>
        </>
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
  const cls = size === 'lg' ? 'text-[48px] !font-light' : size === 'sm' ? 'text-[26px]' : 'text-[32px]'
  return (
    <div className="min-w-0">
      <div className="label mb-2 truncate">{label}</div>
      <div className={`num ${cls} ${tone ?? ''}`}>
        {value}
        {unit && <span className="unit">{unit}</span>}
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
  return <span className="inline-flex items-center rounded-[4px] px-1.5 py-[3px] text-[11.5px] font-medium leading-none text-warn ring-1 ring-inset ring-warn/40">Sample data</span>
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-2 p-5">
      <div className="t-name">{title}</div>
      {children && <p className="text-[14.5px] leading-snug text-fg-3">{children}</p>}
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
    <div className="grid border-b border-fg/[0.13]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`relative ${size === 'sm' ? 'h-9 text-[14px]' : 'h-11 text-[15px]'} px-1 font-semibold transition-colors duration-150 ${o.value === value ? 'text-fg' : 'text-fg-3'}`}
        >
          <span className="block truncate">{o.label}</span>
          {o.value === value && <Underline seed={i + 2} className="-bottom-[4px] mx-auto max-w-[72%]" />}
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
      className="press grid h-11 w-11 place-items-center rounded-full text-fg-2 ring-1 ring-inset ring-fg/25 disabled:opacity-30"
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
  const num = <Bump value={value} className={`min-w-[1.4ch] text-center ${big ? 'num-hero text-[92px] leading-[0.9]' : 'num text-[40px] !font-normal'}`} />
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
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-fg' : 'ring-1 ring-inset ring-fg/30'}`}
    >
      <span className={`absolute top-[4px] h-[22px] w-[22px] rounded-full transition-all duration-200 ${on ? 'left-[24px] bg-ink-0' : 'left-[4px] bg-fg-3'}`} />
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
  'h-12 w-full rounded-[5px] bg-transparent px-3.5 text-[16px] text-fg ring-1 ring-inset ring-fg/20 transition-shadow placeholder:text-fg-4 focus:outline-none focus:ring-fg/70'

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

/** a number written on a chalk line */
export const numInputCls =
  'num h-10 w-full min-w-0 rounded-none border-b border-fg/25 bg-transparent text-center text-[24px] placeholder:text-fg-4 focus:border-fg focus:outline-none'
