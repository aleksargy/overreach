// Screenshots of every screen at 390 × 844, in sample mode and in live mode on the
// fake Garmin, to check a UI change the way it looks on the phone. Runs its own
// Vite and fake API on spare ports, so it can run next to `npm run dev`.
//   npm run screens                      every screen, both modes
//   npm run screens -- settings run      just those screens
//   npm run screens -- --live            one mode (or --sample)
//   npm run screens -- --race            with "Training for a race" on: a marathon two weeks out, goal 3:30
//   npm run screens -- --bar             the first screenful only, with the tab bar left in
//   npm run screens -- --webkit          in Safari's engine, into screens/<mode>-webkit (once: npx playwright install webkit)
// Writes screens/<mode>/<screen>.png. Needs Chromium once: npx playwright install chromium
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit } from 'playwright'
import { createServer } from 'vite'

const API = 8799
const WEB = 5199
const base = `http://127.0.0.1:${WEB}`
const args = process.argv.slice(2)
const picked = ['sample', 'live'].filter((m) => args.includes(`--${m}`))
const modes = picked.length ? picked : ['sample', 'live']
const race = args.includes('--race')
const bar = args.includes('--bar')
// the app lives on an iPhone home screen, so Safari's engine is the one that counts when something looks off
const safari = args.includes('--webkit')
const dirOf = (mode) => join('screens', safari ? `${mode}-webkit` : mode)
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
        await page.waitForTimeout(300)
      },
    },
  ],
  ['lift-workout', { from: '/lift', link: 'a[href^="/lift/workout/"]' }],
  [
    'lift-edit',
    {
      from: '/lift',
      async sheet(page) {
        await page.locator('a[href^="/lift/workout/"]').first().click()
        await page.waitForTimeout(600)
        await page.getByRole('button', { name: 'Edit workout' }).click()
      },
    },
  ],
  // the logger a few sets in, with the rest timer running
  ['lift-log', { from: '/lift', sheet: openWorkout }],
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
  ['lift-exercise', { from: '/lift', link: 'a[href^="/lift/exercise/"]' }],
  ['lift-session', { from: '/lift', link: 'a[href^="/lift/history/"]' }],
  ['lift-history', '/lift/history'],
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
      },
    },
  ],
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
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
    const page = await context.newPage()
    // a full-page capture pins fixed bars mid-page, over the content; the tab bar is the same everywhere
    if (!bar)
      await page.addInitScript(() => {
        addEventListener('DOMContentLoaded', () =>
          document.head.append(Object.assign(document.createElement('style'), { textContent: 'nav[aria-label="Main"] { display: none }' })),
        )
      })
    if (mode === 'live') {
      await page.goto(`${base}/settings`)
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
        await where.sheet(page)
        await page.waitForTimeout(400)
        const file = join(dirOf(mode), `${name}.png`)
        await page.screenshot({ path: file })
        console.log(file)
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
