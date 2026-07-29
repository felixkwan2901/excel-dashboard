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
  { key: 'swimlane', label: 'Swimlane' },
  { key: 'tech', label: 'Assigned tech' },
  { key: 'value', label: 'Est. value', num: true },
]

export default function JobTable({ jobs, swimlanes }) {
  const [query, setQuery] = useState('')
  const [swimlaneFilter, setSwimlaneFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'jobId', dir: 1 })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs
      .filter((job) => swimlaneFilter === 'all' || job.swimlane === swimlaneFilter)
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
  }, [jobs, query, swimlaneFilter, sort])

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
        <select
          value={swimlaneFilter}
          onChange={(e) => setSwimlaneFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">All swimlanes</option>
          {swimlanes.map((s) => (
            <option key={s.name} value={s.name}>
              {s.shortName}
            </option>
          ))}
        </select>
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
                >
                  {col.label}
                  {sort.key === col.key && (sort.dir === 1 ? ' ▲' : ' ▼')}
                </th>
              ))}
              <th>AI check</th>
              <th>Approval</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((job) => (
              <tr key={job.jobId}>
                <td className="tabular">{job.jobId}</td>
                <td>{job.client}</td>
                <td>{job.category}</td>
                <td>{job.swimlane.replace(/^\d+\.\s*/, '')}</td>
                <td>{job.tech}</td>
                <td className="num tabular">{CURRENCY.format(job.value)}</td>
                <td>
                  <StatusBadge label={job.aiStatus} />
                </td>
                <td>
                  <StatusBadge label={job.approvalStatus} />
                </td>
                <td className="tabular">{DATE.format(new Date(job.createdAt))}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-row">
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
