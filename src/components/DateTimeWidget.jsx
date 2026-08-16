import { useEffect, useState } from 'react'

const WIDGET_CLASS =
  'flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs text-neutral-500 sm:px-3'

const DATE_FORMAT = new Intl.DateTimeFormat('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
const TIME_FORMAT = new Intl.DateTimeFormat('en-NZ', { hour: '2-digit', minute: '2-digit' })

export default function DateTimeWidget() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Aligned to the next minute boundary rather than a flat 60s interval,
    // so the displayed time never sits visibly behind the real clock by
    // however many seconds happened to elapse before the first tick.
    let interval
    const msToNextMinute = 60_000 - (Date.now() % 60_000)
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, msToNextMinute)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className={WIDGET_CLASS}>
      <span className="hidden font-medium text-neutral-300 sm:inline">{DATE_FORMAT.format(now)}</span>
      <span className="hidden text-neutral-700 sm:inline">·</span>
      <span className="tabular-nums text-neutral-300">{TIME_FORMAT.format(now)}</span>
    </div>
  )
}
