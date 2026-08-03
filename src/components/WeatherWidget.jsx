import { useEffect, useState } from 'react'
import { fetchWeather } from '../lib/weatherApi'

const REFRESH_MS = 30 * 60 * 1000 // 30 minutes

const WIDGET_CLASS =
  'hidden items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-neutral-500 md:flex'

export default function WeatherWidget() {
  const [state, setState] = useState({ status: 'loading' })

  function load({ force = false } = {}) {
    fetchWeather({ force })
      .then((data) => setState({ status: 'ready', data }))
      .catch((error) => setState({ status: 'error', error }))
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load({ force: true }), REFRESH_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.status === 'loading') {
    return (
      <div className={WIDGET_CLASS} aria-hidden="true">
        <span className="h-3 w-16 animate-pulse rounded bg-white/[0.08]" />
      </div>
    )
  }

  if (state.status === 'error') return null

  const w = state.data

  return (
    <div className={WIDGET_CLASS}>
      <span className="text-sm grayscale" aria-hidden="true">
        {w.icon}
      </span>
      <span className="font-medium text-neutral-300">Christchurch</span>
      <span className="text-neutral-700">·</span>
      <span className="tabular-nums text-neutral-300">{w.tempC}°C</span>
      <span className="text-neutral-500">{w.condition}</span>
    </div>
  )
}
