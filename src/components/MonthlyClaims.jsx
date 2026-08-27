import { useMemo, useState } from 'react'
import { money, percent } from '../lib/format'
import { saveEdit } from '../lib/saveEdit'
import { useLocalStorageState } from '../lib/useLocalStorageState'

// Claim and Costs used to be here too, but they're now auto-computed by
// scripts/update-jobs.mjs on every weekly upload (this month's cumulative
// minus the Deliverables Sheet's "Start of month" baseline) — genuinely
// derivable from data already on hand, unlike these four, which are
// either a business decision (Retention) or a forward-looking estimate
// (Hours/Costs to come before E.O.M) that nothing in the workbook can
// derive automatically. Edited directly in the table now — a box to type
// into, not a click-to-open-modal step in between.
const EDITABLE_FIELDS = [
  { key: 'retention', col: 5, label: 'Retention %', num: true },
  { key: 'hoursToCompleteBeforeEom', col: 8, label: 'Hours to complete before E.O.M', num: true },
  { key: 'costsToComeBeforeEom', col: 9, label: 'Costs to come before E.O.M', num: true },
  { key: 'notes', col: 16, label: 'Notes', num: false },
]

// Saves on blur (not per-keystroke) since these are numbers/notes someone
// might pause mid-typing — matches the same convention used everywhere else
// on this dashboard (checklist dropdowns, Upcoming work's hour cells).
function EditableCell({ id, value, saving, numeric, onChange }) {
  const [text, setText] = useState(value)

  return (
    <input
      id={id}
      type={numeric ? 'number' : 'text'}
      value={text}
      disabled={saving}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onChange(text)
      }}
      className="w-full min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none disabled:opacity-50"
    />
  )
}

// Job/Job name are frozen (see .sticky-col in App.css) so they stay in
// view while the rest of the row scrolls sideways — same pattern as
// Upcoming work's frozen leading columns.
const STICKY_WIDTHS = [80, 200]
const STICKY_LEFTS = [0, STICKY_WIDTHS[0]]

function hours(v) {
  return v === null ? '—' : v.toFixed(1)
}

const READONLY_COLUMNS = [
  { key: 'costs', label: 'Cost of month', num: true, format: money },
  { key: 'hoursThisMonth', label: 'Hours', num: true, format: hours },
  { key: 'quotedGpPerHour', label: 'Quoted GP $/hr', num: true, format: money },
  { key: 'hoursToComeCost', label: 'Hours to come cost', num: true, format: money },
  { key: 'quotedHoursValue', label: 'Quoted hours value', num: true, format: money },
  { key: 'total', label: 'Total cost', num: true, format: money },
]

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function MonthlyClaims({ monthlyClaims, jobs: allJobs, monthlyHours, onBack }) {
  const { jobs } = monthlyClaims

  // The Claim Calculator sheet's own "Hours this month" cell is hand-typed
  // and drifts out of date/goes negative when it isn't kept in sync — the
  // hours log (same source "Hours by month" uses) derives this month's
  // hours from each week's real cumulative-hours upload instead, so it's
  // never manually stale.
  const hoursThisMonthByJob = useMemo(() => {
    const map = new Map()
    const monthKey = currentMonthKey()
    for (const j of monthlyHours.jobs) map.set(j.jobNumber, j.hoursByMonth[monthKey] ?? null)
    return map
  }, [monthlyHours])

  // Default to margin ascending (worst first) rather than profit descending
  // (best first) — for a full per-job table, "which jobs are underperforming"
  // is the more actionable starting question than "which job made the most".
  const [tableSort, setTableSort] = useState({ key: 'margin', dir: 1 })

  // In-session optimistic edits to the four manual fields, applied straight
  // in the table the instant you type — saveEdit() itself also writes an
  // instant, cross-device KV overlay (src/lib/overrides.js) that
  // loadWorkbook.js reads back on the next load, so this is really just
  // for not waiting on that round trip within the current page view.
  const [fieldOverrides, setFieldOverrides] = useState({})
  const [savingKeys, setSavingKeys] = useState(() => new Set())
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  async function saveField(job, field, newValue) {
    const cellKey = `${job.jobNumber}:${field.key}`
    const previousValue = fieldOverrides[job.jobNumber]?.[field.key] ?? job[field.key] ?? ''
    if (newValue === previousValue) return

    setFieldOverrides((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [field.key]: newValue } }))
    setSavingKeys((prev) => new Set(prev).add(cellKey))
    setStatus({ kind: 'idle', message: `Saving "${field.label}" for ${job.jobNumber} ${job.jobName}…` })

    function revert(message) {
      setFieldOverrides((prev) => ({
        ...prev,
        [job.jobNumber]: { ...prev[job.jobNumber], [field.key]: previousValue },
      }))
      setStatus({ kind: 'error', message })
    }

    const result = await saveEdit('claim-calculator', job.jobNumber, field.col, newValue)
    if (result.status === 'done') {
      setStatus({
        kind: 'ok',
        message: `Saved "${field.label}" for ${job.jobNumber} ${job.jobName} — synced everywhere already; the workbook catches up in the background.`,
      })
    } else if (result.status === 'failed' || result.status === 'error') {
      revert(`${result.message} — reverted.`)
    } else {
      setStatus({ kind: 'error', message: result.message })
    }
    setSavingKeys((prev) => {
      const next = new Set(prev)
      next.delete(cellKey)
      return next
    })
  }

  // Quoted GP $/hr is a per-job quote figure (from the Deliverables Sheet),
  // not something the Claim Calculator By Month sheet itself tracks — pull
  // it in from the Job Directory's own data, matched by job number.
  const quotedGpPerHourByJob = useMemo(() => {
    const map = new Map()
    for (const j of allJobs) map.set(j.jobNumber, j.quotedGpPerHour ?? null)
    return map
  }, [allJobs])

  // A single company-wide $/hr rate, set by hand every ~6 months (not
  // per-job, not derived from the workbook) — used below to turn "hours to
  // come" into a projected dollar cost. Defaults to 40 (the real
  // Claim Calculator sheet's own rate, confirmed against its formulas —
  // =(HoursToComplete*40)+CostsToCome) rather than blank — blank meant
  // this silently fell out of the total (rate defaulting to 0) until
  // someone happened to type a value in.
  const [avgHourlyRate, setAvgHourlyRate] = useLocalStorageState('monthlyClaims.avgHourlyRate', '40')
  const rate = Number(avgHourlyRate) || 0

  // Every job in the workbook gets a row on the "Claim Calculator By Month"
  // sheet whether or not it was claimed against this month — most fields
  // (claim, costs, profit, margin, GP $/hr) just come out as flat zero for
  // a job with no monthly activity. Repeating the full job list here, with
  // most of it zeroed out, duplicates the Job Directory without adding
  // anything a claim-focused view needs. Jobs actually claimed against
  // this month are the ones worth showing.
  //
  // Total cost = cost of month
  //            + (hours to come × the rate above)
  //            + cost to come
  //            + ((hours actual + hours to come) × quoted GP $/hr)
  //            + (retention % × cost of month), if a retention % is set
  const activeJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.claim !== 0 || j.costs !== 0)
        .map((j) => {
          const override = fieldOverrides[j.jobNumber]
          const retention = override?.retention !== undefined ? Number(override.retention) || 0 : j.retention
          const hoursToCompleteBeforeEom =
            override?.hoursToCompleteBeforeEom !== undefined
              ? Number(override.hoursToCompleteBeforeEom) || 0
              : j.hoursToCompleteBeforeEom
          const costsToComeBeforeEom =
            override?.costsToComeBeforeEom !== undefined
              ? Number(override.costsToComeBeforeEom) || 0
              : j.costsToComeBeforeEom
          const notes = override?.notes !== undefined ? override.notes : j.notes
          const hoursThisMonth = hoursThisMonthByJob.get(j.jobNumber) ?? j.hoursThisMonth

          const quotedGpPerHour = quotedGpPerHourByJob.get(j.jobNumber) ?? null
          const hoursToCome = hoursToCompleteBeforeEom ?? 0
          const hoursActual = hoursThisMonth ?? 0
          const costsToCome = costsToComeBeforeEom ?? 0
          const costOfMonth = j.costs ?? 0
          const hoursToComeCost = hoursToCome * rate
          const quotedHoursValue = (hoursActual + hoursToCome) * (quotedGpPerHour ?? 0)
          const retentionAddOn = retention ? (retention / 100) * costOfMonth : 0
          const total = costOfMonth + hoursToComeCost + costsToCome + quotedHoursValue + retentionAddOn
          return {
            ...j,
            retention,
            hoursToCompleteBeforeEom,
            costsToComeBeforeEom,
            notes,
            hoursThisMonth,
            quotedGpPerHour,
            hoursToComeCost,
            quotedHoursValue,
            retentionAddOn,
            total,
          }
        }),
    [jobs, quotedGpPerHourByJob, hoursThisMonthByJob, rate, fieldOverrides]
  )
  const inactiveCount = jobs.length - activeJobs.length

  const tableRows = useMemo(() => {
    return [...activeJobs].sort((a, b) => {
      const av = a[tableSort.key]
      const bv = b[tableSort.key]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'number') return (av - bv) * tableSort.dir
      return String(av).localeCompare(String(bv)) * tableSort.dir
    })
  }, [activeJobs, tableSort])

  function toggleTableSort(key) {
    setTableSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: 1 }))
  }

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

      {status.message && (
        <p className={`text-sm ${status.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
          {status.message}
        </p>
      )}

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-medium text-neutral-100">Jobs claimed this month — full figures</h2>
            <p className="mt-1 text-[12px] text-neutral-500">
              Type into Ret%, Hours to come, Cost to come, or Notes to save — no need to open
              anything first. Total cost = cost of month + (hours to come × the rate here) + cost
              to come + ((hours actual + hours to come) × quoted GP $/hr), plus retention % of
              cost of month if set.
              {inactiveCount > 0 && (
                <> {inactiveCount} other job{inactiveCount === 1 ? '' : 's'} with no claim this month {inactiveCount === 1 ? 'is' : 'are'} hidden.</>
              )}
            </p>
          </div>
          <div>
            <label htmlFor="avg-hourly-rate" className="mb-1 block text-[12px] text-neutral-500">
              Average $/hr rate (reviewed every 6 months)
            </label>
            <input
              id="avg-hourly-rate"
              type="number"
              value={avgHourlyRate}
              onChange={(e) => setAvgHourlyRate(e.target.value)}
              placeholder="e.g. 65"
              className="w-36 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-neutral-200 focus:border-brand-green/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Mobile: one stacked card per job with the headline figures plus
            the same inline editable fields as the desktop table. */}
        <div className="flex flex-col gap-3 sm:hidden">
          {tableRows.map((j) => (
            <div
              key={j.jobNumber}
              className="flex flex-col gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <p className="text-[14px] font-medium text-white">
                <span className="text-neutral-500">{j.jobNumber}</span> {j.jobName}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <span className="text-neutral-500">Claim this month</span>
                <span className="text-right tabular-nums text-neutral-200">{money(j.claim)}</span>
                <span className="text-neutral-500">Costs this month</span>
                <span className="text-right tabular-nums text-neutral-200">{money(j.costs)}</span>
                <span className="text-neutral-500">Profit</span>
                <span className={`text-right tabular-nums ${j.profit !== null && j.profit < 0 ? 'text-red-400' : 'text-neutral-200'}`}>
                  {money(j.profit)}
                </span>
                <span className="text-neutral-500">Margin</span>
                <span className="text-right tabular-nums text-neutral-200">{percent(j.margin)}</span>
                <span className="text-neutral-500">Total cost</span>
                <span className="text-right tabular-nums font-medium text-white">{money(j.total)}</span>
              </div>
              <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                {EDITABLE_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-neutral-400">
                      {field.label}
                      {field.key === 'retention' && j.retentionAddOn ? ` (${money(j.retentionAddOn)})` : ''}
                    </span>
                    <div className="w-28 shrink-0">
                      <EditableCell
                        id={`claim-calc-mobile-${j.jobNumber}-${field.key}`}
                        value={j[field.key] ?? ''}
                        saving={savingKeys.has(`${j.jobNumber}:${field.key}`)}
                        numeric={field.num}
                        onChange={(newValue) => saveField(j, field, newValue)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {tableRows.length === 0 && <p className="empty-row">No jobs to show.</p>}
        </div>

        <div className="table-scroll hidden sm:block">
          <table className="data-table">
            <thead>
              <tr>
                <th
                  className="sortable sticky-col"
                  style={{ left: STICKY_LEFTS[0], minWidth: STICKY_WIDTHS[0] }}
                  onClick={() => toggleTableSort('jobNumber')}
                  aria-sort={tableSort.key === 'jobNumber' ? (tableSort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                >
                  Job #{tableSort.key === 'jobNumber' && (tableSort.dir === 1 ? ' ▲' : ' ▼')}
                </th>
                <th
                  className="sortable sticky-col sticky-col-end"
                  style={{ left: STICKY_LEFTS[1], minWidth: STICKY_WIDTHS[1] }}
                  onClick={() => toggleTableSort('jobName')}
                  aria-sort={tableSort.key === 'jobName' ? (tableSort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                >
                  Job name{tableSort.key === 'jobName' && (tableSort.dir === 1 ? ' ▲' : ' ▼')}
                </th>
                <th className="num">Ret%</th>
                {READONLY_COLUMNS.slice(0, 2).map((col) => (
                  <th
                    key={col.key}
                    className="num sortable"
                    onClick={() => toggleTableSort(col.key)}
                    aria-sort={tableSort.key === col.key ? (tableSort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  >
                    {col.label}
                    {tableSort.key === col.key && (tableSort.dir === 1 ? ' ▲' : ' ▼')}
                  </th>
                ))}
                <th className="num">Hours to come</th>
                <th className="num">Cost to come</th>
                {READONLY_COLUMNS.slice(2).map((col) => (
                  <th
                    key={col.key}
                    className="num sortable"
                    onClick={() => toggleTableSort(col.key)}
                    aria-sort={tableSort.key === col.key ? (tableSort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  >
                    {col.label}
                    {tableSort.key === col.key && (tableSort.dir === 1 ? ' ▲' : ' ▼')}
                  </th>
                ))}
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((j) => (
                <tr key={j.jobNumber}>
                  <td className="sticky-col whitespace-nowrap" style={{ left: STICKY_LEFTS[0], minWidth: STICKY_WIDTHS[0] }}>
                    {j.jobNumber}
                  </td>
                  <td className="sticky-col sticky-col-end" style={{ left: STICKY_LEFTS[1], minWidth: STICKY_WIDTHS[1] }}>
                    {j.jobName}
                  </td>
                  <td className="min-w-[90px] p-1">
                    <EditableCell
                      id={`claim-calc-table-${j.jobNumber}-retention`}
                      value={j.retention ?? ''}
                      saving={savingKeys.has(`${j.jobNumber}:retention`)}
                      numeric
                      onChange={(newValue) => saveField(j, EDITABLE_FIELDS[0], newValue)}
                    />
                    {j.retentionAddOn ? (
                      <p className="mt-0.5 text-right text-[11px] tabular-nums text-neutral-500">
                        {money(j.retentionAddOn)}
                      </p>
                    ) : null}
                  </td>
                  {READONLY_COLUMNS.slice(0, 2).map((col) => (
                    <td key={col.key} className="num tabular">
                      {col.format(j[col.key])}
                    </td>
                  ))}
                  <td className="min-w-[90px] p-1">
                    <EditableCell
                      id={`claim-calc-table-${j.jobNumber}-hoursToCompleteBeforeEom`}
                      value={j.hoursToCompleteBeforeEom ?? ''}
                      saving={savingKeys.has(`${j.jobNumber}:hoursToCompleteBeforeEom`)}
                      numeric
                      onChange={(newValue) => saveField(j, EDITABLE_FIELDS[1], newValue)}
                    />
                  </td>
                  <td className="min-w-[90px] p-1">
                    <EditableCell
                      id={`claim-calc-table-${j.jobNumber}-costsToComeBeforeEom`}
                      value={j.costsToComeBeforeEom ?? ''}
                      saving={savingKeys.has(`${j.jobNumber}:costsToComeBeforeEom`)}
                      numeric
                      onChange={(newValue) => saveField(j, EDITABLE_FIELDS[2], newValue)}
                    />
                  </td>
                  {READONLY_COLUMNS.slice(2).map((col) => (
                    <td key={col.key} className="num tabular">
                      {col.format(j[col.key])}
                    </td>
                  ))}
                  <td className="min-w-[160px] p-1">
                    <EditableCell
                      id={`claim-calc-table-${j.jobNumber}-notes`}
                      value={j.notes ?? ''}
                      saving={savingKeys.has(`${j.jobNumber}:notes`)}
                      numeric={false}
                      onChange={(newValue) => saveField(j, EDITABLE_FIELDS[3], newValue)}
                    />
                  </td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="empty-row">
                    No jobs to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
