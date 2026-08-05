import { TrendingUp } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'

function clampPct(v) {
  return Math.max(0, Math.min(100, v))
}

// Same red/amber/green tiering as the Job Directory's Margin bar (which
// itself mirrors the losingMargin<0 flag) — a separate signal from the
// green/amber "on track vs quoted target" coloring below, since a margin
// can be behind its quoted target yet still be healthy overall, or ahead
// of target yet still be a thin, at-risk margin.
function healthTier(actual) {
  if (actual === null) return null
  if (actual < 0) return 'critical'
  if (actual < 0.15) return 'warning'
  return 'good'
}

const BORDER_ACCENT = {
  critical: 'border-l-red-500',
  warning: 'border-l-amber-400',
  good: 'border-l-brand-green',
}

// A compact horizontal meter replacing a plain number for the Average
// Margin card: a filled bar for the $-weighted actual margin, plus a tick
// marking where the quoted target margin sits on the same scale — so you
// can see at a glance whether the business is tracking above or below
// what was quoted, not just read two disconnected percentages.
export default function MarginMeterCard({ actual, target, simpleAvg }) {
  const hasData = actual !== null
  const actualPct = hasData ? actual * 100 : 0
  const targetPct = target !== null ? target * 100 : null

  // The bar's scale always stretches a bit past whichever of actual/target
  // is larger, so the fill and the target tick never sit flush against the
  // right edge — with a floor so a near-zero domain doesn't make the bar
  // scale wildly for tiny percentages.
  const domainMax = Math.max(actualPct, targetPct ?? 0, 10) * 1.25
  const fillWidth = clampPct((Math.max(actualPct, 0) / domainMax) * 100)
  const targetPos = targetPct !== null ? clampPct((Math.max(targetPct, 0) / domainMax) * 100) : null
  const onTrack = targetPct === null || actualPct >= targetPct
  const tier = healthTier(actual)
  const borderAccent = tier ? BORDER_ACCENT[tier] : null

  return (
    <div
      className={`relative flex min-h-[152px] w-full flex-col justify-between gap-5 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6 text-left shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-colors duration-300 hover:border-white/10 ${
        borderAccent ? `border-l-4 ${borderAccent}` : ''
      }`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.06] text-neutral-400">
        <TrendingUp size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>

      <div>
        <p className="text-[15px] font-medium text-neutral-200">Overall margin</p>

        {!hasData ? (
          <p className="mt-3 text-[13px] text-neutral-400">No margin data yet</p>
        ) : (
          <>
            <div className="mt-3 flex items-baseline justify-between">
              <span
                className={`text-[28px] leading-none font-semibold tabular-nums ${
                  onTrack ? 'text-brand-green' : 'text-amber-400'
                }`}
              >
                <AnimatedNumber value={Math.round(actualPct)} duration={500} format={(n) => `${n}%`} />
              </span>
              {targetPct !== null && (
                <span className="text-[13px] tabular-nums text-neutral-400">
                  Target {Math.round(targetPct)}%
                </span>
              )}
            </div>

            <div
              className="relative mt-2.5 h-2 w-full rounded-full bg-white/[0.08]"
              role="img"
              aria-label={`$-weighted average margin ${Math.round(actualPct)}%${
                targetPct !== null ? `, quoted target ${Math.round(targetPct)}%` : ''
              }`}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  onTrack ? 'bg-brand-green' : 'bg-amber-400'
                }`}
                style={{ width: `${fillWidth}%` }}
              />
              {targetPos !== null && (
                <div
                  className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-white/70"
                  style={{ left: `${targetPos}%` }}
                  aria-hidden="true"
                />
              )}
            </div>

            {simpleAvg !== null && (
              <p className="mt-2.5 text-[13px] tabular-nums text-neutral-400">
                Simple avg across jobs: {Math.round(simpleAvg * 100)}%
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
