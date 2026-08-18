import { useMemo, useState } from 'react'
import { money, percent } from '../lib/format'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// Claim and Costs used to be here too, but they're now auto-computed by
// scripts/update-jobs.mjs on every weekly upload (this month's cumulative
// minus the Deliverables Sheet's "Start of month" baseline) — genuinely
// derivable from data already on hand, unlike these four, which are
// either a business decision (Retention) or a forward-looking estimate
// (Hours/Costs to come before E.O.M) that nothing in the workbook can
// derive automatically.
const EDITABLE_FIELDS = [
  { key: 'retention', col: 5, label: 'Retention', num: true },
  { key: 'hoursToCompleteBeforeEom', col: 8, label: 'Hours to complete before E.O.M', num: true },
  { key: 'costsToComeBeforeEom', col: 9, label: 'Costs to come before E.O.M', num: true },
  { key: 'notes', col: 16, label: 'Notes', num: false },
]

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

// Retention/Costs-to-come are dollar values but not always whole/round —
// same free-typed-number convention as the checklist's dropdown, just a
// plain input instead. Saves on blur (not per-keystroke) since these are
// numbers someone might pause mid-typing, same reasoning as the Notes tab.
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

// Opens directly from clicking a job's row/card in the table below — no
// more scrolling to a separate section and re-finding the same job in a
// second, duplicate list. Password is lifted to MonthlyClaims so it's
// entered once and carries over between jobs for the rest of the session.
function ClaimCalculatorModal({ job, password, onPasswordChange, onClose }) {
  const [values, setValues] = useState(() => {
    const map = {}
    for (const field of EDITABLE_FIELDS) map[field.key] = job[field.key] ?? ''
    return map
  })
  const [savingKeys, setSavingKeys] = useState(() => new Set())
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  async function handleChange(field, newValue) {
    const previousValue = values[field.key]
    if (!password) {
      setStatus({ kind: 'error', message: 'Enter the upload password above before making changes.' })
      return
    }

    setValues((prev) => ({ ...prev, [field.key]: newValue }))
    setSavingKeys((prev) => new Set(prev).add(field.key))
    setStatus({ kind: 'idle', message: '' })

    function revert(message) {
      setValues((prev) => ({ ...prev, [field.key]: previousValue }))
      setStatus({ kind: 'error', message })
    }

    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/claim-calculator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          password,
          edits: [{ jobNumber: job.jobNumber, col: field.col, value: newValue }],
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        revert(payload.message ?? `Save failed (${res.status}) — reverted.`)
        return
      }

      setStatus({ kind: 'idle', message: `Saving "${field.label}"…` })
      const result = await pollStagedStatus(payload.staged)
      if (result.status === 'done') {
        setStatus({
          kind: 'ok',
          message: `Saved "${field.label}" — the site will redeploy in about a minute before it shows up here.`,
        })
      } else if (result.status === 'failed') {
        revert(`${result.message} — reverted.`)
      } else {
        setStatus({
          kind: 'error',
          message: `Still processing "${field.label}" after 3 minutes — check back shortly; the change may still land.`,
        })
      }
    } catch (err) {
      revert(`Could not reach the upload service: ${String(err.message ?? err)} — reverted.`)
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev)
        next.delete(field.key)
        return next
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-[18px] border border-white/10 bg-[#11161c] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-calc-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-neutral-500">{job.jobNumber}</p>
            <h3 id="claim-calc-modal-title" className="text-[15px] font-medium text-neutral-100">
              {job.jobName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            ✕
          </button>
        </div>

        <div>
          <label htmlFor="claim-calc-password" className="mb-1.5 block text-xs text-neutral-500">
            Upload password — required before any change can save
          </label>
          <input
            id="claim-calc-password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-green/50 focus:outline-none"
          />
        </div>

        {status.message && (
          <p className={`text-sm ${status.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
            {status.message}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {EDITABLE_FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={`claim-calc-${field.key}`} className="mb-1 block text-[12px] text-neutral-500">
                {field.label}
              </label>
              <EditableCell
                id={`claim-calc-${field.key}`}
                value={values[field.key]}
                saving={savingKeys.has(field.key)}
                numeric={field.num}
                onChange={(newValue) => handleChange(field, newValue)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const TABLE_COLUMNS = [
  { key: 'jobNumber', label: 'Job #' },
  { key: 'jobName', label: 'Job name' },
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

  // Lifted here (rather than living inside the modal) so it's entered once
  // and carries over between jobs for the rest of the session, instead of
  // re-typing the password every time a different job is opened.
  const [password, setPassword] = useState('')
  const [editingJob, setEditingJob] = useState(null)

  const [profitDir, setProfitDir] = useState(1) // 1 = highest first, -1 = lowest first
  const [gpDir, setGpDir] = useState(1)
  // Default to margin ascending (worst first) rather than profit descending
  // (best first) — for a full per-job table, "which jobs are underperforming"
  // is the more actionable starting question than "which job made the most".
  const [tableSort, setTableSort] = useState({ key: 'margin', dir: 1 })

  // Every job in the workbook gets a row on the "Claim Calculator By Month"
  // sheet whether or not it was claimed against this month — most fields
  // (claim, costs, profit, margin, GP $/hr) just come out as flat zero for
  // a job with no monthly activity. Repeating the full job list here, with
  // most of it zeroed out, duplicates the Job Directory without adding
  // anything a claim-focused view needs. Jobs actually claimed against
  // this month are the ones worth showing.
  const activeJobs = useMemo(() => jobs.filter((j) => j.claim !== 0 || j.costs !== 0), [jobs])
  const inactiveCount = jobs.length - activeJobs.length

  const byProfit = useMemo(
    () => [...activeJobs].filter((j) => j.profit !== null).sort((a, b) => (b.profit - a.profit) * profitDir),
    [activeJobs, profitDir]
  )
  const byGpPerHour = useMemo(
    () =>
      [...activeJobs]
        .filter((j) => j.gpPerHourThisMonth !== null)
        .sort((a, b) => (b.gpPerHourThisMonth - a.gpPerHourThisMonth) * gpDir),
    [activeJobs, gpDir]
  )
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
        <div className="mb-4">
          <h2 className="text-[15px] font-medium text-neutral-100">Jobs claimed this month — full figures</h2>
          <p className="mt-1 text-[12px] text-neutral-500">
            Click a job to edit its retention, estimates, and notes.
            {inactiveCount > 0 && (
              <>
                {' '}
                {inactiveCount} other job{inactiveCount === 1 ? '' : 's'} with no claim this month{' '}
                {inactiveCount === 1 ? 'is' : 'are'} hidden — use the picker below to edit one of those.
              </>
            )}
          </p>
        </div>
        {/* Mobile: one stacked card per job with the headline figures,
            instead of a wide table that'd need horizontal scrolling. */}
        <div className="flex flex-col gap-3 sm:hidden">
          {tableRows.map((j) => (
            <button
              key={j.jobNumber}
              type="button"
              onClick={() => setEditingJob(j)}
              className="flex flex-col gap-2 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4 text-left transition-colors hover:border-brand-green/30 hover:bg-white/[0.04]"
            >
              <p className="text-[14px] font-medium text-white">
                <span className="text-neutral-500">{j.jobNumber}</span> {j.jobName}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <span className="text-neutral-500">Claim</span>
                <span className="text-right tabular-nums text-neutral-200">{money(j.claim)}</span>
                <span className="text-neutral-500">Costs</span>
                <span className="text-right tabular-nums text-neutral-200">{money(j.costs)}</span>
                <span className="text-neutral-500">Profit</span>
                <span className={`text-right tabular-nums ${j.profit !== null && j.profit < 0 ? 'text-red-400' : 'text-neutral-200'}`}>
                  {money(j.profit)}
                </span>
                <span className="text-neutral-500">Margin</span>
                <span className="text-right tabular-nums text-neutral-200">{percent(j.margin)}</span>
              </div>
            </button>
          ))}
          {tableRows.length === 0 && <p className="empty-row">No jobs to show.</p>}
        </div>

        <div className="table-scroll hidden sm:block">
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
                <tr
                  key={j.jobNumber}
                  onClick={() => setEditingJob(j)}
                  className="cursor-pointer transition-colors hover:bg-white/[0.04]"
                >
                  <td className="whitespace-nowrap">{j.jobNumber}</td>
                  <td>{j.jobName}</td>
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

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <h2 className="mb-3 text-[15px] font-medium text-neutral-100">Edit a different job</h2>
        <p className="mb-3 text-[12px] text-neutral-500">
          Includes jobs with no claim recorded this month — pick one to set its retention,
          estimates, or notes.
        </p>
        <select
          value=""
          onChange={(e) => {
            const job = jobs.find((j) => j.jobNumber === e.target.value)
            if (job) setEditingJob(job)
          }}
          className="w-full max-w-sm rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-green/50 focus:outline-none"
        >
          <option value="" disabled>
            Select a job…
          </option>
          {jobs.map((j) => (
            <option key={j.jobNumber} value={j.jobNumber}>
              {j.jobNumber} {j.jobName}
            </option>
          ))}
        </select>
      </div>

      {editingJob && (
        <ClaimCalculatorModal
          job={editingJob}
          password={password}
          onPasswordChange={setPassword}
          onClose={() => setEditingJob(null)}
        />
      )}
    </div>
  )
}
