/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
// a tab's set: the colour, its tint, the label colour on the tint and the headline colour on it (bg-run-tint, text-run-head)
const set = (name) => ({ DEFAULT: v(name), tint: v(`${name}-tint`), label: v(`${name}-label`), head: v(`${name}-head`) })

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 0: v('ink-0'), 1: v('ink-1'), 2: v('ink-2'), 3: v('ink-3') },
        line: { 2: v('line-2') },
        fg: { DEFAULT: v('fg'), 2: v('fg-2'), 3: v('fg-3'), 4: v('fg-4') },
        z1: v('z1'),
        z2: v('z2'),
        z3: v('z3'),
        z4: v('z4'),
        z5: v('z5'),
        football: set('football'),
        run: set('run'),
        body: set('body'),
        strength: set('strength'),
        gold: { ...set('gold'), read: v('gold-read'), quiet: v('gold-quiet') },
        ride: v('ride'),
        swim: v('swim'),
        other: v('other'),
        good: v('good'),
        warn: v('warn'),
        bad: v('bad'),
      },
      fontFamily: {
        // everything that isn't big: labels, reading, buttons, pills, and chart labels (font-mono)
        sans: ['"Manrope Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"Manrope Variable"', 'system-ui', 'sans-serif'],
        // anything big: titles, hero numbers and words, numbers on tiles, the match headline and the card
        display: ['"Bricolage Grotesque Variable"', '"Manrope Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { tile: '22px', hero: '26px', sheet: '26px' },
      maxWidth: { app: '520px' },
      transitionTimingFunction: { snap: 'cubic-bezier(.2,.8,.2,1)' },
    },
  },
  plugins: [],
}
