// Screenshots of every screen at 390 × 844, to check a UI change the way it looks on
// the phone, in three modes: sample (the Demo switch on), live on the fake Garmin,
// and blank (a first visit with no Garmin: only what you log). Runs its own Vite and
// fake API on spare ports, so it can run next to `npm run dev`.
//   npm run screens                      every screen, all three modes
//   npm run screens -- settings run      just those screens
//   npm run screens -- --live            one mode (or --sample, --blank)
//   npm run screens -- --race            with "Training for a race" on: a marathon two weeks out, goal 3:30
//   npm run screens -- --bar             the first screenful only, with the tab bar left in
//   npm run screens -- --webkit          in Safari's engine, into screens/<mode>-webkit (once: npx playwright install webkit)
//   npm run screens -- --phone           as Alex's iPhone 16 Pro shows it, into screens/<mode>-phone: 402 × 874, a screenful
//                                        with the tab bar, the status bar, the frost iOS puts under it and the home indicator
// A stand-in keyboard comes up whenever a field has focus, the way iOS reports it: the visual viewport
// ends where it starts (the …-typing and lift-search shots).
// Writes screens/<mode>/<screen>.png. Needs Chromium once: npx playwright install chromium
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer as listen } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit } from 'playwright'
import { createServer } from 'vite'

/** A port nothing is using, so two runs (or a run next to `npm run dev`) never collide. */
const sparePort = () =>
  new Promise((resolve, reject) => {
    const s = listen().once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
const API = await sparePort()
const WEB = await sparePort()
const base = `http://127.0.0.1:${WEB}`
const args = process.argv.slice(2)
const picked = ['sample', 'live', 'blank'].filter((m) => args.includes(`--${m}`))
const modes = picked.length ? picked : ['sample', 'live', 'blank']
const race = args.includes('--race')
// Alex's phone: its screen, its status bar and home indicator, and the band under the status bar that iOS frosts
const phone = args.includes('--phone') && { width: 402, height: 874, top: 62, bottom: 34, frost: 30 }
const bar = args.includes('--bar') || !!phone
// the app lives on an iPhone home screen, so Safari's engine is the one that counts when something looks off
const safari = args.includes('--webkit')
const dirOf = (mode) => join('screens', [mode, safari && 'webkit', phone && 'phone'].filter(Boolean).join('-'))
const only = args.filter((a) => !a.startsWith('--'))

const SCREENS = [
  ['today', '/'],
  ['run', '/run'],
  ['football', '/football'],
  ['lift', '/lift'],
  ['body', '/body'],
  ['feed', '/feed'],
  ['settings', '/settings'],
  // the first ones listed, found on their screens
  ['activity', { from: '/feed', link: 'a[href^="/activity/"]' }],
  // the latest run's page, where its ghosts are offered
  ['run-activity', { from: '/run', link: 'a[href^="/activity/"]' }],
  ['match', { from: '/football', link: 'a[href^="/match/"]' }],
  // the latest game played back for a few seconds, then paused: the dot and the trail behind it
  [
    'match-replay',
    {
      from: '/football',
      async sheet(page) {
        const game = page.locator('a[href^="/match/"]').first()
        if (!(await game.count())) return false
        await game.click()
        await page.waitForTimeout(900)
        const play = page.getByRole('button', { name: 'Play', exact: true })
        if (!(await play.count())) return false
        await play.scrollIntoViewIfNeeded()
        await play.click()
        await page.waitForTimeout(2500)
        await page.getByRole('button', { name: 'Pause', exact: true }).click()
        await page.getByText('Replay', { exact: true }).evaluate((el) => el.closest('section')?.scrollIntoView({ block: 'center' }))
        await page.waitForTimeout(300)
      },
    },
  ],
  // the first game you faded in, at its halves and the fade on its intensity chart (live mode on the fake has no matches)
  [
    'match-fade',
    {
      from: '/football',
      async sheet(page) {
        for (const href of await page.locator('a[href^="/match/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
          await page.goto(base + href)
          await page.waitForTimeout(900)
          if (await page.getByText(/^Fade \d+/).count()) {
            await page.getByText('Intensity', { exact: true }).evaluate((el) => el.closest('section')?.scrollIntoView({ block: 'end' }))
            return true
          }
        }
        return false
      },
    },
  ],
  ['race', { from: '/run', link: 'a[href^="/race/"]' }],
  // the latest run's ghosts, found from its page
  ['ghost', { from: '/run', link: ['a[href^="/activity/"]', 'a[href^="/ghost/"]'] }],
  // the latest long run's: it shares its first 8 km with the 8 km runs, so there's a stretch to pick
  ['ghost-stretch', { from: '/feed', link: ['a[href^="/activity/"]:has-text("Long run")', 'a[href^="/ghost/"]'] }],
  // the same run on its next stretch, picked from the options above it
  [
    'ghost-stretch-2',
    {
      from: '/feed',
      async sheet(page) {
        // with nothing synced and Demo off there's no long run to open
        if (!(await page.locator('a[href^="/activity/"]:has-text("Long run")').count())) return false
        await page.locator('a[href^="/activity/"]:has-text("Long run")').first().click()
        await page.waitForTimeout(600)
        await page.locator('a[href^="/ghost/"]').first().click()
        await page.waitForTimeout(900)
        const next = page.locator('button:has-text(" km, ")').nth(1)
        if (await next.count()) await next.click()
      },
    },
  ],
  // the log sheet with a few notes added, scrolled to them
  [
    'log',
    {
      from: '/football',
      async sheet(page) {
        await page.getByRole('button', { name: 'Log a match' }).click()
        await page.waitForTimeout(500)
        const add = page.getByRole('button', { name: 'Add', exact: true })
        await add.first().click()
        await page.keyboard.type('Won every header')
        await page.keyboard.press('Enter')
        await add.last().click()
        await page.keyboard.type('Lost my man at corners')
        await page.keyboard.press('Enter')
        await page.getByText('How it went').click()
        await page.getByRole('button', { name: /^Won every header/ }).click()
        await page.getByText('How it went').scrollIntoViewIfNeeded()
      },
    },
  ],
  // lifting, in the order you'd meet it: make a workout (the picker open on its second exercise), look at it,
  // edit it, log it, finish it, and then what that leaves behind. Live mode starts with no workouts at all.
  [
    'lift-new',
    {
      from: '/lift',
      async sheet(page) {
        await makeWorkout(page)
        await page.getByPlaceholder('Search').fill('')
        await blur(page)
      },
    },
  ],
  // searching the picker with the keyboard up: the sheet sits on the keyboard, the search where it was
  [
    'lift-search',
    {
      from: '/lift',
      async sheet(page) {
        await makeWorkout(page)
        await page.getByPlaceholder('Search').fill('Incline')
        await page.waitForTimeout(300)
      },
    },
  ],
  ['lift-workout', { from: '/lift', link: 'a[href^="/lift/workout/"]' }],
  // the workout made above, its two exercises linked as a superset
  [
    'lift-edit',
    {
      from: '/lift',
      async sheet(page) {
        const upper = page.locator('a[href^="/lift/workout/"]:has-text("Upper A")').first()
        // taken on its own, it makes the workout first
        if (!(await upper.count())) {
          await makeWorkout(page)
          await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
          await page.goto(`${base}/lift`)
          await page.waitForTimeout(700)
        }
        await upper.click()
        await page.waitForTimeout(600)
        await page.getByRole('button', { name: 'Edit workout' }).click()
        await page.waitForTimeout(300)
        const link = page.getByRole('button', { name: 'Superset Bench Press with the next exercise' })
        if ((await link.getAttribute('aria-pressed')) !== 'true') await link.click()
        await blur(page)
      },
    },
  ],
  // bench as a reverse pyramid, from its page
  [
    'exercise-pyramid',
    {
      from: '/lift/exercise/bench-press',
      async sheet(page) {
        await page.getByRole('button', { name: 'Edit exercise' }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: 'Reverse pyramid' }).click()
        await page.getByRole('button', { name: 'Reverse pyramid' }).scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
      },
      async after(page) {
        await page.getByRole('button', { name: 'Save changes' }).click()
        await page.waitForTimeout(400)
      },
    },
  ],
  // the logger a few sets in
  ['lift-log', { from: '/lift', sheet: openWorkout }],
  // a drop set after the last bench set, ticked
  [
    'lift-log-drop',
    {
      from: '/lift',
      async sheet(page) {
        await openWorkout(page)
        await page.getByRole('button', { name: 'Drop', exact: true }).first().click()
        await page.waitForTimeout(200)
        const tick = page.getByRole('button', { name: 'Mark set done' })
        await tick.first().click()
        await page.waitForTimeout(150)
        await tick.first().click()
        await page.waitForTimeout(300)
      },
    },
  ],
  // typing reps into the third set: the logger ends at the keyboard and the set stays in view
  [
    'lift-log-typing',
    {
      from: '/lift',
      async sheet(page) {
        await openWorkout(page)
        await page.getByLabel('Reps').nth(2).click()
        await page.waitForTimeout(500)
      },
    },
  ],
  [
    'lift-finish',
    {
      from: '/lift',
      async sheet(page) {
        await openWorkout(page)
        await page.getByRole('button', { name: 'Finish', exact: true }).click()
        await page.waitForTimeout(500)
      },
    },
  ],
  [
    'lift-saved',
    {
      from: '/lift',
      async sheet(page) {
        await openWorkout(page)
        await page.getByRole('button', { name: 'Finish', exact: true }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: 'Save workout' }).click()
        await page.waitForTimeout(1300)
      },
    },
  ],
  // lifts on one belt, logged a round at a time: the sample lifter's pull-ups and dips with the first round ticked
  [
    'lift-log-belt',
    {
      from: '/lift/workout/calisthenics',
      async sheet(page) {
        const start = page.getByRole('button', { name: 'Start', exact: true })
        // only the sample lifter does them in turns
        if (!(await start.count())) return false
        await start.click()
        await page.waitForTimeout(700)
        const ticks = page.getByRole('button', { name: 'Mark set done' })
        await ticks.first().click()
        await page.waitForTimeout(200)
        await ticks.first().click()
        await page.waitForTimeout(400)
      },
      // and binned, so the shots after it find no workout running
      async after(page) {
        await page.getByRole('button', { name: 'Finish', exact: true }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: 'Discard workout' }).click()
        await page.getByRole('button', { name: 'Tap again to discard' }).click()
        await page.waitForTimeout(500)
      },
    },
  ],
  ['lift-exercise', { from: '/lift', link: 'a[href^="/lift/exercise/"]' }],
  ['lift-session', { from: '/lift', link: 'a[href^="/lift/history/"]' }],
  ['lift-history', '/lift/history'],
  // programmes: the list, the one you're on, editing it, adding workouts to it, and a new one being named
  ['lift-programmes', '/lift/programmes'],
  ['lift-programme', { from: '/lift/programmes', link: 'a[href^="/lift/programme/"]' }],
  [
    'lift-programme-edit',
    {
      from: '/lift/programmes',
      async sheet(page) {
        const first = page.locator('a[href^="/lift/programme/"]').first()
        if (!(await first.count())) return false
        await first.click()
        await page.waitForTimeout(600)
        await page.getByRole('button', { name: 'Edit programme' }).click()
        await page.waitForTimeout(400)
      },
    },
  ],
  // goals for the programme you're on: the sheet as first suggested, then the page once they're saved
  [
    'lift-goals',
    {
      from: '/lift/programmes',
      async sheet(page) {
        const first = page.locator('a[href^="/lift/programme/"]').first()
        if (!(await first.count())) return false
        await first.click()
        await page.waitForTimeout(600)
        const set = page.getByRole('button', { name: 'Set goals' })
        await ((await set.count()) ? set : page.getByRole('button', { name: 'Edit', exact: true })).click()
        await page.waitForTimeout(500)
      },
    },
  ],
  [
    'lift-programme-goals',
    {
      from: '/lift/programmes',
      async sheet(page) {
        const first = page.locator('a[href^="/lift/programme/"]').first()
        if (!(await first.count())) return false
        await first.click()
        await page.waitForTimeout(600)
        const set = page.getByRole('button', { name: 'Set goals' })
        if (await set.count()) {
          await set.click()
          await page.waitForTimeout(500)
          await page.getByRole('button', { name: 'Save goals' }).click()
          await page.waitForTimeout(500)
        }
      },
    },
  ],
  [
    'lift-programme-add',
    {
      from: '/lift/programmes',
      async sheet(page) {
        await page.getByRole('button', { name: 'New programme' }).first().click()
        await page.waitForTimeout(500)
        await page.keyboard.type('Full body')
        await blur(page)
        await page.getByRole('button', { name: 'Add workouts' }).click()
        await page.waitForTimeout(500)
      },
    },
  ],
  // a programme of two of your workouts made and started: the Lift tab it leads back to (stopped again afterwards,
  // so the shots after it see the programme they would have)
  [
    'lift-programme-started',
    {
      from: '/lift/programmes',
      async sheet(page) {
        await page.getByRole('button', { name: 'New programme' }).first().click()
        await page.waitForTimeout(500)
        await page.keyboard.type('Full body')
        await blur(page)
        await page.getByRole('button', { name: 'Add workouts' }).click()
        await page.waitForTimeout(500)
        // the workouts listed in the sheet, under New workout
        const rows = page.getByRole('dialog').locator('button.border-b')
        if (!(await rows.count())) return false
        for (let i = 0; i < Math.min(2, await rows.count()); i++) await rows.nth(i).click()
        await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
        await page.waitForTimeout(600)
        // the editor's Done, at the top (the sheet's may still be on its way out)
        await page.getByRole('button', { name: 'Done' }).first().click()
        await page.waitForTimeout(300)
        await page.getByRole('button', { name: 'Start programme' }).click()
        await page.waitForTimeout(900)
      },
      async after(page) {
        await page.goto(`${base}/lift/programmes`)
        await page.waitForTimeout(700)
        await page.locator('a[href^="/lift/programme/"]').first().click()
        await page.waitForTimeout(600)
        await page.getByRole('button', { name: 'Stop programme' }).click()
        await page.getByRole('button', { name: 'Tap again to stop it' }).click()
        await page.waitForTimeout(300)
      },
    },
  ],
  [
    'lift-programme-new',
    {
      from: '/lift/programmes',
      async sheet(page) {
        await page.getByRole('button', { name: 'New programme' }).first().click()
        await page.waitForTimeout(500)
        await page.keyboard.type('Full body')
        await blur(page)
        await page.waitForTimeout(300)
      },
    },
  ],
  // the + on Today, the weigh-in, and a new exercise of your own
  [
    'log-sheet',
    {
      from: '/',
      async sheet(page) {
        await page.getByRole('button', { name: 'Log something' }).click()
      },
    },
  ],
  [
    'weigh-in',
    {
      from: '/body',
      async sheet(page) {
        await page.getByRole('button', { name: 'Weigh in' }).first().click()
      },
    },
  ],
  [
    'exercise-sheet',
    {
      from: '/lift/exercises',
      async sheet(page) {
        await page.getByRole('button', { name: 'New exercise' }).click()
        await page.waitForTimeout(500)
        await blur(page)
      },
    },
  ],
  // the same as it opens, with its name ready to type and the keyboard up
  [
    'exercise-typing',
    {
      from: '/lift/exercises',
      async sheet(page) {
        await page.getByRole('button', { name: 'New exercise' }).click()
        await page.waitForTimeout(500)
        await page.keyboard.type('Landmine press')
      },
    },
  ],
  // someone who only lifts: Run and Football hidden in Settings, then Today as it leaves it (put back afterwards)
  [
    'tabs',
    {
      from: '/settings',
      async sheet(page) {
        for (const name of ['Run', 'Football']) await page.getByRole('switch', { name, exact: true }).click()
        await page.goto(`${base}/`)
        await page.waitForTimeout(700)
      },
      async after(page) {
        await page.goto(`${base}/settings`)
        for (const name of ['Run', 'Football']) await page.getByRole('switch', { name, exact: true }).click()
      },
    },
  ],
  // how it works, from the ⓘ in Settings, and with what to lift and the match numbers open
  ['help', '/help'],
  ['help-lift', '/help#lift'],
  ['help-programme', '/help#programme'],
  ['help-football', '/help#football'],
  // a match logged from scratch and rated: the number counting up on the gold tile. Last, since it saves a match.
  [
    'reveal',
    {
      from: '/football',
      async sheet(page) {
        await page.getByRole('button', { name: 'Log a match' }).click()
        await page.waitForTimeout(500)
        await page.getByLabel('Opponent').fill('Ajax Trays')
        await page.getByRole('button', { name: 'Rate my game' }).click()
        await page.waitForTimeout(2600)
      },
    },
  ],
].filter(([name]) => !only.length || only.includes(name))

/** Put the keyboard away. */
async function blur(page) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.waitForTimeout(300)
}

/** A workout of your own, made the way you would: named, with two exercises. Leaves you on its editor. */
async function makeWorkout(page) {
  await page.goto(`${base}/lift`)
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'New workout' }).first().click()
  await page.waitForTimeout(500)
  await page.keyboard.type('Upper A')
  // the picker stays open while a workout is being built, so both go in at one sitting
  await page.getByRole('button', { name: 'Add exercises' }).click()
  await page.waitForTimeout(450)
  for (const name of ['Bench Press', 'Barbell Row']) {
    await page.getByPlaceholder('Search').fill(name)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .first()
      .click()
    await page.waitForTimeout(250)
  }
}

/** Into the logger: back to the workout that's running, or the next one started with its first two sets ticked. */
async function openWorkout(page) {
  const carry = page.getByRole('button', { name: 'Carry on' })
  if (await carry.count()) {
    await carry.click()
    await page.waitForTimeout(500)
    return
  }
  const start = page.getByRole('button', { name: 'Start workout', exact: true })
  // nothing to start yet: a first visit begins with making a workout
  if (!(await start.count())) {
    await makeWorkout(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
    await page.waitForTimeout(400)
    await page.goto(`${base}/lift`)
    await page.waitForTimeout(700)
  }
  await start.click()
  await page.waitForTimeout(700)
  // a first go at a lift has no weight to tick off yet, so one goes in by hand
  const kg = page.getByLabel('Weight in kg').first()
  if ((await kg.count()) && !(await kg.getAttribute('placeholder'))) await kg.fill('40')
  const ticks = page.getByRole('button', { name: 'Mark set done' })
  await ticks.first().click()
  await page.waitForTimeout(200)
  await ticks.first().click()
  await page.waitForTimeout(400)
}

const blobs = mkdtempSync(join(tmpdir(), 'overreach-screens-'))
const api = spawn(process.execPath, ['--import', 'jiti/register', 'scripts/dev-api.ts', '--port', String(API), '--blobs', blobs], { stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((resolve, reject) => {
  api.stdout.on('data', (d) => String(d).includes('API on') && resolve())
  api.on('exit', (code) => reject(new Error(`the fake API stopped (${code})`)))
})
const vite = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: WEB, strictPort: true, proxy: { '/api': `http://127.0.0.1:${API}` } } })
await vite.listen()
const browser = await (safari ? webkit : chromium).launch()

try {
  for (const mode of modes) {
    // a fresh profile each time: sample data until it syncs
    const viewport = phone ? { width: phone.width, height: phone.height } : { width: 390, height: 844 }
    const context = await browser.newContext({ viewport, deviceScaleFactor: phone ? 3 : 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
    const page = await context.newPage()
    // a stand-in for the iPhone's keyboard: while a field you type into has focus, the visual viewport ends
    // where the keyboard starts, as iOS reports it, and a keyboard sits over the foot of the screen
    await page.addInitScript((kb) => {
      const real = window.visualViewport
      if (!real) return
      let up = false
      const fake = new EventTarget()
      for (const k of ['width', 'scale', 'offsetLeft', 'pageLeft', 'pageTop']) Object.defineProperty(fake, k, { get: () => real[k] })
      Object.defineProperty(fake, 'offsetTop', { get: () => 0 })
      Object.defineProperty(fake, 'height', { get: () => real.height - (up ? kb : 0) })
      Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true })
      const typing = (el) => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'date', 'file', 'button'].includes(el.type))
      const key = (style) => `<span style="height: 42px; border-radius: 8px; background: #4b4b50; ${style}"></span>`
      const row = (keys, pad = 3) => `<div style="display: flex; gap: 6px; padding: 0 ${pad}px; margin-top: 11px">${keys.join('')}</div>`
      const board = document.createElement('div')
      board.style.cssText = `position: fixed; inset: auto 0 0; height: ${kb}px; z-index: 2147483646; pointer-events: none; display: none; border-radius: 28px 28px 0 0; background: #232326`
      board.innerHTML =
        '<div style="height: 46px; margin: 8px 10px 0; border-radius: 23px; background: #38383c"></div>' +
        row(Array(10).fill(key('flex: 1'))) +
        row(Array(9).fill(key('flex: 1')), 20) +
        row([key('width: 44px; background: #38383c'), ...Array(7).fill(key('flex: 1')), key('width: 44px; background: #38383c')]) +
        row([key('width: 92px; background: #38383c'), key('flex: 1'), key('width: 92px; background: #38383c')])
      const sync = () => {
        const next = typing(document.activeElement)
        if (next === up) return
        up = next
        board.style.display = up ? 'block' : 'none'
        fake.dispatchEvent(new Event('resize'))
      }
      document.addEventListener('focusin', () => setTimeout(sync))
      document.addEventListener('focusout', () => setTimeout(sync))
      addEventListener('DOMContentLoaded', () => document.body.append(board))
    }, 390)
    // the phone's insets stand in for env(), and over the page go the frost iOS draws under the status bar
    // (anything in it comes out blurred, as on the phone), the status bar and the home indicator
    if (phone)
      await page.addInitScript((p) => {
        addEventListener('DOMContentLoaded', () => {
          document.head.append(
            Object.assign(document.createElement('style'), { textContent: `:root { --safe-top: ${p.top}px !important; --safe-bottom: ${p.bottom}px !important }` }),
          )
          const over = 'position: fixed; z-index: 2147483647; pointer-events: none;'
          const frost = document.createElement('div')
          const mask = `linear-gradient(#000 ${p.top}px, transparent ${p.top + p.frost}px)`
          frost.style.cssText = `${over} inset: 0 0 auto; height: ${p.top + p.frost}px; -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); -webkit-mask-image: ${mask}; mask-image: ${mask}`
          const status = document.createElement('div')
          status.style.cssText = `${over} inset: 0 0 auto; height: 59px; display: flex; align-items: center; justify-content: space-between; padding: 0 30px 0 50px; font: 600 17px system-ui, sans-serif; color: #fff`
          status.innerHTML =
            '<span>9:41</span><span style="width: 27px; height: 13px; padding: 2px; border: 1px solid #fff8; border-radius: 4px; box-sizing: border-box"><span style="display: block; height: 100%; border-radius: 2px; background: #fff"></span></span>'
          const island = document.createElement('div')
          island.style.cssText = `${over} top: 11px; left: calc(50% - 63px); width: 126px; height: 37px; border-radius: 19px; background: #000`
          const home = document.createElement('div')
          home.style.cssText = `${over} left: calc(50% - 67px); bottom: 8px; width: 134px; height: 5px; border-radius: 3px; background: #fff`
          document.body.append(frost, status, island, home)
        })
      }, phone)
    // a full-page capture pins fixed bars mid-page, over the content; the tab bar is the same everywhere
    if (!bar)
      await page.addInitScript(() => {
        addEventListener('DOMContentLoaded', () =>
          document.head.append(Object.assign(document.createElement('style'), { textContent: 'nav[aria-label="Main"] { display: none }' })),
        )
      })
    // a fresh install starts blank: sample data is the Demo switch
    if (mode === 'sample') {
      await page.goto(`${base}/settings`)
      await page.getByRole('switch', { name: 'Sample data' }).click()
      await page.waitForTimeout(300)
    }
    if (mode === 'live') {
      await page.goto(`${base}/settings`)
      await page.getByRole('button', { name: 'Connect' }).click()
      await page.getByPlaceholder('The one you set in Netlify').fill('dev')
      await page.getByRole('button', { name: 'Sync now' }).click()
      await page
        .locator('p.meta', { hasText: /^(Done: \d+ new|Up to date)/ })
        .waitFor({ timeout: 180_000 })
        .catch(async (e) => {
          mkdirSync('screens', { recursive: true })
          await page.screenshot({ path: join('screens', 'sync-failed.png'), fullPage: true })
          throw new Error(`Sync didn't finish. The screen said: ${await page.locator('main').innerText()}`, { cause: e })
        })
    }
    if (race) {
      await page.goto(`${base}/settings`)
      await page.getByRole('switch', { name: 'Training for a race' }).click()
      await page.locator('input[type="date"]').fill(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10))
      // typed the way the number pad does it, with no colons
      await page.getByPlaceholder('3:30:00').pressSequentially('33000')
      await page.waitForTimeout(400)
    }
    mkdirSync(dirOf(mode), { recursive: true })
    for (const [name, where] of SCREENS) {
      let path = where
      if (where.sheet) {
        await page.goto(base + where.from)
        await page.waitForTimeout(900)
        // a shot can find there's nothing to show yet
        if ((await where.sheet(page)) === false) {
          console.log(`${join(dirOf(mode), name)}: nothing to open yet`)
          continue
        }
        await page.waitForTimeout(400)
        const file = join(dirOf(mode), `${name}.png`)
        await page.screenshot({ path: file })
        console.log(file)
        // anything to finish once the shot's taken, like saving a sheet
        await where.after?.(page)
        continue
      }
      if (typeof where === 'object') {
        await page.goto(base + where.from)
        // follow each link in turn: a screen that's only reached from another one
        for (const [k, sel] of [where.link].flat().entries()) {
          if (k) await page.goto(base + path)
          await page.waitForTimeout(900)
          const link = page.locator(sel).first()
          // live mode on the fake has no logged matches, so no match report yet
          if (!(await link.count())) {
            path = undefined
            break
          }
          path = await link.getAttribute('href')
        }
        if (!path) {
          console.log(`${join(dirOf(mode), name)}: nothing to open yet`)
          continue
        }
      }
      await page.goto(base + path)
      // let the springs settle and the charts draw
      await page.waitForTimeout(900)
      // once loaded, the router restores the last screen's scroll position in this tab; shots start at the top
      await page.evaluate(() => scrollTo(0, 0))
      await page.waitForTimeout(300)
      const file = join(dirOf(mode), `${name}.png`)
      await page.screenshot({ path: file, fullPage: !bar })
      console.log(file)
    }
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
  api.kill()
  rmSync(blobs, { recursive: true, force: true })
}
