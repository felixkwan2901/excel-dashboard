import { useState } from 'react'
import { niceTicksSigned } from './chartScale'
import { useChartWidth } from './useChartWidth'
import { ChartTooltip } from './ChartCard'

const M = { top: 16, right: 16, bottom: 40, left: 52 }
const NARROW_LEFT = 40

// One dot per job against two measures. The parity line is the point of it:
// with the same units on both axes, "did this job do what it was quoted to
// do" becomes a position relative to a diagonal, which is far quicker to read
// than comparing two columns of percentages.
export default function ScatterChart({
  points,
  height = 300,
  xLabel,
  yLabel,
  format,
  parity = true,
  colorFor,
  emptyMessage = 'No data yet.',
}) {
  const [box, width] = useChartWidth()
  const [hover, setHover] = useState(null)

  const left = width < 460 ? NARROW_LEFT : M.left
  const plotW = Math.max(0, width - left - M.right)
  const plotH = height - M.top - M.bottom

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  // One scale for both axes, because a parity line only means anything if the
  // two axes are measured the same. Separate scales would put the diagonal at
  // a meaningless angle and quietly invert which side is "good".
  const all = [...xs, ...ys]
  // Six target ticks rather than the default four. The 1/2/5 step ladder is
  // coarse over a ~100-point spread: at four the step rounds up to 50, which
  // pushes the axis to -100% when nothing sits below -58% and squashes every
  // dot into one corner. Six lands on a step of 20 and uses the whole plot.
  const scale = niceTicksSigned(Math.min(...all), Math.max(...all), 6)
  const xOf = (v) => left + ((v - scale.min) / (scale.max - scale.min)) * plotW
  // Seven tick labels across a 160px plot overlap. The gridlines all stay —
  // only every other label is drawn, which keeps the grid readable without
  // the numbers colliding.
  const xLabelStride = plotW / scale.ticks.length < 34 ? 2 : 1
  const yOf = (v) => M.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH

  return (
    <div ref={box} className="relative w-full">
      {points.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-neutral-400">{emptyMessage}</p>
      ) : (
        <svg width={width} height={height} role="img" aria-hidden="true" style={{ display: 'block', maxWidth: '100%' }}>
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
              <line
                x1={xOf(t)}
                x2={xOf(t)}
                y1={M.top}
                y2={M.top + plotH}
                stroke={t === 0 ? 'var(--baseline)' : 'var(--gridline)'}
                strokeWidth={1}
              />
              <text
                x={left - 8}
                y={yOf(t) + 4}
                textAnchor="end"
                className="fill-[var(--text-muted)] text-[11px] tabular-nums"
              >
                {format(t)}
              </text>
              {/* The bottom-left corner belongs to the y axis: drawing the
                  x axis's first tick there prints the same number twice, on
                  top of itself. */}
              {t !== scale.min && scale.ticks.indexOf(t) % xLabelStride === 0 && (
                <text
                  x={xOf(t)}
                  y={M.top + plotH + 16}
                  textAnchor="middle"
                  className="fill-[var(--text-muted)] text-[11px] tabular-nums"
                >
                  {format(t)}
                </text>
              )}
            </g>
          ))}

          {parity && (
            <line
              x1={xOf(scale.min)}
              y1={yOf(scale.min)}
              x2={xOf(scale.max)}
              y2={yOf(scale.max)}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          {points.map((p, i) => (
            <circle
              key={p.label}
              cx={xOf(p.x)}
              cy={yOf(p.y)}
              r={hover === i ? 7 : 5}
              fill={colorFor ? colorFor(p) : 'var(--viz-1)'}
              // A 2px ring in the surface colour keeps overlapping dots
              // readable as two dots rather than one blob.
              stroke="var(--surface-1)"
              strokeWidth={2}
              opacity={hover === null || hover === i ? 1 : 0.5}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}

          <text
            x={left + plotW / 2}
            y={height - 4}
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-[11px]"
          >
            {xLabel}
          </text>
          <text
            x={-(M.top + plotH / 2)}
            y={12}
            transform="rotate(-90)"
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-[11px]"
          >
            {yLabel}
          </text>
        </svg>
      )}

      {hover !== null && points[hover] && (
        <ChartTooltip x={xOf(points[hover].x)} y={yOf(points[hover].y)} width={width}>
          <p className="font-medium text-white">{points[hover].fullLabel ?? points[hover].label}</p>
          <p className="mt-1 flex items-center justify-between gap-4">
            <span className="text-neutral-400">{xLabel}</span>
            <span className="tabular-nums text-neutral-100">{format(points[hover].x)}</span>
          </p>
          <p className="flex items-center justify-between gap-4">
            <span className="text-neutral-400">{yLabel}</span>
            <span className="tabular-nums text-neutral-100">{format(points[hover].y)}</span>
          </p>
          {points[hover].note && <p className="mt-1.5 text-neutral-400">{points[hover].note}</p>}
        </ChartTooltip>
      )}
    </div>
  )
}
