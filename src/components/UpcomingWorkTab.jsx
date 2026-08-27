import { useState } from 'react'
import { saveEdit } from '../lib/saveEdit'
import { roundHours } from '../lib/format'
import { useLocalStorageState } from '../lib/useLocalStorageState'

// Jan-Dec hours-allocation columns (cols F-Q, 0-indexed 5-16) plus the
// notes column (S, 0-indexed 18) — the only manual entry on this sheet.
// Job identity and Quoted/Used/Remaining hours are formulas and are never
// written to from here.
const MONTH_FIELDS = [
  { key: 'Jan', num: 1, col: 5 }, { key: 'Feb', num: 2, col: 6 }, { key: 'Mar', num: 3, col: 7 },
  { key: 'Apr', num: 4, col: 8 }, { key: 'May', num: 5, col: 9 }, { key: 'Jun', num: 6, col: 10 },
  { key: 'Jul', num: 7, col: 11 }, { key: 'Aug', num: 8, col: 12 }, { key: 'Sep', num: 9, col: 13 },
  { key: 'Oct', num: 10, col: 14 }, { key: 'Nov', num: 11, col: 15 }, { key: 'Dec', num: 12, col: 16 },
]
const NOTES_COL = 18

// Left offsets (px) for the frozen leading columns — job identity plus the
// three hours columns — so they stay put while the Jan-Dec months scroll
// underneath. Widths here match the min-widths given to those columns below.
const STICKY_WIDTHS = [220, 100, 100, 110]
const STICKY_LEFTS = STICKY_WIDTHS.reduce((acc, w, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + STICKY_WIDTHS[i - 1])
  return acc
}, [])

function EditableCell({ value, saving, numeric, onChange }) {
  const [text, setText] = useState(value)
  return (
    <input
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

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function EditableCapacityCell({ value, onChange }) {
  const [text, setText] = useState(value ?? '')
  return (
    <input
      type="number"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text)
        if (text !== '' && Number.isFinite(n) && n !== value) onChange(n)
        else if (text === '' && value !== null) onChange(null)
      }}
      className="w-16 min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 text-right text-[13px] tabular-nums text-neutral-200 focus:border-brand-green/50 focus:outline-none"
    />
  )
}

// Capacity summary — reproduces the sheet's own rows 70-77, which were
// never surfaced anywhere in the app before: per month, is the work
// already planned (Total hours, summed from every job's monthly
// allocation) more than the crew can actually cover (Hours available =
// staff on tools × working days × 8h × 0.8 productive-time factor)?
// Balance is the difference — negative months are short-staffed.
//
// Working days / Staff on tools are editable here, but ONLY saved to
// this browser (localStorage) — the real edit pipeline (saveEdit / the
// upload worker / scripts/update-jobs.mjs) only knows how to address a
// row by matching a job number in column A, and these two rows have no
// job number at all (they're fixed physical rows, not one-per-job).
// Wiring up real round-trip persistence for them would mean teaching
// that whole pipeline a second, row-number-based addressing mode —
// planning-only for now rather than half-building that untested.
// Editing either one recomputes Hours available/Balance live for
// whichever months you've overridden; everything else still reflects
// the workbook's own values.
function CapacityPanel({ capacity, usedHoursByMonth }) {
  const [servicingOverrides, setServicingOverrides] = useLocalStorageState(
    'upcomingWork.servicingOverrides',
    {}
  )
  const [workingDaysOverrides, setWorkingDaysOverrides] = useLocalStorageState(
    'upcomingWork.workingDaysOverrides',
    {}
  )
  const [staffOnToolsOverrides, setStaffOnToolsOverrides] = useLocalStorageState(
    'upcomingWork.staffOnToolsOverrides',
    {}
  )

  if (!capacity) return null

  function servicingFor(m) {
    return servicingOverrides[m] !== undefined ? servicingOverrides[m] : capacity.servicingHours[m]
  }
  function workingDaysFor(m) {
    return workingDaysOverrides[m] !== undefined ? workingDaysOverrides[m] : capacity.workingDays[m]
  }
  function staffOnToolsFor(m) {
    return staffOnToolsOverrides[m] !== undefined ? staffOnToolsOverrides[m] : capacity.staffOnTools[m]
  }
  function hoursAvailableFor(m) {
    const days = workingDaysFor(m)
    const staff = staffOnToolsFor(m)
    return days !== null && days !== undefined && staff !== null && staff !== undefined
      ? staff * days * 8 * 0.8
      : capacity.hoursAvailable[m]
  }
  // Total hours planned = Used hours (actual, from the log) + Servicing
  // (the sheet's fixed monthly allowance for any job under 30 hours) —
  // null for a month with no logged Used hours yet, since there's nothing
  // to add Servicing to.
  function totalHoursFor(m) {
    const used = usedHoursByMonth[m]
    const servicing = servicingFor(m)
    return used === null || servicing === null || servicing === undefined ? null : used + servicing
  }
  function balanceFor(m) {
    const total = totalHoursFor(m)
    const available = hoursAvailableFor(m)
    return total === null || available === null || available === undefined ? null : total - available
  }

  return (
    <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
      <h2 className="text-[15px] font-medium text-neutral-200">Monthly capacity</h2>
      <p className="mt-1 text-[13px] text-neutral-400">
        Total hours planned = Used hours + Servicing (any job under 30 hours) that month, vs.
        hours available from the crew (staff on tools × working days × 8h × 80% productive
        time). Balance = Total hours planned − Hours available, green when there's spare
        capacity, red when that month is short-staffed. Servicing/Working days/Staff on tools
        are editable for planning ahead — saved to this browser only, not to the workbook.
      </p>

      <div className="table-scroll mt-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="num">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="whitespace-nowrap text-neutral-500" title="Servicing work any job under 30 hours">
                Servicing
              </td>
              {MONTH_LABELS.map((m) => (
                <td key={m} className="p-1">
                  <EditableCapacityCell
                    value={servicingFor(m) ?? null}
                    onChange={(n) => setServicingOverrides((prev) => ({ ...prev, [m]: n }))}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="whitespace-nowrap">Total hours planned</td>
              {MONTH_LABELS.map((m) => {
                const v = totalHoursFor(m)
                return (
                  <td key={m} className="num tabular">
                    {v === null ? '—' : roundHours(v)}
                  </td>
                )
              })}
            </tr>
            <tr>
              <td className="whitespace-nowrap text-neutral-400">— Used hours</td>
              {MONTH_LABELS.map((m) => {
                const v = usedHoursByMonth[m]
                return (
                  <td key={m} className="num tabular text-neutral-400">
                    {v === null ? '—' : roundHours(v)}
                  </td>
                )
              })}
            </tr>
            <tr>
              <td className="whitespace-nowrap">Hours available</td>
              {MONTH_LABELS.map((m) => {
                const v = hoursAvailableFor(m)
                return (
                  <td key={m} className="num tabular">
                    {v === null || v === undefined ? '—' : roundHours(v)}
                  </td>
                )
              })}
            </tr>
            <tr>
              <td className="whitespace-nowrap font-medium text-neutral-200">Balance</td>
              {MONTH_LABELS.map((m) => {
                const v = balanceFor(m)
                return (
                  <td
                    key={m}
                    className={`num tabular font-medium ${
                      v === null ? '' : v < 0 ? 'text-red-400' : 'text-brand-green'
                    }`}
                  >
                    {v === null ? '—' : roundHours(v)}
                  </td>
                )
              })}
            </tr>
            <tr>
              <td className="whitespace-nowrap text-neutral-500">Working days</td>
              {MONTH_LABELS.map((m) => (
                <td key={m} className="p-1">
                  <EditableCapacityCell
                    value={workingDaysFor(m) ?? null}
                    onChange={(n) => setWorkingDaysOverrides((prev) => ({ ...prev, [m]: n }))}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="whitespace-nowrap text-neutral-500">Staff on tools</td>
              {MONTH_LABELS.map((m) => (
                <td key={m} className="p-1">
                  <EditableCapacityCell
                    value={staffOnToolsFor(m) ?? null}
                    onChange={(n) => setStaffOnToolsOverrides((prev) => ({ ...prev, [m]: n }))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// monthlyHours.totalsByMonth is company-wide actual hours worked, keyed
// "YYYY-MM" (see parseMonthlyHoursLog) — matched here to this year's
// Jan-Dec columns so "Used hours" lines up against "Total hours planned"
// for the same month. Months with no logged entry yet (the log only
// covers however far back logging started, and future months haven't
// happened) come back null, shown as "—" rather than a false zero.
function buildUsedHoursByLabel(monthlyHours) {
  const year = new Date().getFullYear()
  const map = {}
  MONTH_LABELS.forEach((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const entry = monthlyHours.totalsByMonth.find((t) => t.month === key)
    map[label] = entry ? entry.totalHours : null
  })
  return map
}

export default function UpcomingWorkTab({ upcomingWork, monthlyHours, onBack }) {
  const { jobs, capacity } = upcomingWork
  const usedHoursByMonth = buildUsedHoursByLabel(monthlyHours)

  const [values, setValues] = useState(() => {
    const map = {}
    for (const job of jobs) {
      map[job.jobNumber] = { notes: job.notes }
      for (const field of MONTH_FIELDS) map[job.jobNumber][field.key] = job.months[field.key] ?? ''
    }
    return map
  })
  const [savingKeys, setSavingKeys] = useState(() => new Set())
  const [status, setStatus] = useState({ kind: 'idle', message: '' })

  async function handleChange(job, key, col, newValue) {
    const cellKey = `${job.jobNumber}:${key}`
    const previousValue = values[job.jobNumber][key]
    setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [key]: newValue } }))
    setSavingKeys((prev) => new Set(prev).add(cellKey))
    setStatus({ kind: 'idle', message: `Saving "${key}" for ${job.jobNumber} ${job.jobName}…` })

    function revert(message) {
      setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [key]: previousValue } }))
      setStatus({ kind: 'error', message })
    }

    const result = await saveEdit('upcoming-work', job.jobNumber, col, newValue)
    if (result.status === 'done') {
      setStatus({
        kind: 'ok',
        message: `Saved "${key}" for ${job.jobNumber} ${job.jobName} — synced everywhere already; the workbook catches up in the background.`,
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Upcoming work</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Upcoming work</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Planned hours per month per job, from the workbook&apos;s Upcoming Work Calculator sheet.
          Quoted/Used/Remaining hours are calculated; every month is a manual plan you can edit.
        </p>
      </div>

      {status.message && (
        <p className={`text-sm ${status.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
          {status.message}
        </p>
      )}

      <CapacityPanel capacity={capacity} usedHoursByMonth={usedHoursByMonth} />

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky-col" style={{ left: STICKY_LEFTS[0], minWidth: STICKY_WIDTHS[0] }}>
                  Job
                </th>
                <th className="num sticky-col" style={{ left: STICKY_LEFTS[1], minWidth: STICKY_WIDTHS[1] }}>
                  Quoted hrs
                </th>
                <th className="num sticky-col" style={{ left: STICKY_LEFTS[2], minWidth: STICKY_WIDTHS[2] }}>
                  Used hrs
                </th>
                <th
                  className="num sticky-col sticky-col-end"
                  style={{ left: STICKY_LEFTS[3], minWidth: STICKY_WIDTHS[3] }}
                >
                  Remaining hrs
                </th>
                {MONTH_FIELDS.map((f) => (
                  <th key={f.key} className="num">
                    {f.key}
                  </th>
                ))}
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.jobNumber}>
                  <td
                    className="sticky-col whitespace-nowrap"
                    style={{ left: STICKY_LEFTS[0], minWidth: STICKY_WIDTHS[0] }}
                  >
                    {job.jobNumber} {job.jobName}
                  </td>
                  <td className="num tabular sticky-col" style={{ left: STICKY_LEFTS[1], minWidth: STICKY_WIDTHS[1] }}>
                    {job.quotedHours === null ? '—' : roundHours(job.quotedHours)}
                  </td>
                  <td className="num tabular sticky-col" style={{ left: STICKY_LEFTS[2], minWidth: STICKY_WIDTHS[2] }}>
                    {job.usedHours === null ? '—' : roundHours(job.usedHours)}
                  </td>
                  <td
                    className="num tabular sticky-col sticky-col-end"
                    style={{ left: STICKY_LEFTS[3], minWidth: STICKY_WIDTHS[3] }}
                  >
                    {job.remainingHours === null ? '—' : roundHours(job.remainingHours)}
                  </td>
                  {MONTH_FIELDS.map((field) => {
                    return (
                      <td key={field.key} className="min-w-[80px] p-1">
                        <EditableCell
                          value={values[job.jobNumber][field.key]}
                          saving={savingKeys.has(`${job.jobNumber}:${field.key}`)}
                          numeric
                          onChange={(newValue) => handleChange(job, field.key, field.col, newValue)}
                        />
                      </td>
                    )
                  })}
                  <td className="min-w-[160px] p-1">
                    <EditableCell
                      value={values[job.jobNumber].notes}
                      saving={savingKeys.has(`${job.jobNumber}:notes`)}
                      numeric={false}
                      onChange={(newValue) => handleChange(job, 'notes', NOTES_COL, newValue)}
                    />
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5 + MONTH_FIELDS.length} className="empty-row">
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
