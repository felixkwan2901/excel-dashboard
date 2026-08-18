import { Fragment, useMemo, useState } from 'react'

// Actual-hours-to-date vs quoted, not just this month vs other months —
// over 100% used reads as a warning (red) the same way a job's cost bar
// does elsewhere in the app; comfortably under reads neutral.
function pctUsedLabel(actualHours, quotedHours) {
  if (!quotedHours || actualHours === null) return '—'
  return `${Math.round((actualHours / quotedHours) * 100)}%`
}
function pctUsedTone(actualHours, quotedHours) {
  if (!quotedHours || actualHours === null) return 'text-neutral-500'
  return actualHours / quotedHours > 1 ? 'text-red-400 font-medium' : 'text-neutral-300'
}

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

export default function MonthlyHours({ monthlyHours, jobs: allJobs, onBack }) {
  const { months, totalsByMonth, jobs } = monthlyHours
  const [sort, setSort] = useState({ key: 'total', dir: -1 }) // total hours, highest first by default

  // Quoted/actual-to-date hours live on the main job record (Deliverables
  // Sheet), not in this monthly-hours log — cross-referenced by job number
  // so each job's monthly breakdown can be read against its actual budget,
  // not just compared month-to-month with nothing to check it against.
  const budgetByJobNumber = useMemo(() => {
    const map = new Map()
    for (const j of allJobs) map.set(j.jobNumber, { quotedHours: j.quotedLabourHours, actualHours: j.actualLabourHours })
    return map
  }, [allJobs])

  const rows = useMemo(() => {
    return jobs
      .map((j) => ({
        ...j,
        total: months.reduce((sum, m) => sum + (j.hoursByMonth[m] ?? 0), 0),
        ...budgetByJobNumber.get(j.jobNumber),
      }))
      .filter((j) => j.total > 0)
      .sort((a, b) => {
        const av = sort.key === 'total' ? a.total : (a.hoursByMonth[sort.key] ?? 0)
        const bv = sort.key === 'total' ? b.total : (b.hoursByMonth[sort.key] ?? 0)
        return (av - bv) * -sort.dir
      })
  }, [jobs, months, sort, budgetByJobNumber])

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
          cumulative hours between one update and the next — set against each job&apos;s total
          quoted hours in the table below, so a busy month reads against its actual budget, not
          just against other months.
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

            {/* Mobile: a table with one column per month gets unreadable
                fast — one card per job, each month's hours listed as a
                line, is far easier to scan on a phone. */}
            <div className="flex flex-col gap-3 sm:hidden">
              {rows.map((j) => (
                <div
                  key={j.jobNumber}
                  className="flex flex-col gap-2 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[14px] font-medium text-white">
                      <span className="text-neutral-500">{j.jobNumber}</span> {j.jobName}
                    </p>
                    <span className="text-[13px] font-medium tabular-nums text-neutral-200">
                      {j.total.toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-neutral-500">Actual / quoted (to date)</span>
                    <span className={pctUsedTone(j.actualHours, j.quotedHours)}>
                      {j.actualHours ?? '—'} / {j.quotedHours ?? '—'} hrs ({pctUsedLabel(j.actualHours, j.quotedHours)})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                    {months.map((m) => (
                      <Fragment key={m}>
                        <span className="text-neutral-500">{monthLabel(m)}</span>
                        <span className="text-right tabular-nums text-neutral-200">
                          {j.hoursByMonth[m] !== undefined ? `${j.hoursByMonth[m].toFixed(1)} hrs` : '—'}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              ))}
              {rows.length === 0 && <p className="empty-row">No jobs to show.</p>}
            </div>

            <div className="table-scroll hidden sm:block">
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
                    <th className="num">Quoted hrs</th>
                    <th className="num">% used (to date)</th>
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
                      <td className="num tabular">{j.quotedHours ?? '—'}</td>
                      <td className={`num tabular ${pctUsedTone(j.actualHours, j.quotedHours)}`}>
                        {pctUsedLabel(j.actualHours, j.quotedHours)}
                      </td>
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
