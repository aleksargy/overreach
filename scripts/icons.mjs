// Renders the app icon SVG to the PNG sizes iOS and Android want.
// Run with `node scripts/icons.mjs` after changing the mark. Needs Playwright.
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// require() so a globally installed Playwright resolves too
const { chromium } = createRequire(import.meta.url)('playwright')

const Z = ['#60a5fa', '#34d399', '#f5c542', '#fb923c', '#f87171']

/** Three rank-up chevrons in easy, threshold and max colours. */
export function mark({ scale = 1, rounded = false } = {}) {
  const chevron = (y, color) => `<path d="M112 ${y + 120}L256 ${y}L400 ${y + 120}V${y + 184}L256 ${y + 64}L112 ${y + 184}Z" fill="${color}"/>`
  const t = (256 * (1 - scale)).toFixed(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><radialGradient id="bg" cx="50%" cy="34%" r="80%"><stop offset="0" stop-color="#1a1a1e"/><stop offset="1" stop-color="#08080a"/></radialGradient></defs>
<rect width="512" height="512" ${rounded ? 'rx="116"' : ''} fill="url(#bg)"/>
<g transform="translate(${t} ${t}) scale(${scale})">${chevron(260, Z[0])}${chevron(170, Z[2])}${chevron(80, Z[4])}</g>
</svg>`
}

const out = new URL('../public/', import.meta.url)
writeFileSync(new URL('favicon.svg', out), mark({ rounded: true }))

const browser = await chromium.launch()
const page = await browser.newPage()
const shots = [
  ['icons/apple-touch-icon.png', 180, mark()],
  ['icons/icon-192.png', 192, mark()],
  ['icons/icon-512.png', 512, mark()],
  // maskable icons get cropped to a circle on Android, so keep the bars inside the safe zone
  ['icons/maskable-512.png', 512, mark({ scale: 0.78 })],
]
for (const [file, size, svg] of shots) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:#08080a}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: new URL(file, out).pathname, omitBackground: false })
}
await browser.close()
console.log('icons written')
