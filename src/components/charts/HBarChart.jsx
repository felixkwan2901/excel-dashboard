import { useState } from 'react'
import { hBarPath, niceTicks } from './chartScale'
import { useChartWidth } from './useChartWidth'
import { ChartTooltip } from './ChartCard'

const M = { top: 8, right: 12, bottom: 24 }
const ROW_H = 34
const BAR_GAP = 2

// Horizontal bars, one or two series per row. Horizontal because the category
// labels are job names — vertical bars would need them rotated, and rotated
// labels are the single most common reason a chart goes unread.
export default function HBarChart({
  rows,
  series,
  labelWidth = 150,
  valueFormat,
  axisFormat,
  emptyMessage = 'No data yet.',
}) {
  const [box, width] = useChartWidth()
  const [hover, setHover] = useState(null)

  // The label gutter is a fixed 150px on a desktop card, but that is half the
  // width of a phone — leaving a plot too short to compare anything in. Cap it
  // as a share of the chart instead, and let the names truncate.
  const gutter = Math.min(labelWidth, Math.round(width * 0.42))
  const plotW = Math.max(0, width - gutter - M.right)
  const height = M.top + rows.length * ROW_H + M.bottom
  const rawMax = Math.max(0, ...rows.flatMap((r) => r.values.map((v) => v ?? 0)))
  const { max, ticks } = niceTicks(rawMax, 3)
  const wOf = (v) => (v / max) * plotW

  const barH = (ROW_H - 10 - BAR_GAP * (series.length - 1)) / series.length

  return (
    <div ref={box} className="relative w-full">
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-neutral-400">{emptyMessage}</p>
      ) : (
        <svg width={width} height={height} role="img" aria-hidden="true" style={{ display: 'block', maxWidth: '100%' }}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={gutter + wOf(t)}
                x2={gutter + wOf(t)}
                y1={M.top}
                y2={M.top + rows.length * ROW_H}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text
                x={gutter + wOf(t)}
                y={height - 8}
                textAnchor="middle"
                className="fill-[var(--text-muted)] text-[11px] tabular-nums"
              >
                {axisFormat(t)}
              </text>
            </g>
          ))}

          {rows.map((r, i) => {
            const top = M.top + i * ROW_H + 5
            return (
              <g key={r.label}>
                <text
                  x={gutter - 10}
                  y={top + (ROW_H - 10) / 2 + 4}
                  textAnchor="end"
                  className={`text-[12px] ${hover === i ? 'fill-[var(--text-primary)]' : 'fill-[var(--text-muted)]'}`}
                >
                  {r.label}
                </text>
                {r.values.map((v, s) => (
                  <path
                    key={series[s].name}
                    d={hBarPath(gutter, top + s * (barH + BAR_GAP), wOf(v ?? 0), barH)}
                    fill={r.colors?.[s] ?? series[s].color}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                ))}
                <rect
                  x={0}
                  y={M.top + i * ROW_H}
                  width={width}
                  height={ROW_H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            )
          })}
        </svg>
      )}

      {hover !== null && rows[hover] && (
        <ChartTooltip x={width * 0.5} y={M.top + hover * ROW_H} width={width}>
          <p className="font-medium text-white">{rows[hover].fullLabel ?? rows[hover].label}</p>
          {series.map((s, i) => (
            <p key={s.name} className="mt-1 flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-[2px]"
                  style={{ background: rows[hover].colors?.[i] ?? s.color }}
                />
                {s.name}
              </span>
              <span className="tabular-nums text-neutral-100">
                {rows[hover].values[i] === null ? '—' : valueFormat(rows[hover].values[i])}
              </span>
            </p>
          ))}
          {rows[hover].note && <p className="mt-1.5 text-neutral-400">{rows[hover].note}</p>}
        </ChartTooltip>
      )}
    </div>
  )
}
