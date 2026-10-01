import { useState } from 'react'
import { hBarPath, niceTicks } from './chartScale'
import { useChartWidth } from './useChartWidth'
import { ChartTooltip } from './ChartCard'

// A row can carry `spark` (one value per month, null for a month not worked)
// and `sparkLabels`; when at least one row has two points, a small trend line
// is drawn to the right of the bar's figure. A row's `tones[s]` ('bad' |
// 'good') colours that series' figure — the bar keeps its series colour, so a
// red never sits beside an orange.

// The right margin holds the value label that sits past the end of the bar.
const M = { top: 8, right: 54, bottom: 24 }
const SPARK_W = 72
const TONE = { bad: 'var(--viz-critical)', good: 'var(--brand-green)' }
const ROW_H = 34
const BAR_GAP = 2

// Horizontal bars, one or two series per row. Horizontal because the category
// labels are job names — vertical bars would need them rotated, and rotated
// labels are the single most common reason a chart goes unread.
// The trend line: months left to right, scaled to the row's own range, the
// last point marked. A month with no value breaks the line rather than
// drawing a zero that was never earned.
function Spark({ values, x, y, w, h }) {
  const nums = values.filter((v) => v != null)
  if (nums.length < 2) return null
  const lo = Math.min(0, ...nums), hi = Math.max(0, ...nums)
  const span = hi - lo || 1
  const px = (i) => x + (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w)
  const py = (v) => y + h - ((v - lo) / span) * h
  let d = '', pen = false
  values.forEach((v, i) => { if (v == null) { pen = false; return } d += `${pen ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)} `; pen = true })
  const lastI = values.length - 1 - [...values].reverse().findIndex((v) => v != null)
  const last = values[lastI]
  const prev = values.slice(0, lastI).filter((v) => v != null).at(-1)
  const tone = prev == null ? 'var(--text-muted)' : last >= prev ? 'var(--brand-green)' : 'var(--viz-critical)'
  return (
    <g aria-hidden="true">
      {lo < 0 && hi > 0 && <line x1={x} x2={x + w} y1={py(0)} y2={py(0)} stroke="var(--gridline)" strokeWidth={1} />}
      <path d={d.trim()} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(lastI)} cy={py(last)} r={2.5} fill={tone} />
    </g>
  )
}

export default function HBarChart({
  rows,
  series,
  labelWidth = 150,
  valueFormat,
  axisFormat,
  onSelect,
  emptyMessage = 'No data yet.',
}) {
  const [box, width] = useChartWidth()
  const [hover, setHover] = useState(null)

  // The label gutter is a fixed 150px on a desktop card, but that is half the
  // width of a phone — leaving a plot too short to compare anything in. Cap it
  // as a share of the chart instead, and let the names truncate.
  const gutter = Math.min(labelWidth, Math.round(width * 0.42))
  const hasSpark = rows.some((r) => (r.spark ?? []).filter((v) => v != null).length >= 2)
  const sparkW = hasSpark ? SPARK_W : 0
  const plotW = Math.max(0, width - gutter - M.right - sparkW)
  const height = M.top + rows.length * ROW_H + M.bottom
  const rawMax = Math.max(0, ...rows.flatMap((r) => r.values.map((v) => v ?? 0)))
  const { max, ticks } = niceTicks(rawMax, 3)
  const wOf = (v) => (v / max) * plotW

  const barH = (ROW_H - 10 - BAR_GAP * (series.length - 1)) / series.length
  // Job names are truncated to fit whatever gutter this width allows, rather
  // than at a fixed character count — a 20-character name is comfortable at
  // 150px and overlaps the bars at 126px. ~6.2px per character at 12px type.
  const maxChars = Math.max(6, Math.floor((gutter - 14) / 6.2))
  const fit = (text) => (text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text)

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
                  {fit(r.label)}
                </text>
                {r.values.map((v, s) => (
                  <path
                    key={series[s].name}
                    d={hBarPath(gutter, top + s * (barH + BAR_GAP), wOf(Math.max(0, v ?? 0)), barH)}
                    fill={r.colors?.[s] ?? series[s].color}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                ))}
                {/* Every bar says its figure, not just the one the rows are
                    ranked by. Labelling only the first series meant a row
                    showed what a job had spent and left what it was quoted
                    to a hover — so the comparison the chart exists to make
                    was the half you could not read. On a phone there is no
                    hover at all. */}
                {r.values.map((v, s2) =>
                  v === null || v === undefined ? null : (
                    <text
                      key={`v-${series[s2].name}`}
                      x={Math.min(gutter + wOf(Math.max(0, v)) + 6, width - sparkW - 2)}
                      y={top + s2 * (barH + BAR_GAP) + barH - 1}
                      className={`text-[10.5px] tabular-nums ${r.tones?.[s2] ? 'font-semibold' : ''}`}
                      style={{ fill: TONE[r.tones?.[s2]] ?? 'var(--text-secondary)' }}
                    >
                      {r.tones?.[s2] === 'bad' ? '▲ ' : ''}{axisFormat(v)}
                    </text>
                  ),
                )}
                {hasSpark && <Spark values={r.spark ?? []} x={width - sparkW + 8} y={top} w={sparkW - 14} h={ROW_H - 10} />}
                <rect
                  x={0}
                  y={M.top + i * ROW_H}
                  width={width}
                  height={ROW_H}
                  fill="transparent"
                  style={onSelect ? { cursor: 'pointer' } : undefined}
                  tabIndex={onSelect ? 0 : undefined}
                  role={onSelect ? 'button' : undefined}
                  aria-label={onSelect ? r.fullLabel : undefined}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => {
                    if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      onSelect(r)
                    }
                  }}
                  onClick={onSelect ? () => onSelect(r) : undefined}
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
          {(rows[hover].spark ?? []).filter((v) => v != null).length >= 2 && (
            <p className="mt-1.5 text-neutral-400">
              {rows[hover].spark.map((v, i) => `${rows[hover].sparkLabels?.[i] ?? i + 1}: ${v == null ? '—' : valueFormat(v)}`).join(' · ')}
            </p>
          )}
        </ChartTooltip>
      )}
    </div>
  )
}
