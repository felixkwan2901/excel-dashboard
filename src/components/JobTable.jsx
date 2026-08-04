import { useMemo, useState } from 'react'
import StatusBadge from './StatusBadge'
import { money, percent } from '../lib/format'

const COLUMNS = [
  { key: 'jobNumber', label: 'Job Number' },
  { key: 'jobName', label: 'Job Name' },
  { key: 'quotedPrice', label: 'Quoted Price', num: true },
  { key: 'totalActualCost', label: 'Actual Cost', num: true },
  { key: 'remainingToClaim', label: 'Remaining to Claim', num: true },
  { key: 'marginToDate', label: 'Margin', num: true },
  { key: 'gpPerHour', label: 'GP $/hr', num: true },
]

function renderCell(job, key) {
  switch (key) {
    case 'quotedPrice':
    case 'totalActualCost':
    case 'remainingToClaim':
    case 'gpPerHour':
      return money(job[key])
    case 'marginToDate':
      return percent(job.marginToDate)
    default:
      return job[key]
  }
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'needsReview', label: 'Needs review' },
]

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
        const av = a[sort.key]
        const bv = b[sort.key]
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
