import { useMemo, useState } from 'react'
import StatusBadge from './StatusBadge'

const CURRENCY = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  maximumFractionDigits: 0,
})

const DATE = new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short' })

const COLUMNS = [
  { key: 'jobId', label: 'Job ID' },
  { key: 'client', label: 'Client' },
  { key: 'category', label: 'Job category' },
  { key: 'tech', label: 'Assigned tech' },
  { key: 'value', label: 'Est. value', num: true },
  { key: 'aiStatus', label: 'AI check' },
  { key: 'approvalStatus', label: 'Approval' },
  { key: 'createdAt', label: 'Created' },
]

function renderCell(job, key) {
  switch (key) {
    case 'value':
      return CURRENCY.format(job.value)
    case 'aiStatus':
      return <StatusBadge label={job.aiStatus} />
    case 'approvalStatus':
      return <StatusBadge label={job.approvalStatus} />
    case 'createdAt':
      return DATE.format(new Date(job.createdAt))
    default:
      return job[key]
  }
}

export default function JobTable({ jobs, initialQuery = '', onSelectJob }) {
  const [query, setQuery] = useState(initialQuery)
  const [sort, setSort] = useState({ key: 'jobId', dir: 1 })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs
      .filter((job) =>
        !q ||
        job.client.toLowerCase().includes(q) ||
        job.category.toLowerCase().includes(q) ||
        job.jobId.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const av = a[sort.key]
        const bv = b[sort.key]
        if (typeof av === 'number') return (av - bv) * sort.dir
        return String(av).localeCompare(String(bv)) * sort.dir
      })
  }, [jobs, query, sort])

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: 1 }))
  }

  return (
    <div>
      <div className="table-filters">
        <input
          type="search"
          placeholder="Search client, job ID, or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
            </tr>
          </thead>
          <tbody>
            {filtered.map((job) => (
              <tr
                key={job.jobId}
                onClick={() => onSelectJob?.(job.jobId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectJob?.(job.jobId)
                  }
                }}
                tabIndex={onSelectJob ? 0 : undefined}
                role={onSelectJob ? 'button' : undefined}
                className={onSelectJob ? 'row-clickable' : undefined}
              >
                {COLUMNS.map((col) => {
                  const tabular = col.key === 'jobId' || col.key === 'createdAt' || col.num
                  const className = col.num ? 'num tabular' : tabular ? 'tabular' : undefined
                  return (
                    <td key={col.key} className={className}>
                      {renderCell(job, col.key)}
                    </td>
                  )
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="empty-row">
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
