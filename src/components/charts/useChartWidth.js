import { useLayoutEffect, useRef, useState } from 'react'

// SVG charts need a real pixel width to lay out. A viewBox with
// preserveAspectRatio would scale to fit, but it scales the text with it, so
// axis labels end up a different size on every screen. Measuring the container
// and rendering at that width keeps type at its intended size.
//
// Measured synchronously in a layout effect first, then kept in step with a
// ResizeObserver. The initial measurement is not redundant: an observer only
// tells you about the *next* size, so on its own the chart paints once at the
// fallback width and corrects a frame later — visible as a jump, and wrong
// altogether anywhere observer callbacks are throttled (a background tab, a
// hidden pane, a screenshot pass).
export function useChartWidth(fallback = 640) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = (next) => {
      const rounded = Math.round(next)
      if (rounded > 0) setWidth((prev) => (prev === rounded ? prev : rounded))
    }

    measure(el.getBoundingClientRect().width)

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
