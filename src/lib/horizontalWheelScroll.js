// Wide tables (.table-scroll) go sideways, but a mouse has no two-finger swipe,
// so the only way to reach the right-hand columns was to travel to the scrollbar
// at the very bottom of the table. Shift + wheel worked already; nobody finds it.
//
// This turns a plain vertical wheel into horizontal scrolling while the pointer
// is over a scrollable table, and hands the gesture straight back to the page as
// soon as the table has nothing left to give — so the page never feels trapped.
//
// One delegated, non-passive listener on the window covers every .table-scroll
// container, including any added later. React's onWheel is registered passive,
// which cannot call preventDefault, hence addEventListener here.

const LINE_HEIGHT = 16 // px per "line" when deltaMode is DOM_DELTA_LINE

export function installHorizontalWheelScroll() {
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

  window.addEventListener('wheel', onWheel, { passive: false })
  return () => window.removeEventListener('wheel', onWheel)
}
