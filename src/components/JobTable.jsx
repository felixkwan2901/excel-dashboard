import { useMemo, useState } from 'react'
import StatusBadge from './StatusBadge'
import { money, percent } from '../lib/format'

const COLUMNS = [
  { key: 'jobNumber', label: 'Job Number' },
  { key: 'jobName', label: 'Job Name' },
  { key: 'costProgress', label: 'Cost' },
  { key: 'marginToDate', label: 'Margin', num: true },
  { key: 'gpPerHour', label: 'GP $/hr', num: true },
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

// Bar is clipped to a fixed ±100% domain (rather than scaling to whatever
// the widest job in view happens to be) so every row's bar is visually
// comparable to every other row's, and one extreme outlier (e.g. a job at
// -298% margin) can't compress everything else down to invisibly thin
// slivers. The clip only affects the bar's width — the percentage label
// next to it always shows the real, unclipped value.
function MarginBar({ value }) {
  if (value === null) return <span className="text-neutral-500">—</span>

  const pct = value * 100
  const clipped = Math.max(-100, Math.min(100, pct))
  const halfWidth = (Math.abs(clipped) / 100) * 50
  const negative = clipped < 0
  // Color thresholds mirror how a job already gets flagged for losing
  // margin (marginToDate < 0 ⇒ red here too) — under 15% is a thin/at-risk
  // margin (amber), 15%+ is a healthy one (green).
  const fillColor = negative ? 'bg-red-500' : clipped < 15 ? 'bg-amber-400' : 'bg-brand-green'

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-16 shrink-0 rounded-full bg-white/[0.08]">
        <div
          className={`absolute top-0 h-full rounded-full ${fillColor}`}
          style={{ left: negative ? `${50 - halfWidth}%` : '50%', width: `${halfWidth}%` }}
        />
      </div>
      <span
        className={`w-16 shrink-0 text-right tabular-nums ${negative ? 'text-red-400' : 'text-neutral-200'}`}
      >
        {percent(value)}
      </span>
    </div>
  )
}

function renderCell(job, key) {
  switch (key) {
    case 'costProgress':
      return <CostBar actual={job.totalActualCost} quoted={job.quotedPrice} />
    case 'marginToDate':
      return <MarginBar value={job.marginToDate} />
    case 'gpPerHour':
      return <span className="text-[12px] tabular-nums text-neutral-400">{money(job.gpPerHour)}</span>
    default:
      return job[key]
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
      <div className="mb-3 flex flex-wrap gap-2">
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

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={col.num ? 'num sortable' : 'sortable'}
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
                {COLUMNS.map((col) => (
                  <td key={col.key} className={col.num ? 'num tabular' : undefined}>
                    {renderCell(job, col.key)}
                  </td>
                ))}
                <td>
                  <StatusBadge flagged={job.flagged} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="empty-row">
                  No jobs match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
