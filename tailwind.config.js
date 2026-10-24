/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 0: v('ink-0'), 1: v('ink-1'), 2: v('ink-2'), 3: v('ink-3') },
        line: { DEFAULT: v('line'), 2: v('line-2') },
        fg: { DEFAULT: v('fg'), 2: v('fg-2'), 3: v('fg-3'), 4: v('fg-4') },
        z1: v('z1'),
        z2: v('z2'),
        z3: v('z3'),
        z4: v('z4'),
        z5: v('z5'),
        run: v('run'),
        ride: v('ride'),
        swim: v('swim'),
        football: v('football'),
        strength: v('strength'),
        other: v('other'),
        good: v('good'),
        warn: v('warn'),
        bad: v('bad'),
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: { card: '18px', sheet: '28px' },
      maxWidth: { app: '520px' },
      transitionTimingFunction: { snap: 'cubic-bezier(.2,.8,.2,1)' },
    },
  },
  plugins: [],
}
