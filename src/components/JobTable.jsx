import { useMemo, useState } from 'react'
import { Settings2 } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { money, percent } from '../lib/format'

// Always shown, not part of the toggle panel.
const FIXED_COLUMNS = [{ key: 'jobNumber', label: 'Job Number' }, { key: 'jobName', label: 'Job Name' }]

// Shown by default but still toggleable — the compact "at a glance" set
// this table originally shipped with.
const DEFAULT_OPTIONAL_KEYS = ['costProgress', 'gpPerHour', 'marginToDate']

// Every other optional column: derived/calculated figures the workbook
// carries that the table doesn't show unless turned on, so the table stays
// uncluttered by default but nothing is permanently hidden.
const OPTIONAL_COLUMNS = [
  { key: 'costProgress', label: 'Cost' },
  { key: 'gpPerHour', label: 'GP $/hr', num: true },
  { key: 'marginToDate', label: 'Margin', num: true, centerHeader: true },
  { key: 'quotedPrice', label: 'Quoted price', num: true, format: money },
  { key: 'claimToDate', label: 'Claim to date', num: true, format: money },
  { key: 'remainingToClaim', label: 'Remaining to claim', num: true, format: money },
  { key: 'pctClaimRemaining', label: '% claim remaining', num: true, format: percent },
  { key: 'totalQuotedCost', label: 'Total quoted cost', num: true, format: money },
  { key: 'totalActualCost', label: 'Total actual cost', num: true, format: money },
  { key: 'quotedMaterialCost', label: 'Quoted material cost', num: true, format: money },
  { key: 'actualMaterialCost', label: 'Actual material cost', num: true, format: money },
  { key: 'materialCostRemaining', label: 'Material cost remaining', num: true, format: money },
  { key: 'materialPctRemaining', label: 'Material % remaining', num: true, format: percent },
  { key: 'estimatedPctMaterialsReceived', label: 'Est. % materials received', num: true, format: percent },
  { key: 'quotedLabourCost', label: 'Quoted labour cost', num: true, format: money },
  { key: 'actualLabourCost', label: 'Actual labour cost', num: true, format: money },
  { key: 'labourCostRemaining', label: 'Labour cost remaining', num: true, format: money },
  { key: 'labourCostPctRemaining', label: 'Labour cost % remaining', num: true, format: percent },
  { key: 'quotedLabourHours', label: 'Quoted labour hours', num: true },
  { key: 'actualLabourHours', label: 'Actual labour hours', num: true },
  { key: 'labourHoursRemaining', label: 'Labour hours remaining', num: true },
  { key: 'labourHourPctRemaining', label: 'Labour hour % remaining', num: true, format: percent },
  { key: 'estimatedPctJobComplete', label: 'Est. % job complete', num: true, format: percent },
  { key: 'quotedGpPerHour', label: 'Quoted GP $/hr', num: true, format: money },
  { key: 'quotedMargin', label: 'Quoted margin', num: true, format: percent },
  { key: 'projectedTotalCost', label: 'Projected total cost', num: true, format: money },
  { key: 'projectedOverrun', label: 'Projected overrun', num: true, format: money },
]

// Replaces the old separate Quoted Price / Actual Cost / Remaining to
// Claim columns with one compact element: a bar showing actual cost as a
// proportion of the quoted price, plus the two raw numbers underneath so
// nothing is lost — just less crowded. Colors mirror the same red/amber/
// green tiering as the Margin bar, scaled to this bar's own ratio: over
// 100% of quote spent is red, 85-100% is "getting close" amber, under
// that is comfortably green.
function CostBar({ actual, quoted }) {
  if (!quoted) return <span className="text-neutral-500">—</span>

  const ratio = actual === null ? 0 : actual / quoted
  const fillWidth = Math.min(Math.max(ratio, 0), 1) * 100
  const fillColor = ratio > 1 ? 'bg-red-500' : ratio >= 0.85 ? 'bg-amber-400' : 'bg-brand-green'

  return (
    <div className="flex min-w-[140px] flex-col gap-1.5">
      <div className="relative h-1.5 w-full rounded-full bg-white/[0.08]">
        <div className={`absolute top-0 h-full rounded-full ${fillColor}`} style={{ width: `${fillWidth}%` }} />
      </div>
      <span className="text-[12px] tabular-nums text-neutral-400">
        {money(actual)} of {money(quoted)}
      </span>
    </div>
  )
}

// Pill position is clipped to a fixed ±100% domain (rather than scaling
// to whatever the widest job in view happens to be) so every row's pill
// is visually comparable to every other row's, and one extreme outlier
// (e.g. a job at -298% margin) can't compress everything else toward the
// center. The clip only affects the pill's position — the percentage
// label next to it always shows the real, unclipped value.
function MarginBar({ value }) {
  if (value === null) return <span className="text-neutral-500">—</span>

  const pct = value * 100
  const clipped = Math.max(-100, Math.min(100, pct))
  const offset = (Math.abs(clipped) / 100) * 50
  const negative = clipped < 0
  const warning = !negative && clipped < 15
  // Color thresholds mirror how a job already gets flagged for losing
  // margin (marginToDate < 0 ⇒ red here too) — under 15% is a thin/at-risk
  // margin (amber), 15%+ is a healthy one (green).
  const pillColor = negative ? 'bg-red-500' : warning ? 'bg-amber-400' : 'bg-brand-green'
  const textColor = negative ? 'text-red-400' : warning ? 'text-amber-400' : 'text-neutral-200'
  const pillPos = negative ? 50 - offset : 50 + offset

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1 w-[60px] shrink-0 rounded-full bg-white/[0.12]">
        <div
          className={`absolute top-1/2 h-1.5 w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full ${pillColor}`}
          style={{ left: `${pillPos}%` }}
        />
      </div>
      <span className={`tabular-nums ${textColor}`}>{percent(value)}</span>
    </div>
  )
}

function renderCell(job, col) {
  switch (col.key) {
    case 'costProgress':
      return <CostBar actual={job.totalActualCost} quoted={job.quotedPrice} />
    case 'marginToDate':
      return <MarginBar value={job.marginToDate} />
    case 'gpPerHour':
      return <span className="text-[12px] tabular-nums text-neutral-400">{money(job.gpPerHour)}</span>
    default:
      if (col.format) return col.format(job[col.key])
      return job[col.key] === null ? '—' : job[col.key]
  }
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'needsReview', label: 'Needs review' },
]

// costProgress isn't a direct job field (it renders two fields as one
// merged bar) — sort it by its underlying spend ratio instead.
function sortValue(job, key) {
  if (key === 'costProgress') {
    if (!job.quotedPrice) return null
    return job.totalActualCost === null ? null : job.totalActualCost / job.quotedPrice
  }
  return job[key]
}

export default function JobTable({
  jobs,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  onSelectJob,
}) {
  const [sort, setSort] = useState({ key: 'jobNumber', dir: 1 })
  const [visibleKeys, setVisibleKeys] = useState(() => new Set(DEFAULT_OPTIONAL_KEYS))
  const [panelOpen, setPanelOpen] = useState(false)

  const columns = useMemo(
    () => [...FIXED_COLUMNS, ...OPTIONAL_COLUMNS.filter((c) => visibleKeys.has(c.key))],
    [visibleKeys]
  )

  function toggleColumn(key) {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs
      .filter((job) => (statusFilter === 'needsReview' ? job.flagged : true))
      .filter(
        (job) =>
          !q ||
          job.jobName.toLowerCase().includes(q) ||
          job.jobNumber.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const av = sortValue(a, sort.key)
        const bv = sortValue(b, sort.key)
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        if (typeof av === 'number') return (av - bv) * sort.dir
        return String(av).localeCompare(String(bv)) * sort.dir
      })
  }, [jobs, query, statusFilter, sort])

  const statusCounts = useMemo(
    () => ({
      all: jobs.length,
      needsReview: jobs.filter((job) => job.flagged).length,
    }),
    [jobs]
  )

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: 1 }))
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onStatusFilterChange(chip.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === chip.key
                  ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
                  : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {chip.label} ({statusCounts[chip.key]})
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-pressed={panelOpen}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
            panelOpen
              ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
              : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
          }`}
        >
          <Settings2 size={14} aria-hidden="true" />
          Columns shown
        </button>
      </div>

      <div className="table-filters">
        <input
          type="search"
          placeholder="Search job number or job name…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="filter-input"
        />
        <span className="table-filters__count">
          {filtered.length} of {jobs.length} jobs
        </span>
      </div>

      <div className="flex items-start gap-6">
        <div className="table-scroll min-w-0 flex-1">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.num ? 'num' : ''} ${col.centerHeader ? 'center-header' : ''} sortable`}
                    onClick={() => toggleSort(col.key)}
                    aria-sort={
                      sort.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    {col.label}
                    {sort.key === col.key && (sort.dir === 1 ? ' ▲' : ' ▼')}
                  </th>
                ))}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => (
                <tr
                  key={job.jobNumber}
                  onClick={() => onSelectJob?.(job.jobNumber)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectJob?.(job.jobNumber)
                    }
                  }}
                  tabIndex={onSelectJob ? 0 : undefined}
                  role={onSelectJob ? 'button' : undefined}
                  className={onSelectJob ? 'row-clickable' : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={col.num ? 'num tabular' : undefined}>
                      {renderCell(job, col)}
                    </td>
                  ))}
                  <td>
                    <StatusBadge flagged={job.flagged} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="empty-row">
                    No jobs match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {panelOpen && (
          <div className="w-64 shrink-0 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-neutral-400 uppercase">
              Columns shown
            </h2>
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
              {OPTIONAL_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-start gap-2 text-[13px] text-neutral-300">
                  <input
                    type="checkbox"
                    checked={visibleKeys.has(c.key)}
                    onChange={() => toggleColumn(c.key)}
                    className="mt-0.5"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
