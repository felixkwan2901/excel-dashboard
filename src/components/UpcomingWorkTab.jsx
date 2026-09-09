import { useState } from 'react'
import { saveEdit } from '../lib/saveEdit'
import { roundHours } from '../lib/format'
import { useSharedState } from '../lib/useSharedState'
import CollapsibleSection from './CollapsibleSection'

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

// Which column is "now". Twelve near-identical columns of numbers give the eye
// nothing to anchor on, and the month header scrolls out of sight on a long
// page — so the month you actually care about is tinted and its header kept
// bold, letting you find today's figures without counting across.
const CURRENT_MONTH = MONTH_LABELS[new Date().getMonth()]

function EditableCapacityCell({ value, onChange }) {
  const [text, setText] = useState(value ?? '')
  // These figures now load from the shared store, which answers a moment
  // after the input has already mounted. Seeding state once at mount meant
  // the cell kept showing the workbook default and silently ignored the
  // saved override — it only ever worked because localStorage was
  // synchronous. This is React's "adjust state when a prop changes" pattern:
  // reset during render when the incoming value differs, so no extra paint
  // and no cascading effect.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value ?? '')
  }
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
      // Fills the cell rather than sitting at a fixed 64px inside it: the
      // column headers are right-aligned to the cell edge, so a narrower input
      // left every figure about 10px adrift of the month it belongs to.
      className="w-full min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-right text-[13px] tabular-nums text-neutral-200 focus:border-brand-green/50 focus:outline-none"
    />
  )
}

function CapacityPanel({ capacity, plannedByJobFor }) {
  const [servicingOverrides, setServicingOverrides, servicingFailed] = useSharedState('planning:servicing', 'upcomingWork.servicingOverrides', {})
  const [workingDaysOverrides, setWorkingDaysOverrides, workingDaysFailed] = useSharedState('planning:working-days', 'upcomingWork.workingDaysOverrides', {})
  const [staffOnToolsOverrides, setStaffOnToolsOverrides, staffOnToolsFailed] = useSharedState('planning:staff-on-tools', 'upcomingWork.staffOnToolsOverrides', {})

  // A planning figure that silently failed to save is how the check-sheet bug
  // worked: the screen looked right, the value never left the browser, and it
  // vanished on the next refresh. Say so instead.
  const planningSaveFailed =
    servicingFailed || workingDaysFailed || staffOnToolsFailed

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
  // Headcount on the tools that month: the sum of everyone's FTE. Null when
  // nobody has a figure for that month, so there's nothing to check against.
  //
  function hoursAvailableFor(m) {
    const days = workingDaysFor(m)
    const staff = staffOnToolsFor(m)
    return days !== null && days !== undefined && staff !== null && staff !== undefined
      ? staff * days * 8 * 0.8
      : capacity.hoursAvailable[m]
  }

  // Total hours planned = Servicing + everything planned against a job in the
  // table below.
  //
  // This used to add actual hours worked, taken from the monthly hours log,
  // to Servicing — which is a different question entirely. It answered "how
  // much have we done" in a row sitting above Hours available and Balance,
  // both of which are about what is still to come, so a month with plenty of
  // work booked but no hours worked yet read as nearly empty. It also went
  // nowhere near the per-job plan directly underneath it, so editing a job's
  // hours changed nothing above.
  function totalHoursFor(m) {
    const planned = plannedByJobFor(m)
    const servicing = servicingFor(m)
    return servicing === null || servicing === undefined ? planned : planned + servicing
  }
  function balanceFor(m) {
    const total = totalHoursFor(m)
    const available = hoursAvailableFor(m)
    return total === null || available === null || available === undefined ? null : total - available
  }

  return (
    <CollapsibleSection
      className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
      storageKey="upcoming-work.capacity"
      title="Monthly capacity"
      headingClassName="text-[15px] font-medium text-neutral-200"
      description={
        <>
          Total hours planned = Servicing (the sheet&apos;s flat allowance for jobs under 30
          hours) + every hour booked against a job in the table below, so editing a job there
          moves these figures. Compared against hours available from the crew (staff on tools x
          working days x 8h x 80% productive time). Balance = Total hours planned - Hours available, green when
          there&apos;s spare capacity, red when that month is short-staffed. Everything here
          is editable for planning ahead — saved to this browser only, not to the workbook.
        </>
      }
    >
      {planningSaveFailed && (
        <p className="mt-2 rounded-lg border border-red-400/30 bg-red-400/[0.08] px-3 py-2 text-[13px] text-red-400">
          Couldn&apos;t save to the shared store — these figures are only on this device
          right now, and will disappear if you refresh. Check your connection and edit
          again.
        </p>
      )}
      <div className="table-scroll mt-4">
        <table className="data-table">
          <thead>
            <tr>
              {/* Narrower on a phone: a 190px pinned column there would eat
                  half the screen and leave almost no room for the months. */}
              <th className="sticky-col sticky-col-end min-w-[116px] sm:min-w-[190px]" style={{ left: 0 }}>
                Month
              </th>
              {MONTH_LABELS.map((m) => (
                <th
                  key={m}
                  className={`num ${m === CURRENT_MONTH ? 'bg-brand-green/[0.12] font-semibold text-brand-green' : ''}`}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight text-neutral-400" style={{ left: 0 }} title="Servicing work any job under 30 hours">
                Servicing
              </td>
              {MONTH_LABELS.map((m) => (
                <td key={m} className={`cell-input ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
                  <EditableCapacityCell
                    value={servicingFor(m) ?? null}
                    onChange={(n) => setServicingOverrides((prev) => ({ ...prev, [m]: n }))}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight" style={{ left: 0 }}>Total hours planned</td>
              {MONTH_LABELS.map((m) => {
                const v = totalHoursFor(m)
                return (
                  <td key={m} className={`num tabular ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
                    {v === null ? <span className="text-neutral-600">—</span> : roundHours(v)}
                  </td>
                )
              })}
            </tr>
            <tr>
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight text-neutral-400" style={{ left: 0 }}>— Planned on jobs</td>
              {MONTH_LABELS.map((m) => {
                const v = plannedByJobFor(m)
                return (
                  <td key={m} className={`num tabular text-neutral-400 ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
                    {v === null ? <span className="text-neutral-600">—</span> : roundHours(v)}
                  </td>
                )
              })}
            </tr>
            <tr>
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight" style={{ left: 0 }}>Hours available</td>
              {MONTH_LABELS.map((m) => {
                const v = hoursAvailableFor(m)
                return (
                  <td key={m} className={`num tabular ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
                    {v === null || v === undefined ? <span className="text-neutral-600">—</span> : roundHours(v)}
                  </td>
                )
              })}
            </tr>
            {/* Balance is the answer the whole table exists to give — spare
                capacity or short-staffed, per month. Rule it off from the
                inputs above so it reads as a result, not another row. */}
            <tr className="border-t-2 border-white/15">
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight text-[14px] font-semibold text-white" style={{ left: 0 }}>Balance</td>
              {MONTH_LABELS.map((m) => {
                const v = balanceFor(m)
                return (
                  <td
                    key={m}
                    className={`num tabular text-[14px] font-semibold ${
                      m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''
                    } ${v === null ? 'text-neutral-600' : v < 0 ? 'text-red-400' : 'text-brand-green'}`}
                  >
                    {v === null ? <span className="text-neutral-600">—</span> : roundHours(v)}
                  </td>
                )
              })}
            </tr>
            <tr>
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight text-neutral-400" style={{ left: 0 }} title="Drives Hours available: staff on tools x working days x 8h x 80%">
                Working days
              </td>
              {MONTH_LABELS.map((m) => (
                <td key={m} className={`cell-input ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
                  <EditableCapacityCell
                    value={workingDaysFor(m) ?? null}
                    onChange={(n) => setWorkingDaysOverrides((prev) => ({ ...prev, [m]: n }))}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight text-neutral-400" style={{ left: 0 }} title="Drives Hours available: staff on tools x working days x 8h x 80%">
                Staff on tools
              </td>
              {MONTH_LABELS.map((m) => (
                <td key={m} className={`cell-input ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
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
    </CollapsibleSection>
  )
}

export default function UpcomingWorkTab({ upcomingWork, onBack }) {
  const { jobs, capacity } = upcomingWork

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

  // Summed from the editable values rather than the parsed workbook, so
  // committing an edit to a job below (cells save on blur) moves Total hours
  // planned and Balance above it straight away. Reading the workbook copy
  // instead would leave the summary a merge behind — a minute or two, long
  // enough to make a planning edit look like it did nothing.
  function plannedByJobFor(month) {
    let total = 0
    for (const job of jobs) {
      const raw = values[job.jobNumber]?.[month]
      const n = Number(raw)
      if (raw !== '' && raw !== null && raw !== undefined && Number.isFinite(n)) total += n
    }
    return total
  }

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

      <CapacityPanel capacity={capacity} plannedByJobFor={plannedByJobFor} />

      <CollapsibleSection
        className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
        storageKey="upcoming-work.jobs"
        title="Planned hours by job"
      >
        <div className="table-scroll mt-4">
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
      </CollapsibleSection>
    </div>
  )
}
