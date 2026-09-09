// Two ways to move a wide table (.table-scroll) sideways with a plain mouse,
// because the only built-in way is to travel to the scrollbar at the very
// bottom of the table, and shift+wheel — which already worked — is a shortcut
// nobody finds.
//
//   1. Wheel: a plain vertical wheel scrolls the table sideways while the
//      pointer is over it, and hands the gesture back to the page the moment
//      the table has nothing left to give, so the page never feels trapped.
//   2. Drag: grab the table anywhere that isn't a control and pull it. The
//      cursor turns into a hand over any table that can actually move, which
//      is the part that makes it discoverable — a wheel behaviour is
//      invisible until you try it.
//
// Delegated listeners on the window cover every .table-scroll, including ones
// added later. React's onWheel is registered passive and so cannot call
// preventDefault, hence addEventListener here.

const LINE_HEIGHT = 16 // px per "line" when deltaMode is DOM_DELTA_LINE

export function installTableScrolling() {
  if (typeof window === 'undefined') return () => {}

  const onWheel = (event) => {
    // Leave the browser's own gestures alone.
    if (event.ctrlKey || event.metaKey) return // pinch / zoom
    if (event.shiftKey) return // already the native horizontal gesture
    if (event.defaultPrevented) return
    // A trackpad already swiping sideways needs no help.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    if (!event.deltaY) return

    const target = event.target
    const el = target instanceof Element ? target.closest('.table-scroll') : null
    if (!el) return

    const max = el.scrollWidth - el.clientWidth
    if (max <= 1) return // table fits; nothing to scroll

    const step =
      event.deltaMode === 1
        ? event.deltaY * LINE_HEIGHT
        : event.deltaMode === 2
          ? event.deltaY * el.clientWidth
          : event.deltaY

    // Nothing left to give in the direction of travel — hand the wheel to the
    // page so hovering a fully-scrolled table never traps it. Browsers clamp
    // scrollLeft to fractional device pixels, so this needs a 1px slack rather
    // than an exact comparison, or the last half-pixel keeps swallowing events.
    const remaining = step > 0 ? max - el.scrollLeft : el.scrollLeft
    if (remaining <= 1) return

    el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + step))
    event.preventDefault()
  }

  // ---- drag to pan ----

  // Below this, the pointer moved but the person meant to click. Job rows
  // navigate on click and every capacity cell is an input, so starting a pan
  // on the first stray pixel would make the tables feel broken.
  const DRAG_THRESHOLD = 4
  // Controls handle their own pointer gestures — dragging from inside a
  // number field should select its text, not pan the table behind it.
  //
  // Deliberately does NOT include [role="button"]. Job rows carry that role
  // so they are keyboard-operable (JobTable.jsx), which meant excluding it
  // switched panning off across the entire job directory — the very table
  // most worth dragging. Rows are safe to drag from: a pan needs 4px of
  // travel, and the click that ends one is swallowed below.
  const CONTROL = 'input, textarea, select, button, a'

  let drag = null

  const scrollerFor = (target) =>
    target instanceof Element ? target.closest('.table-scroll') : null

  const canScroll = (el) => el && el.scrollWidth - el.clientWidth > 1

  const onPointerDown = (event) => {
    // Left button only, and never a synthetic or touch pointer: touch already
    // pans natively, and hijacking it would fight the browser's own inertia.
    if (event.button !== 0 || event.pointerType !== 'mouse') return
    const el = scrollerFor(event.target)
    if (!canScroll(el)) return
    if (event.target.closest(CONTROL)) return

    drag = { el, startX: event.clientX, startScroll: el.scrollLeft, panning: false }
  }

  const onPointerMove = (event) => {
    if (!drag) return
    const dx = event.clientX - drag.startX
    if (!drag.panning) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      drag.panning = true
      drag.el.style.cursor = 'grabbing'
      // Without this the browser starts a text selection as soon as the
      // pointer moves, and the whole table highlights blue as you drag.
      drag.el.style.userSelect = 'none'
    }
    drag.el.scrollLeft = drag.startScroll - dx
    event.preventDefault()
  }

  const endDrag = () => {
    if (!drag) return
    const { el, panning } = drag
    el.style.cursor = canScroll(el) ? 'grab' : ''
    el.style.userSelect = ''
    drag = null
    if (!panning) return
    // A pan ends with a click event on whatever is under the pointer. Left
    // alone that opens whichever job row you happened to finish on, so that
    // click is swallowed in the capture phase before any handler sees it.
    //
    // Scoped to this table and torn down on the next tick, both deliberately.
    // Armed on the window and left to expire on `once`, it waits for *any*
    // click — so a drag followed by a click on the sidebar ate the sidebar
    // click instead, and the page just didn't navigate. The click that ends a
    // drag is dispatched in the same task sequence as the pointerup, so a
    // zero-delay timeout is always late enough to catch it and early enough
    // to catch nothing else.
    const swallow = (e) => {
      e.stopPropagation()
      e.preventDefault()
    }
    el.addEventListener('click', swallow, { capture: true })
    setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0)
  }

  // The affordance. Set on hover rather than in CSS because a table only
  // deserves a grab cursor while it actually has somewhere to go, and that
  // changes with the window width and with what's in it.
  const onPointerOver = (event) => {
    const el = scrollerFor(event.target)
    if (!el || drag) return
    el.style.cursor = canScroll(el) ? 'grab' : ''
  }

  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  window.addEventListener('pointerover', onPointerOver)

  return () => {
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
    window.removeEventListener('pointerover', onPointerOver)
  }
}
