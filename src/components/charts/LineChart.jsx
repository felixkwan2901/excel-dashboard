import { useState } from 'react'
import { niceTicks, niceTicksSigned } from './chartScale'
import { useChartWidth } from './useChartWidth'
import { ChartTooltip } from './ChartCard'

const M = { top: 18, right: 12, bottom: 26, left: 52 }
const NARROW_LEFT = 38

// Lines and areas over an ordered x axis, in three modes:
//
//   'line'  plain lines, one per series — for a measure whose *level* matters
//   'stack' filled areas stacked on each other — for parts of a whole, where
//           the top edge is the total and each band is its contribution
//   'zero'  one series filled to a zero line, with the fill above and below
//           coloured differently — for a measure that goes both ways, where
//           the sign is the whole point
//
// One component rather than three because the axes, gridlines, hover and
// tooltip are identical in all three; only the marks differ.
export default function LineChart({
  points,
  series,
  mode = 'line',
  height = 240,
  valueFormat,
  axisFormat,
  aboveLabel,
  belowLabel,
  emptyMessage = 'No data yet.',
}) {
  const [box, width] = useChartWidth()
  const [hover, setHover] = useState(null)

  const left = width < 460 ? NARROW_LEFT : M.left
  const plotW = Math.max(0, width - left - M.right)
  const plotH = height - M.top - M.bottom

  // Stacked areas are measured on the running total, not the individual
  // series — scaling to the largest single band would run the top of the
  // stack off the chart.
  const stacked = points.map((p) => {
    let running = 0
    return p.values.map((v) => (running += v ?? 0))
  })

  const allValues =
    mode === 'stack'
      ? stacked.flat()
      : points.flatMap((p) => p.values.filter((v) => v !== null && v !== undefined))
  const rawMax = Math.max(0, ...allValues)
  const rawMin = Math.min(0, ...allValues)
  const scale =
    mode === 'zero' ? niceTicksSigned(rawMin, rawMax) : { ...niceTicks(rawMax), min: 0 }
  const yOf = (v) => M.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH
  const xOf = (i) => (points.length === 1 ? left + plotW / 2 : left + (i / (points.length - 1)) * plotW)
  const zeroY = yOf(0)

  const linePath = (getY) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${getY(p, i)}`).join(' ')

  const areaPath = (getTop, getBottom) =>
    `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${getTop(p, i)}`).join(' ')} ` +
    `${points
      .map((p, i) => `L${xOf(points.length - 1 - i)},${getBottom(p, points.length - 1 - i)}`)
      .join(' ')
      .replace('L', 'L')} Z`

  const clipAbove = `clip-above-${mode}-${points.length}`
  const clipBelow = `clip-below-${mode}-${points.length}`

  return (
    <div ref={box} className="relative w-full">
      {points.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-neutral-400">{emptyMessage}</p>
      ) : (
        <svg width={width} height={height} role="img" aria-hidden="true" style={{ display: 'block', maxWidth: '100%' }}>
          <defs>
            <clipPath id={clipAbove}>
              <rect x={left} y={M.top} width={plotW} height={Math.max(0, zeroY - M.top)} />
            </clipPath>
            <clipPath id={clipBelow}>
              <rect x={left} y={zeroY} width={plotW} height={Math.max(0, M.top + plotH - zeroY)} />
            </clipPath>
          </defs>

          {scale.ticks.map((t) => (
            <g key={t}>
              <line
                x1={left}
                x2={width - M.right}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke={t === 0 ? 'var(--baseline)' : 'var(--gridline)'}
                strokeWidth={1}
              />
              <text
                x={left - 8}
                y={yOf(t) + 4}
                textAnchor="end"
                className="fill-[var(--text-muted)] text-[11px] tabular-nums"
              >
                {axisFormat(t)}
              </text>
            </g>
          ))}

          {mode === 'stack' &&
            series.map((s, si) => (
              <path
                key={s.name}
                d={areaPath(
                  (_, i) => yOf(stacked[i][si]),
                  (_, i) => yOf(si === 0 ? 0 : stacked[i][si - 1]),
                )}
                fill={s.color}
                opacity={0.9}
              />
            ))}

          {mode === 'zero' && (
            <>
              {/* Same area drawn twice and clipped at the zero line, so the
                  sign carries its own colour without two separate paths that
                  could drift apart. */}
              <path
                d={areaPath((p) => yOf(p.values[0] ?? 0), () => zeroY)}
                fill={series[0].aboveColor}
                clipPath={`url(#${clipAbove})`}
                opacity={0.85}
              />
              <path
                d={areaPath((p) => yOf(p.values[0] ?? 0), () => zeroY)}
                fill={series[0].belowColor}
                clipPath={`url(#${clipBelow})`}
                opacity={0.85}
              />
              <path
                d={linePath((p) => yOf(p.values[0] ?? 0))}
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth={1.5}
              />
            </>
          )}

          {mode === 'line' &&
            series.map((s, si) => (
              <g key={s.name}>
                <path
                  d={linePath((p) => yOf(p.values[si] ?? 0))}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map((p, i) => (
                  <circle
                    key={p.label}
                    cx={xOf(i)}
                    cy={yOf(p.values[si] ?? 0)}
                    r={hover === i ? 5 : 3.5}
                    fill={s.color}
                    stroke="var(--surface-1)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ))}

          {points.map((p, i) => (
            <g key={p.label}>
              {(i % Math.ceil(points.length / (plotW < 320 ? 4 : 8)) === 0 ||
                i === points.length - 1) && (
                <text
                  x={xOf(i)}
                  y={height - 8}
                  textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                  className={`text-[11px] ${hover === i ? 'fill-[var(--text-primary)]' : 'fill-[var(--text-muted)]'}`}
                >
                  {p.label}
                </text>
              )}
              <rect
                x={xOf(i) - plotW / points.length / 2}
                y={M.top}
                width={plotW / points.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}

          {hover !== null && (
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={M.top}
              y2={M.top + plotH}
              stroke="var(--baseline)"
              strokeWidth={1}
            />
          )}
        </svg>
      )}

      {hover !== null && points[hover] && (
        <ChartTooltip x={xOf(hover)} y={M.top} width={width}>
          <p className="font-medium text-white">{points[hover].fullLabel ?? points[hover].label}</p>
          {series.map((s, i) => (
            <p key={s.name} className="mt-1 flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-[2px]"
                  style={{
                    background:
                      mode === 'zero'
                        ? (points[hover].values[0] ?? 0) >= 0
                          ? s.aboveColor
                          : s.belowColor
                        : s.color,
                  }}
                />
                {mode === 'zero'
                  ? (points[hover].values[0] ?? 0) >= 0
                    ? aboveLabel
                    : belowLabel
                  : s.name}
              </span>
              <span className="tabular-nums text-neutral-100">
                {points[hover].values[i] === null ? '—' : valueFormat(points[hover].values[i])}
              </span>
            </p>
          ))}
          {points[hover].note && <p className="mt-1.5 text-neutral-400">{points[hover].note}</p>}
        </ChartTooltip>
      )}
    </div>
  )
}
