import { useMemo, useState } from 'react'
import { money, percent } from '../lib/format'
import { saveClaimField } from '../lib/claimFieldsStore'
import { useSharedState } from '../lib/useSharedState'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import CollapsibleSection from './CollapsibleSection'
import DataTable from './table/DataTable'
import { useDataTable } from './table/useDataTable'

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
      className="w-full min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[12.5px] text-neutral-200 [appearance:textfield] focus:border-brand-green/50 focus:outline-none disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  )
}

// Job/Job name are frozen (see .sticky-col in App.css) so they stay in
// view while the rest of the row scrolls sideways — same pattern as
// Upcoming work's frozen leading columns.
const STICKY_WIDTHS = [80, 200]

function hours(v) {
  return v === null ? '—' : v.toFixed(1)
}

const READONLY_COLUMNS = [
  { key: 'costs', label: 'Cost of month', num: true, format: money },
  { key: 'hoursThisMonth', label: 'Hours', num: true, format: hours },
  { key: 'quotedGpPerHour', label: 'Quoted GP $/hr', num: true, format: money },
  { key: 'hoursToComeCost', label: 'Hours to come cost', num: true, format: money },
  // Total cost with the gross profit taken back out — the cost side on its own.
  // Placed immediately before GP to add so the three columns read as the sum
  // they are: cost excl. GP + GP to add = Total cost.
  { key: 'costExclGp', label: 'Cost excl. GP', num: true, format: money },
  // (hours this month + hours to come) x quoted GP $/hr. This is the gross profit
  // added on top of cost to reach Total cost, so it is named for what it does
  // rather than for the hours it is derived from.
  { key: 'gpToAdd', label: 'GP to add', num: true, format: money },
]

// "Total cost" is the answer this whole calculator produces, but it sat
// second-to-last in a table twelve columns wide — so while you were typing
// into Ret% / Hours to come / Cost to come on the left, the number those
// inputs change was off-screen to the right. Pulled out, moved to the end
// and pinned to the right edge, so the inputs and the result are visible
// together.
// Cost of month / Hours / Quoted GP $/hr stay; these three only show the sum
// behind Total cost, and come back with "Show workings".
const WORKINGS = new Set(['hoursToComeCost', 'costExclGp', 'gpToAdd'])

const TOTAL_COLUMN = { key: 'total', label: 'Total cost', num: true, format: money }
const GROUPS = [
  { key: 'month', label: 'This month', flat: true },
  { key: 'workings', label: 'Workings behind Total cost', flat: true },
]

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function MonthlyClaims({ monthlyClaims, jobs: allJobs, monthlyHours, onBack }) {
  const { jobs } = monthlyClaims

  // The Claim Calculator sheet's own "Hours this month" cell is hand-typed
  // and drifts out of date/goes negative when it isn't kept in sync — the
  // hours log derives this month's hours from each week's real
  // cumulative-hours upload instead, so it's never manually stale.
  const hoursThisMonthByJob = useMemo(() => {
    const map = new Map()
    const monthKey = currentMonthKey()
    for (const j of monthlyHours.jobs) map.set(j.jobNumber, j.hoursByMonth[monthKey] ?? null)
    return map
  }, [monthlyHours])


  // A job with no claim and no cost this month is hidden by default (see
  // below), which is right for reading the month but wrong for entering it:
  // a job added mid-month has nothing against it yet, so it was hidden, so
  // there was nowhere to type its first figures — and it stayed hidden. This
  // toggle is the way out of that. Remembered per browser because whoever is
  // doing data entry wants it on for the whole session, and whoever is
  // reading the month wants it off.
  const [showAllJobs, setShowAllJobs] = useLocalStorageState('monthlyClaims.showAllJobs', false)
  // The first of a new month nothing has been claimed or costed yet, so "only
  // claimed jobs" would be an empty table with nothing to type into. Until
  // something is claimed, every job is listed.
  const newMonth = jobs.length > 0 && jobs.every((j) => j.claim === 0 && j.costs === 0)
  // The three columns that are just workings behind Total cost start hidden
  // (the shared table remembers per column; the old on/off key seeds it once).
  const workingsWereShown = useMemo(() => { try { return localStorage.getItem('monthlyClaims.showWorkings') === 'true' } catch { return false } }, [])

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

    // Straight to KV. These four are typed in rather than exported, and
    // nothing in the workbook calculates from them — the projections below
    // are worked out from whatever value this page holds.
    const saved = await saveClaimField(job.jobNumber, field.key, newValue)
    if (saved) {
      setStatus({
        kind: 'ok',
        message: `Saved "${field.label}" for ${job.jobNumber} ${job.jobName}.`,
      })
    } else {
      revert('Could not save — nothing was changed.')
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
  const [avgHourlyRate, setAvgHourlyRate] = useSharedState('planning:avg-hourly-rate', 'monthlyClaims.avgHourlyRate', '40')
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
        .filter((j) => showAllJobs || newMonth || j.claim !== 0 || j.costs !== 0)
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
          const gpToAdd = (hoursActual + hoursToCome) * (quotedGpPerHour ?? 0)
          const retentionAddOn = retention ? (retention / 100) * costOfMonth : 0
          // Derived by subtraction rather than re-adding the four cost terms, so
          // it cannot drift out of step with Total cost if that formula changes.
          const total = costOfMonth + hoursToComeCost + costsToCome + gpToAdd + retentionAddOn
          const costExclGp = total - gpToAdd
          return {
            ...j,
            retention,
            hoursToCompleteBeforeEom,
            costsToComeBeforeEom,
            notes,
            hoursThisMonth,
            quotedGpPerHour,
            hoursToComeCost,
            costExclGp,
            gpToAdd,
            retentionAddOn,
            total,
          }
        }),
    [jobs, quotedGpPerHourByJob, hoursThisMonthByJob, rate, fieldOverrides, showAllJobs, newMonth]
  )
  const inactiveCount = jobs.filter((j) => j.claim === 0 && j.costs === 0).length
  // Editable cells save on blur; the id keeps the input stable between renders.
  const editable = (field, extra) => (j) => (
    <>
      <EditableCell
        id={`claim-calc-table-${j.jobNumber}-${field.key}`}
        value={j[field.key] ?? ''}
        saving={savingKeys.has(`${j.jobNumber}:${field.key}`)}
        numeric={field.num}
        onChange={(newValue) => saveField(j, field, newValue)}
      />
      {extra?.(j)}
    </>
  )
  const columns = useMemo(() => [
    { key: 'jobNumber', label: 'Job #', sticky: true, width: STICKY_WIDTHS[0], always: true, cellClass: 'whitespace-nowrap' },
    { key: 'jobName', label: 'Job name', text: true, sticky: true, width: STICKY_WIDTHS[1], always: true },
    { key: 'retention', label: 'Ret%', num: true, sortable: false, always: true, cellClass: 'w-[72px] min-w-[72px] p-1',
      render: editable(EDITABLE_FIELDS[0], (j) => (j.retentionAddOn
        ? <p className="mt-0.5 text-right text-[11px] tabular-nums text-neutral-400">{money(j.retentionAddOn)}</p> : null)) },
    ...READONLY_COLUMNS.slice(0, 2).map((c) => ({ key: c.key, label: c.label, num: true, fmt: c.format, group: 'month' })),
    // Sorted by margin, worst first, by default — "which jobs are underperforming"
    // is the more useful starting question than "which made the most".
    { key: 'margin', label: 'Margin', num: true, fmt: percent, group: 'month' },
    { key: 'hoursToCompleteBeforeEom', label: 'Hours to come', num: true, sortable: false, always: true, cellClass: 'w-[72px] min-w-[72px] p-1', render: editable(EDITABLE_FIELDS[1]) },
    { key: 'costsToComeBeforeEom', label: 'Cost to come', num: true, sortable: false, always: true, cellClass: 'w-[72px] min-w-[72px] p-1', render: editable(EDITABLE_FIELDS[2]) },
    ...READONLY_COLUMNS.slice(2).map((c) => ({ key: c.key, label: c.label, num: true, fmt: c.format, group: WORKINGS.has(c.key) ? 'workings' : 'month' })),
    { key: 'notes', label: 'Notes', sortable: false, always: true, cellClass: 'min-w-[120px] p-1', render: editable(EDITABLE_FIELDS[3]) },
    { key: 'total', label: TOTAL_COLUMN.label, num: true, always: true, stickyRight: true, cellClass: 'text-[14px] font-semibold text-white', fmt: money },
  ], [savingKeys]) // eslint-disable-line react-hooks/exhaustive-deps
  const table = useDataTable({
    id: 'monthlyClaims', columns, rows: activeJobs,
    defaultSort: { key: 'margin', dir: 1 },
    defaultHidden: workingsWereShown ? [] : [...WORKINGS],
  })
  const tableRows = table.rows
  const workingsHidden = [...WORKINGS].every((k) => table.hidden.has(k))

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
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

      <CollapsibleSection
        className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
        storageKey="monthly-claims.jobs"
        title="Jobs claimed this month — full figures"
        description={
          <>
            Type into Ret%, Hours to come, Cost to come or Notes to save — no need to open
            anything first.{' '}
            {newMonth
              ? "It's a new month and nothing is claimed yet, so every job is listed to type figures into."
              : inactiveCount > 0 && (
                <>
                  {inactiveCount} job{inactiveCount === 1 ? '' : 's'} with nothing claimed or costed
                  this month {showAllJobs ? 'are shown' : 'are hidden — use the button to show them'}.
                </>
              )}
            <details className="mt-1">
              <summary className="cursor-pointer text-neutral-300">How Total cost is worked out</summary>
              Total cost = cost of month + (hours to come × the rate here) + cost to come +
              ((hours actual + hours to come) × quoted GP $/hr), plus retention % of cost of month
              if set. Cost excl. GP is that total with the gross profit taken back out, so Cost
              excl. GP + GP to add = Total cost.
            </details>
          </>
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => table.toggleGroup([...WORKINGS])}
              aria-pressed={!workingsHidden}
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-brand-green/50 hover:text-white"
            >
              {workingsHidden ? 'Show workings' : 'Hide workings'}
            </button>
            {inactiveCount > 0 && !newMonth && (
              <button
                type="button"
                onClick={() => setShowAllJobs(!showAllJobs)}
                aria-pressed={showAllJobs}
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-brand-green/50 hover:text-white"
              >
                {showAllJobs ? 'Show only claimed jobs' : `Show all ${jobs.length} jobs`}
              </button>
            )}
            <div>
              <label htmlFor="avg-hourly-rate" className="mb-1 block text-[12px] text-neutral-400">
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
        }
      >

        {/* Mobile: one stacked card per job with the headline figures plus
            the same inline editable fields as the desktop table. */}
        <div className="mt-4 flex flex-col gap-3 sm:hidden">
          {tableRows.map((j) => (
            <div
              key={j.jobNumber}
              className="flex flex-col gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <p className="text-[14px] font-medium text-white">
                <span className="text-neutral-400">{j.jobNumber}</span> {j.jobName}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <span className="text-neutral-400">Claim this month</span>
                <span className="text-right tabular-nums text-neutral-200">{money(j.claim)}</span>
                <span className="text-neutral-400">Costs this month</span>
                <span className="text-right tabular-nums text-neutral-200">{money(j.costs)}</span>
                <span className="text-neutral-400">Profit</span>
                <span className={`text-right tabular-nums ${j.profit !== null && j.profit < 0 ? 'text-red-400' : 'text-neutral-200'}`}>
                  {money(j.profit)}
                </span>
                <span className="text-neutral-400">Margin</span>
                <span className="text-right tabular-nums text-neutral-200">{percent(j.margin)}</span>
                <span className="text-neutral-400">Total cost</span>
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

        <DataTable
          table={table}
          groups={GROUPS}
          compact
          rowKey={(j) => j.jobNumber}
          exportName="monthly-claims"
          emptyText="No jobs to show."
          toolbar={<span className="text-[12px] text-neutral-500">Type into Ret%, Hours to come, Cost to come or Notes to save.</span>}
        />
      </CollapsibleSection>
    </div>
  )
}
