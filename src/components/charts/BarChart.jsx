import { useState } from 'react'
import { barPath, niceTicks } from './chartScale'
import { useChartWidth } from './useChartWidth'
import { ChartTooltip } from './ChartCard'

const M = { top: 10, right: 8, bottom: 26, left: 52 }
const GROUP_GAP = 2 // the surface gap that keeps two bars from fusing into one
// With only three months logged, bars sized purely as a fraction of the slot
// come out ~90px wide and read as slabs — the eye starts comparing areas
// instead of heights. Capping the width keeps the mark thin however few
// categories there are; the extra space becomes whitespace, not ink.
const MAX_BAR = 44

// Vertical bars, one or two series. Two series are grouped side by side rather
// than stacked: stacking answers "what do they add up to", and the question
// here is always "how do these two compare".
export default function BarChart({
  data,
  series,
  height = 240,
  valueFormat,
  axisFormat,
  colorFor,
  emptyMessage = 'No data yet.',
}) {
  const [box, width] = useChartWidth()
  const [hover, setHover] = useState(null)

  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = height - M.top - M.bottom
  const rawMax = Math.max(0, ...data.flatMap((d) => d.values.map((v) => v ?? 0)))
  const { max, ticks } = niceTicks(rawMax)
  const yOf = (v) => M.top + plotH - (v / max) * plotH

  const groupW = data.length ? plotW / data.length : 0
  // Twelve month labels in a 240px plot is 20px each — "Sep" needs about 22,
  // so they overlap into mush on a phone. Drop every other one (then every
  // third) rather than shrinking the type: a label you can read on half the
  // bars beats an unreadable one on all of them, and the tooltip still names
  // every bar exactly.
  const labelStride = groupW >= 26 ? 1 : groupW >= 15 ? 2 : 3
  // Bars never fill their whole slot — the breathing room is what separates
  // one month from the next without needing a divider line.
  const gaps = GROUP_GAP * (series.length - 1)
  const bandW = Math.min(groupW * 0.62, MAX_BAR * series.length + gaps)
  const barW = Math.max(2, (bandW - gaps) / series.length)

  return (
    <div ref={box} className="relative w-full">
      {data.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-neutral-400">{emptyMessage}</p>
      ) : (
        <svg width={width} height={height} role="img" aria-hidden="true" style={{ display: 'block', maxWidth: '100%' }}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={yOf(t) + 4}
                textAnchor="end"
                className="fill-[var(--text-muted)] text-[11px] tabular-nums"
              >
                {axisFormat(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const groupX = M.left + i * groupW
            const startX = groupX + (groupW - bandW) / 2
            return (
              <g key={d.label}>
                {d.values.map((v, s) => {
                  const value = v ?? 0
                  const y = yOf(value)
                  return (
                    <path
                      key={series[s].name}
                      d={barPath(startX + s * (barW + GROUP_GAP), y, barW, M.top + plotH - y)}
                      fill={colorFor ? colorFor(d, s) : series[s].color}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                    />
                  )
                })}
                {(i % labelStride === 0 || hover === i) && (
                  <text
                    x={groupX + groupW / 2}
                    y={height - 8}
                    textAnchor="middle"
                    className={`text-[11px] ${hover === i ? 'fill-[var(--text-primary)]' : 'fill-[var(--text-muted)]'}`}
                  >
                    {d.label}
                  </text>
                )}
                {/* Hit target spans the full slot, not just the bars — a 12px
                    bar is a miserable thing to hover, and a zero-height one is
                    impossible. */}
                <rect
                  x={groupX}
                  y={M.top}
                  width={groupW}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            )
          })}
        </svg>
      )}

      {hover !== null && data[hover] && (
        <ChartTooltip x={M.left + (hover + 0.5) * groupW} y={M.top} width={width}>
          <p className="font-medium text-white">{data[hover].fullLabel ?? data[hover].label}</p>
          {series.map((s, i) => (
            <p key={s.name} className="mt-1 flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-[2px]"
                  style={{ background: colorFor ? colorFor(data[hover], i) : s.color }}
                />
                {s.name}
              </span>
              <span className="tabular-nums text-neutral-100">
                {data[hover].values[i] === null ? '—' : valueFormat(data[hover].values[i])}
              </span>
            </p>
          ))}
          {data[hover].note && <p className="mt-1.5 text-neutral-400">{data[hover].note}</p>}
        </ChartTooltip>
      )}
    </div>
  )
}
