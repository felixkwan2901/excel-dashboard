import { useEffect, useRef, useState } from 'react'

// Counts up from 0 to `value` once on mount. Formats with `format` if given
// (e.g. currency), otherwise plain toLocaleString.
export default function AnimatedNumber({ value, duration = 700, format }) {
  const [display, setDisplay] = useState(0)
  const frame = useRef(null)

  useEffect(() => {
    const start = performance.now()
    const from = 0
    const to = value

    function tick(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setDisplay(Math.round(from + (to - from) * eased))
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <>{format ? format(display) : display.toLocaleString()}</>
}
