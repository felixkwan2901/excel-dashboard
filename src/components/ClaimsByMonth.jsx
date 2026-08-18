import { Fragment, useMemo, useState } from 'react'
import { money } from '../lib/format'

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })
}

// Profit swings negative often enough (a bad month, not just a slow one)
// that a magnitude-only bar (like Hours by month's) would be misleading —
// same diverging-bar-from-center treatment MonthlyClaims already uses for
// this month's profit, applied here across whole months instead of jobs.
function DivergingBar({ label, value, maxAbs }) {
  const widthPct = maxAbs ? (Math.abs(value) / maxAbs) * 50 : 0
  const positive = value >= 0
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-[13px] text-neutral-400">{label}</span>
      <div className="relative h-2.5 flex-1">
        <div className="absolute top-1/2 left-1/2 h-full w-px -translate-x-1/2 -translate-y-1/2 bg-white/10" />
        <div
          className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full ${positive ? 'bg-brand-green' : 'bg-red-500'}`}
          style={positive ? { left: '50%', width: `${widthPct}%` } : { right: '50%', width: `${widthPct}%` }}
        />
      </div>
      <span className={`w-24 shrink-0 text-right text-[12px] tabular-nums ${positive ? 'text-neutral-300' : 'text-red-400'}`}>
        {money(value)}
      </span>
    </div>
  )
}

export default function ClaimsByMonth({ monthlyClaimsHistory, onBack }) {
  const { months, totalsByMonth, jobs } = monthlyClaimsHistory
  const [sort, setSort] = useState({ key: 'total', dir: -1 })

  const rows = useMemo(() => {
    return jobs
      .map((j) => ({
        ...j,
        total: months.reduce((sum, m) => sum + (j.profitByMonth[m] ?? 0), 0),
      }))
      .filter((j) => months.some((m) => (j.claimByMonth[m] ?? 0) !== 0 || (j.costsByMonth[m] ?? 0) !== 0))
      .sort((a, b) => {
        const av = sort.key === 'total' ? a.total : (a.profitByMonth[sort.key] ?? 0)
        const bv = sort.key === 'total' ? b.total : (b.profitByMonth[sort.key] ?? 0)
        return (av - bv) * -sort.dir
      })
  }, [jobs, months, sort])

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: -1 }))
  }

  const maxAbsProfit = Math.max(1, ...totalsByMonth.map((t) => Math.abs(t.totalProfit)))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Claims by month</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Claims by month</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Real month-by-month claim, cost, and profit history per job — unlike the workbook&apos;s
          Claim Calculator By Month sheet, which despite its name only ever holds the current
          month&apos;s figures and gets reset every rollover. This builds up permanently, one real
          recorded month at a time.
        </p>
      </div>

      {months.length === 0 ? (
        <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6 text-sm text-neutral-400">
          Not enough history yet — this builds up automatically each time job data is updated.
          Check back after the next weekly upload.
        </div>
      ) : (
        <>
          <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
            <h2 className="mb-4 text-[15px] font-medium text-neutral-100">Total profit, by month</h2>
            <div className="flex flex-col">
              {totalsByMonth.map((t) => (
                <DivergingBar key={t.month} label={monthLabel(t.month)} value={t.totalProfit} maxAbs={maxAbsProfit} />
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
            <h2 className="text-[15px] font-medium text-neutral-100">Profit per job, by month</h2>
            <p className="mt-1 mb-4 text-[13px] text-neutral-500">
              Jobs with no claim or cost activity in any tracked month are hidden — see the Job
              Directory for those.
            </p>

            {/* Mobile: a table with one column per month gets unreadable
                fast — one card per job, each month's profit listed as a
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
                    <span className={`text-[13px] font-medium tabular-nums ${j.total < 0 ? 'text-red-400' : 'text-neutral-200'}`}>
                      {money(j.total)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                    {months.map((m) => (
                      <Fragment key={m}>
                        <span className="text-neutral-500">{monthLabel(m)}</span>
                        <span className={`text-right tabular-nums ${(j.profitByMonth[m] ?? 0) < 0 ? 'text-red-400' : 'text-neutral-200'}`}>
                          {j.profitByMonth[m] !== undefined ? money(j.profitByMonth[m]) : '—'}
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
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => (
                    <tr key={j.jobNumber}>
                      <td>
                        {j.jobNumber} {j.jobName}
                      </td>
                      {months.map((m) => (
                        <td key={m} className={`num tabular ${(j.profitByMonth[m] ?? 0) < 0 ? 'text-red-400' : ''}`}>
                          {j.profitByMonth[m] !== undefined ? money(j.profitByMonth[m]) : '—'}
                        </td>
                      ))}
                      <td className={`num tabular font-medium ${j.total < 0 ? 'text-red-400' : ''}`}>{money(j.total)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={months.length + 2} className="empty-row">
                        No jobs to show.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
