import { useMemo, useState } from 'react'
import { money, percent } from '../lib/format'

// A thin diverging bar anchored at a center zero line — positive values
// grow right in brand green, negative grow left in red, mirroring the
// polarity encoding already used by JobTable's MarginBar/CostBar elsewhere
// in this app. Value is always shown directly (not hover-gated) since with
// ~30 rows visible at once, always-on labels read faster than a tooltip.
function DivergingBar({ label, value, maxAbs, formatValue }) {
  if (value === null) return null
  const widthPct = maxAbs ? (Math.abs(value) / maxAbs) * 50 : 0
  const positive = value >= 0

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-44 shrink-0 truncate text-[13px] text-neutral-400" title={label}>
        {label}
      </span>
      <div className="relative h-5 flex-1">
        <div className="absolute top-1/2 left-1/2 h-full w-px -translate-x-1/2 -translate-y-1/2 bg-white/10" />
        <div
          className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full ${positive ? 'bg-brand-green' : 'bg-red-500'}`}
          style={positive ? { left: '50%', width: `${widthPct}%` } : { right: '50%', width: `${widthPct}%` }}
        />
      </div>
      <span
        className={`w-28 shrink-0 text-right text-[12px] tabular-nums ${positive ? 'text-neutral-300' : 'text-red-400'}`}
      >
        {formatValue(value)}
      </span>
    </div>
  )
}

function TotalsCard({ total }) {
  if (!total) return null
  const costRatio = total.claim ? Math.min(Math.max(total.costs / total.claim, 0), 1) * 100 : 0

  return (
    <div className="flex flex-col gap-4 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-medium text-neutral-100">{total.category}</h3>
        <span
          className={`text-[13px] font-medium tabular-nums ${total.gpPct !== null && total.gpPct < 0 ? 'text-red-400' : 'text-brand-green'}`}
        >
          {percent(total.gpPct)} GP
        </span>
      </div>

      <div>
        <div className="relative h-1.5 w-full rounded-full bg-white/[0.08]">
          <div
            className="absolute top-0 h-full rounded-full bg-brand-green"
            style={{ width: `${costRatio}%` }}
          />
        </div>
        <p className="mt-1.5 text-[12px] tabular-nums text-neutral-400">
          {money(total.costs)} costs of {money(total.claim)} claimed
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
        <div>
          <p className="text-[12px] text-neutral-500">Profit this month</p>
          <p className={`text-lg font-semibold tabular-nums ${total.profit < 0 ? 'text-red-400' : 'text-neutral-100'}`}>
            {money(total.profit)}
          </p>
        </div>
        <div>
          <p className="text-[12px] text-neutral-500">Est. margin E.O.M</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-100">{percent(total.eomGpPct)}</p>
        </div>
      </div>
    </div>
  )
}

// A small header that toggles sort direction on click, with an arrow
// showing the current direction — the same click-to-sort convention
// JobTable's column headers already use, applied here to a whole chart
// instead of a single column.
function SortableHeading({ label, dir, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-1 flex items-center gap-1.5 text-[15px] font-medium text-neutral-100 transition-colors hover:text-white"
    >
      {label}
      <span className="text-[12px] text-neutral-500">{dir === 1 ? '▼ highest first' : '▲ lowest first'}</span>
    </button>
  )
}

const TABLE_COLUMNS = [
  { key: 'jobName', label: 'Job' },
  { key: 'claim', label: 'Claim', num: true, format: money },
  { key: 'costs', label: 'Costs', num: true, format: money },
  { key: 'profit', label: 'Profit', num: true, format: money },
  { key: 'margin', label: 'Margin', num: true, format: percent },
  { key: 'quotedMargin', label: 'Quoted margin', num: true, format: percent },
  { key: 'estimatedMarginEom', label: 'Est. margin E.O.M', num: true, format: percent },
  { key: 'gpPerHourThisMonth', label: 'GP $/hr this month', num: true, format: money },
]

export default function MonthlyClaims({ monthlyClaims, onBack }) {
  const { jobs, totals } = monthlyClaims

  const [profitDir, setProfitDir] = useState(1) // 1 = highest first, -1 = lowest first
  const [gpDir, setGpDir] = useState(1)
  // Default to margin ascending (worst first) rather than profit descending
  // (best first) — for a full per-job table, "which jobs are underperforming"
  // is the more actionable starting question than "which job made the most".
  const [tableSort, setTableSort] = useState({ key: 'margin', dir: 1 })

  const byProfit = useMemo(
    () => [...jobs].filter((j) => j.profit !== null).sort((a, b) => (b.profit - a.profit) * profitDir),
    [jobs, profitDir]
  )
  const byGpPerHour = useMemo(
    () =>
      [...jobs]
        .filter((j) => j.gpPerHourThisMonth !== null)
        .sort((a, b) => (b.gpPerHourThisMonth - a.gpPerHourThisMonth) * gpDir),
    [jobs, gpDir]
  )
  const tableRows = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const av = a[tableSort.key]
      const bv = b[tableSort.key]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'number') return (av - bv) * tableSort.dir
      return String(av).localeCompare(String(bv)) * tableSort.dir
    })
  }, [jobs, tableSort])

  function toggleTableSort(key) {
    setTableSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: 1 }))
  }

  const maxAbsProfit = Math.max(1, ...byProfit.map((j) => Math.abs(j.profit)))
  const maxAbsGpPerHour = Math.max(1, ...byGpPerHour.map((j) => Math.abs(j.gpPerHourThisMonth)))

  const commercial = totals.find((t) => t.category === 'Commercial')
  const residential = totals.find((t) => t.category === 'Residential')

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Monthly claims</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">This month&apos;s claims</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A snapshot of this month&apos;s claim, cost, and profit per job, projected to end of
          month — from the workbook&apos;s Claim Calculator By Month sheet.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TotalsCard total={commercial} />
        <TotalsCard total={residential} />
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <SortableHeading label="Profit this month by job" dir={profitDir} onToggle={() => setProfitDir((d) => -d)} />
        <div className="mt-3 flex flex-col">
          {byProfit.map((j) => (
            <DivergingBar
              key={j.jobNumber}
              label={j.jobName}
              value={j.profit}
              maxAbs={maxAbsProfit}
              formatValue={money}
            />
          ))}
        </div>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <SortableHeading label="GP $ per hour this month" dir={gpDir} onToggle={() => setGpDir((d) => -d)} />
        <p className="mb-4 text-[13px] text-neutral-500">
          Profit generated per labour hour logged this month — a negative value usually means
          hours were logged against the job with little or no claim recorded yet.
        </p>
        <div className="flex flex-col">
          {byGpPerHour.map((j) => (
            <DivergingBar
              key={j.jobNumber}
              label={j.jobName}
              value={j.gpPerHourThisMonth}
              maxAbs={maxAbsGpPerHour}
              formatValue={money}
            />
          ))}
        </div>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <h2 className="mb-4 text-[15px] font-medium text-neutral-100">All jobs — full figures</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {TABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.num ? 'num' : ''} sortable`}
                    onClick={() => toggleTableSort(col.key)}
                    aria-sort={
                      tableSort.key === col.key ? (tableSort.dir === 1 ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    {col.label}
                    {tableSort.key === col.key && (tableSort.dir === 1 ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((j) => (
                <tr key={j.jobNumber}>
                  <td>
                    {j.jobNumber} {j.jobName}
                  </td>
                  <td className="num tabular">{money(j.claim)}</td>
                  <td className="num tabular">{money(j.costs)}</td>
                  <td className={`num tabular ${j.profit !== null && j.profit < 0 ? 'text-red-400' : ''}`}>
                    {money(j.profit)}
                  </td>
                  <td className="num tabular">{percent(j.margin)}</td>
                  <td className="num tabular">{percent(j.quotedMargin)}</td>
                  <td className="num tabular">{percent(j.estimatedMarginEom)}</td>
                  <td className="num tabular">{money(j.gpPerHourThisMonth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
