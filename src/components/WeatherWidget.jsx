import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { fetchWeather } from '../lib/weatherApi'
import AnimatedNumber from './AnimatedNumber'

const REFRESH_MS = 30 * 60 * 1000 // 30 minutes

function WeatherSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#111827] p-5">
      <div className="h-9 w-9 animate-pulse rounded-lg bg-white/[0.06]" />
      <div>
        <div className="h-7 w-16 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-2 h-4 w-20 animate-pulse rounded bg-white/[0.06]" />
      </div>
    </div>
  )
}

function WeatherError({ onRetry }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#111827] p-5">
      <p className="text-sm text-neutral-400">Weather unavailable</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex w-fit items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      >
        <RefreshCw size={13} aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

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

  function retry() {
    setState({ status: 'loading' })
    load({ force: true })
  }

  if (state.status === 'loading') return <WeatherSkeleton />
  if (state.status === 'error') return <WeatherError onRetry={retry} />

  const w = state.data

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#111827] p-5"
    >
      <motion.span
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 text-xl"
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        {w.icon}
      </motion.span>
      <div>
        <p className="text-2xl font-semibold text-white tabular-nums">
          <AnimatedNumber value={w.tempC} format={(n) => `${n}°C`} />
        </p>
        <p className="mt-1 truncate text-sm text-neutral-400">{w.condition}</p>
      </div>
    </motion.div>
  )
}
