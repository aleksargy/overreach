// Folds the VITE_PREVIEW build into one self-contained HTML file for a
// claude.ai Artifact: no doctype/html/head/body (the host wraps the page),
// the <title> first, and every script, style and font inlined.
//   npm run build:preview  ->  dist-preview/preview.html
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist-preview'
const out = process.argv[2] ?? join(dir, 'preview.html')
const html = readFileSync(join(dir, 'index.html'), 'utf8')

const pick = (re, what) => {
  const m = html.match(re)
  if (!m) throw new Error(`No ${what} in ${dir}/index.html`)
  return readFileSync(join(dir, m[1].replace(/^\.?\//, '')), 'utf8')
}
const js = pick(/<script[^>]*src="([^"]+\.js)"[^>]*><\/script>/, 'script')
const css = pick(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/, 'stylesheet')
const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? 'Preview'
// every browser that can open the artifact reads woff2, so drop the woff copies
const slimCss = css.replace(/,\s*url\(data:font\/woff;base64,[^)]*\)\s*format\(["']?woff["']?\)/g, '')

// anything still pointing at a file would 404 inside the artifact
const leftovers = [...slimCss.replace(/url\((["'])data:.*?\1\)|url\(data:[^)]*\)/g, '').matchAll(/url\(([^)]+)\)/g)].map((m) => m[1])
if (leftovers.length) throw new Error(`Unresolved CSS urls: ${leftovers.join(', ')}`)

// a literal "</script" inside the bundle would end the inline script early
const safeJs = js.replace(/<\/script/gi, '<\\/script')
if (/<!--/.test(safeJs)) console.warn('warning: bundle contains "<!--"; check the inline script parses')

const page = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#08090c">
<style>${slimCss}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`
writeFileSync(out, page)
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`)
