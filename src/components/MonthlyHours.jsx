import { useMemo, useState } from 'react'

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })
}

// A single-hue magnitude bar (hours are never negative, so no diverging
// polarity encoding is needed here) — thin, rounded, value shown directly
// rather than gated behind a hover tooltip, matching MonthlyClaims'
// DivergingBar for the same "~30 rows, always-on labels read faster"
// reasoning.
function HoursBar({ label, hours, maxHours }) {
  const widthPct = maxHours ? (hours / maxHours) * 100 : 0
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-[13px] text-neutral-400">{label}</span>
      <div className="h-2.5 flex-1 rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-brand-green" style={{ width: `${widthPct}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-neutral-300">
        {hours.toFixed(1)} hrs
      </span>
    </div>
  )
}

export default function MonthlyHours({ monthlyHours, onBack }) {
  const { months, totalsByMonth, jobs } = monthlyHours
  const [sort, setSort] = useState({ key: 'total', dir: -1 }) // total hours, highest first by default

  const rows = useMemo(() => {
    return jobs
      .map((j) => ({
        ...j,
        total: months.reduce((sum, m) => sum + (j.hoursByMonth[m] ?? 0), 0),
      }))
      .filter((j) => j.total > 0)
      .sort((a, b) => {
        const av = sort.key === 'total' ? a.total : (a.hoursByMonth[sort.key] ?? 0)
        const bv = sort.key === 'total' ? b.total : (b.hoursByMonth[sort.key] ?? 0)
        return (av - bv) * -sort.dir
      })
  }, [jobs, months, sort])

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: -1 }))
  }

  const maxTotalHours = Math.max(1, ...totalsByMonth.map((t) => t.totalHours))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Hours by month</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Hours by month</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Labour hours actually worked each month, derived from the change in each job&apos;s
          cumulative hours between one update and the next.
        </p>
      </div>

      {months.length === 0 ? (
        <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6 text-sm text-neutral-400">
          Not enough history yet to compare months — this builds up automatically each time job
          data is updated. Check back once at least two months&apos; worth of updates have landed.
        </div>
      ) : (
        <>
          <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
            <h2 className="mb-4 text-[15px] font-medium text-neutral-100">Total hours worked, by month</h2>
            <div className="flex flex-col">
              {totalsByMonth.map((t) => (
                <HoursBar key={t.month} label={monthLabel(t.month)} hours={t.totalHours} maxHours={maxTotalHours} />
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
            <h2 className="mb-4 text-[15px] font-medium text-neutral-100">Hours per job, by month</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    {months.map((m) => (
                      <th
                        key={m}
                        className="num sortable"
                        onClick={() => toggleSort(m)}
                        aria-sort={sort.key === m ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                      >
                        {monthLabel(m)}
                        {sort.key === m && (sort.dir === 1 ? ' ▲' : ' ▼')}
                      </th>
                    ))}
                    <th
                      className="num sortable"
                      onClick={() => toggleSort('total')}
                      aria-sort={sort.key === 'total' ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    >
                      Total{sort.key === 'total' && (sort.dir === 1 ? ' ▲' : ' ▼')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => (
                    <tr key={j.jobNumber}>
                      <td>
                        {j.jobNumber} {j.jobName}
                      </td>
                      {months.map((m) => (
                        <td key={m} className="num tabular">
                          {j.hoursByMonth[m] !== undefined ? j.hoursByMonth[m].toFixed(1) : '—'}
                        </td>
                      ))}
                      <td className="num tabular font-medium">{j.total.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
