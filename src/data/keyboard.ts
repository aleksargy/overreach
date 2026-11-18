// The iPhone's keyboard covers the page rather than shrinking it: the layout stays a
// screen tall, only the visual viewport gets shorter, and iOS may slide the page to
// show the field you tapped. So sheets and the logger are layers (`.layer` in
// index.css) pinned to what you can see: while you type they end where the keyboard
// starts and follow any slide. This keeps `--vv-top` and `--vv-h` on <html> up to
// date, sets `data-kb` while the keyboard is up, and brings the field you're in into
// view inside its layer without moving the page.

/** input types that bring up a picker or nothing, rather than a keyboard */
const NO_KEYBOARD = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'image', 'button', 'submit', 'reset', 'date', 'time', 'datetime-local', 'month', 'week'])

export const typesInto = (el: EventTarget | null): el is HTMLElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NO_KEYBOARD.has(el.type)) || (el instanceof HTMLElement && el.isContentEditable)

/** the keyboard counts as up once it hides this much of the screen */
const KEYBOARD_PX = 120
/** room left above and below the field you're in */
const ROOM = 24

let up = false

function setUp(next: boolean) {
  if (next === up) return
  up = next
  document.documentElement.toggleAttribute('data-kb', up)
  if (up) reveal()
}

function measure() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
  root.style.setProperty('--vv-h', `${vv.height}px`)
  // pinch-zooming shrinks the visual viewport too; at its natural scale only a keyboard does
  setUp(typesInto(document.activeElement) && root.clientHeight - vv.height * vv.scale > KEYBOARD_PX)
}

/** The field's nearest scrolling box inside its layer. */
function scroller(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p && !p.classList.contains('layer'); p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/** Bring the field you're in into view inside its layer, clear of the keyboard, once the layer has its new height. */
function reveal() {
  requestAnimationFrame(() => {
    const el = document.activeElement
    if (!typesInto(el) || !el.closest('.layer')) return
    const box = scroller(el)
    if (!box) return
    const vv = window.visualViewport
    const b = box.getBoundingClientRect()
    // only the part of the box you can see counts, whether or not its layer has caught up yet
    const top = vv ? Math.max(b.top, vv.offsetTop) : b.top
    const bottom = vv ? Math.min(b.bottom, vv.offsetTop + vv.height) : b.bottom
    const r = el.getBoundingClientRect()
    const shift = r.top < top + ROOM ? r.top - top - ROOM : r.bottom > bottom - ROOM ? r.bottom - bottom + ROOM : 0
    if (shift) box.scrollBy({ top: shift, behavior: 'smooth' })
  })
}

export function watchKeyboard() {
  const vv = window.visualViewport
  if (!vv) return
  measure()
  vv.addEventListener('resize', measure)
  vv.addEventListener('scroll', measure)
  addEventListener('resize', measure)
  document.addEventListener('focusin', (e) => {
    if (!typesInto(e.target)) return
    // moving between fields with the keyboard already up: just bring this one into view
    if (up) reveal()
    else measure()
  })
  document.addEventListener('focusout', (e) => {
    const to = e.relatedTarget
    if (typesInto(to)) {
      // on to another field in a sheet or the logger with the keyboard up: focus it first, without iOS
      // sliding the page to it, and bring it into view ourselves
      if (up && to.closest('.layer')) to.focus({ preventScroll: true })
      return
    }
    // the keyboard's going: let the layers drop with it, since iOS only says so once it's gone
    setTimeout(() => !typesInto(document.activeElement) && setUp(false))
  })
}
