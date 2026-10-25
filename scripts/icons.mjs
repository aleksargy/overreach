// Renders the app icon SVG to the PNG sizes iOS and Android want.
// Run with `npm run icons` after changing the mark. Needs Playwright.
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// require() so a globally installed Playwright resolves too
const { chromium } = createRequire(import.meta.url)('playwright')

const INK = '#0c0c0f'
const BALL = '#c6ff33'

/** a wobble and a speckle of grain, so the lines look chalked by hand rather than drawn */
const CHALK = `<filter id="h" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="4" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="12" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="1" seed="9" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -12 9.6" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>`

/** A chalked pitch with its halfway line and centre circle, and the ball where the touchline opens. */
export function mark({ scale = 1, rounded = false } = {}) {
  const t = (256 * (1 - scale)).toFixed(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${CHALK}</defs><rect width="512" height="512" ${rounded ? 'rx="116" ' : ''}fill="${INK}"/><g transform="translate(${t} ${t}) scale(${scale})"><g filter="url(#h)"><path d="M254 164C258 220 252 300 258 352" fill="none" stroke="#6b6b75" stroke-width="10" stroke-linecap="round"/><path d="M292 252C290 222 262 214 248 218C222 224 212 252 222 274C232 296 268 298 284 280C292 270 294 258 288 244" fill="none" stroke="#6b6b75" stroke-width="10" stroke-linecap="round"/><path d="M226 152C290 146 360 146 396 170C440 200 446 290 404 334C372 364 300 362 236 362C170 362 110 360 86 316C66 278 70 226 92 196" fill="none" stroke="#f5f5f7" stroke-width="32" stroke-linecap="round"/><circle cx="146" cy="152" r="30" fill="${BALL}"/></g></g></svg>`
}

const out = new URL('../public/', import.meta.url)
writeFileSync(new URL('favicon.svg', out), mark({ rounded: true }))

const browser = await chromium.launch()
const page = await browser.newPage()
const shots = [
  ['icons/apple-touch-icon.png', 180, mark()],
  ['icons/icon-192.png', 192, mark()],
  ['icons/icon-512.png', 512, mark()],
  // maskable icons get cropped to a circle on Android, so keep the pitch inside the safe zone
  ['icons/maskable-512.png', 512, mark({ scale: 0.78 })],
]
for (const [file, size, svg] of shots) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:${INK}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: new URL(file, out).pathname, omitBackground: false })
}
await browser.close()
console.log('icons written')
