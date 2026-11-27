import type { Muscle } from '../../data/types'

// A part of the figure, on a 100 × 196 board with the body's middle at 50. A muscle or '-' (not one: the neck, the
// hands, the hips, the feet), then either 't' and [middle, top, foot, width at the top, width at the foot, how far the
// foot leans]: a limb or a muscle that tapers, its ends rounded; or 'r' and [x, y, width, height, corner]: a rounded block.
type Part = [muscle: Muscle | '-', kind: 't' | 'r', ...at: number[]]

const mirror = ([m, kind, ...v]: Part): Part =>
  kind === 'r' ? [m, kind, +(100 - v[0] - v[2]).toFixed(2), ...v.slice(1)] : [m, kind, 100 - v[0], v[1], v[2], v[3], v[4], -(v[5] ?? 0)]
const both = (...p: Part): Part[] => [p, mirror(p)]

// the arms hang a little out from the shoulders: the upper arm is the biceps from the front and the triceps from behind
const arms = (upper: Muscle): Part[] => [
  ...both('shoulders', 't', 26.5, 27, 46, 15.5, 10.5, -2.5),
  ...both(upper, 't', 23, 47.5, 74, 11.5, 9.5, -2),
  ...both('forearms', 't', 20, 76, 103, 10.5, 7.5, -2.5),
  ...both('-', 'r', 13.4, 104.5, 7.6, 9, 3.8),
]
const NECK: Part = ['-', 'r', 45.5, 19.5, 9, 8.5, 3]
const FEET = both('-', 'r', 36.6, 189.2, 9.6, 5, 2.5)

const FRONT: Part[] = [
  NECK,
  ...arms('biceps'),
  ...both('chest', 'r', 35.5, 29, 13.7, 18.5, 6),
  // the abs in three rows, and under them
  ...[49.5, 60.6, 71.7].flatMap((y) => both('core', 'r', 39.3, y, 9.9, 9.6, 3.6)),
  ['core', 'r', 40.6, 82.8, 18.8, 7.4, 3.7],
  ['-', 'r', 38.6, 92, 22.8, 6.6, 3.3],
  ...both('quads', 't', 42.4, 100.5, 147, 14.4, 10.5, -0.6),
  ...both('calves', 't', 41.5, 150, 187, 10.5, 6.5, -0.5),
  ...FEET,
]
const BACK: Part[] = [
  NECK,
  ...arms('triceps'),
  // the back: across the shoulders, down each side to the waist, and the small of it
  ['back', 'r', 37.6, 29, 24.8, 10, 5],
  ...both('back', 't', 42.1, 40.8, 77.5, 13.8, 9.4, 1.9),
  ['back', 'r', 41.6, 79.3, 16.8, 10.5, 5],
  ...both('glutes', 'r', 35.9, 92, 13.3, 15.4, 6.5),
  ...both('hamstrings', 't', 42.4, 109.5, 147, 13.6, 10.5, -0.6),
  ...both('calves', 't', 41.5, 150, 187, 11.6, 6.5, -0.5),
  ...FEET,
]

const n = (v: number) => +v.toFixed(2)
const taper = ([cx, y0, y1, w0, w1, lean = 0]: number[]) => {
  const a = w0 / 2
  const b = w1 / 2
  const foot = cx + lean
  return `M${n(cx - a)},${n(y0 + a)}A${a},${a} 0 0 1 ${n(cx + a)},${n(y0 + a)}L${n(foot + b)},${n(y1 - b)}A${b},${b} 0 0 1 ${n(foot - b)},${n(y1 - b)}Z`
}

/**
 * A body from the front or from behind, drawn in rounded parts, each muscle filled in the lifting lilac by how much
 * work it gets against the most worked. One with none is left graphite, so what a plan leaves out shows as a gap.
 */
export function MuscleFigure({ side, sets, className = '' }: { side: 'front' | 'back'; sets: Partial<Record<Muscle, number>>; className?: string }) {
  const most = Math.max(0, ...Object.values(sets))
  const fill = (m: Muscle | '-') => {
    if (m === '-') return 'rgb(var(--ink-2))'
    const v = sets[m] ?? 0
    return v > 0 && most > 0 ? `rgb(var(--strength) / ${(0.18 + 0.82 * (v / most) ** 1.3).toFixed(2)})` : 'rgb(var(--ink-3))'
  }
  return (
    <svg viewBox="0 0 100 196" role="img" aria-label={side === 'front' ? 'From the front' : 'From behind'} className={className}>
      <ellipse cx={50} cy={10.3} rx={8.3} ry={9.8} fill="rgb(var(--ink-2))" />
      {(side === 'front' ? FRONT : BACK).map(([m, kind, ...v], i) =>
        kind === 'r' ? <rect key={i} x={v[0]} y={v[1]} width={v[2]} height={v[3]} rx={v[4]} fill={fill(m)} /> : <path key={i} d={taper(v)} fill={fill(m)} />,
      )}
    </svg>
  )
}
