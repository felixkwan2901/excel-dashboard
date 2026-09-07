import { useState } from 'react'
import { saveEdit } from '../lib/saveEdit'
import { roundHours } from '../lib/format'
import { useSharedState } from '../lib/useSharedState'

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
      className="w-16 min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 text-right text-[13px] tabular-nums text-neutral-200 focus:border-brand-green/50 focus:outline-none"
    />
  )
}

function newStaffId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `staff-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyStaffHours() {
  const hours = {}
  for (const label of MONTH_LABELS) hours[label] = null
  return hours
}

// A named roster carrying each person's FTE per month — 1 for full time,
// 0.5 for half, 0 for someone not on the tools that month.
//
// This mirrors how the workbook already does it. Rows 81-105 of the Upcoming
// Work Calculator list the crew with exactly that column (Kyle 0.5, Ben Dyer
// 0), totalling 16.5 at row 110, and that total is typed into "Staff on
// tools" — the sheet's own label says "enter in above spreadsheet". Hours
// then come from the formula, and it reconciles: 16.5 x 20 days x 8h x 0.8
// = 2112, the sheet's February figure exactly.
//
// It used to ask for hours per person instead, which is a different model
// and could not be made to agree: the estimate discounts to 80% productive
// time and a typed hours total does not, so entering everyone's real monthly
// hours overstated capacity by about a third. Counting people and letting
// the formula do the rest removes that trap. Unlike the sheet, which stores
// one FTE per person, this holds a value per month, so someone joining or
// dropping to part time mid-year is just a different number in that column.
function StaffRoster({ staff, onAdd, onRemove, onRename, onHoursChange, totalFor }) {
  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-medium text-neutral-200">Staff</h3>
          <p className="mt-0.5 text-[12px] text-neutral-400">
            Add each person and their FTE per month — 1 for full time, 0.5 for half, 0 if
            they&apos;re not on the tools. The monthly total replaces Staff on tools below,
            and Hours available stays the same formula: staff x working days x 8h x 80%.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-md border border-white/10 px-2.5 py-1.5 text-[12px] font-medium text-neutral-200 transition-colors hover:border-brand-green/50 hover:text-brand-green"
        >
          + Add staff
        </button>
      </div>

      {staff.length === 0 ? (
        <p className="mt-3 text-[12px] text-neutral-400">No staff added yet.</p>
      ) : (
        <div className="table-scroll mt-3">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Name</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="num">
                    {m}
                  </th>
                ))}
                <th className="sticky-col-right"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((person) => (
                <tr key={person.id}>
                  <td className="p-1">
                    <input
                      type="text"
                      defaultValue={person.name}
                      onBlur={(e) => onRename(person.id, e.target.value)}
                      placeholder="Name"
                      className="w-full min-w-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none"
                    />
                  </td>
                  {MONTH_LABELS.map((m) => (
                    <td key={m} className="p-1">
                      <EditableCapacityCell
                        value={person.hours[m] ?? null}
                        onChange={(n) => onHoursChange(person.id, m, n)}
                      />
                    </td>
                  ))}
                  <td className="sticky-col-right p-1">
                    <button
                      type="button"
                      onClick={() => onRemove(person.id)}
                      title={`Remove ${person.name || 'this staff member'}`}
                      aria-label={`Remove ${person.name || 'staff member'}`}
                      className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-neutral-400 transition-colors hover:border-red-400/50 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {/* The sheet totals its FTE column at row 110 and that number is
                  typed into Staff on tools. Showing the same total here means
                  you can see at a glance whether the roster agrees with the
                  row it replaces. */}
              <tr className="border-t-2 border-white/15">
                <td className="p-1 text-[13px] font-semibold text-white">Total on tools</td>
                {MONTH_LABELS.map((m) => {
                  const t = totalFor(m)
                  return (
                    <td key={m} className="num tabular text-[13px] font-semibold text-white">
                      {t === null ? <span className="text-neutral-600">—</span> : t}
                    </td>
                  )
                })}
                <td className="sticky-col-right p-1"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const [servicingOverrides, setServicingOverrides, servicingFailed] = useSharedState('planning:servicing', 'upcomingWork.servicingOverrides', {})
  const [workingDaysOverrides, setWorkingDaysOverrides, workingDaysFailed] = useSharedState('planning:working-days', 'upcomingWork.workingDaysOverrides', {})
  const [staffOnToolsOverrides, setStaffOnToolsOverrides, staffOnToolsFailed] = useSharedState('planning:staff-on-tools', 'upcomingWork.staffOnToolsOverrides', {})
  const [staffRoster, setStaffRoster, rosterFailed] = useSharedState('planning:staff-roster', 'upcomingWork.staffRoster', [])

  // A planning figure that silently failed to save is how the check-sheet bug
  // worked: the screen looked right, the value never left the browser, and it
  // vanished on the next refresh. Say so instead.
  const planningSaveFailed =
    servicingFailed || workingDaysFailed || staffOnToolsFailed || rosterFailed

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
  // Once at least one named staff member's been added, their entered
  // hours are the real figure — sum them directly rather than falling
  // back to the staff-count × working-days × 8h × 0.8 estimate.
  // Only months where someone has actually entered hours count as "the real
  // figure". Previously any non-empty roster took over every month, so adding
  // one blank staff row turned all twelve months of Hours available into 0 —
  // and Balance with them. A person with no hours entered for a month simply
  // isn't information about that month, so fall back to the estimate there.
  // Headcount on the tools that month, from the roster: the sum of everyone's
  // FTE. Null when nobody has been given a figure for that month, so the
  // Staff on tools row below still applies.
  function rosterStaffFor(m) {
    const entered = staffRoster.filter((s) => s.hours[m] !== null && s.hours[m] !== undefined)
    if (entered.length === 0) return null
    return entered.reduce((sum, s) => sum + s.hours[m], 0)
  }
  function hoursAvailableFor(m) {
    const days = workingDaysFor(m)
    // The roster's headcount takes precedence over the Staff on tools row,
    // but both go through the same formula — the roster replaces the *count*,
    // not the calculation. Feeding a typed hours total straight in was what
    // made the two disagree.
    const staff = rosterStaffFor(m) ?? staffOnToolsFor(m)
    return days !== null && days !== undefined && staff !== null && staff !== undefined
      ? staff * days * 8 * 0.8
      : capacity.hoursAvailable[m]
  }

  function addStaffMember() {
    setStaffRoster((prev) => [...prev, { id: newStaffId(), name: '', hours: emptyStaffHours() }])
  }
  function removeStaffMember(id) {
    setStaffRoster((prev) => prev.filter((s) => s.id !== id))
  }
  function renameStaffMember(id, name) {
    setStaffRoster((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
  }
  function updateStaffHours(id, month, value) {
    setStaffRoster((prev) =>
      prev.map((s) => (s.id === id ? { ...s, hours: { ...s.hours, [month]: value } } : s))
    )
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
      {planningSaveFailed && (
        <p className="mt-2 rounded-lg border border-red-400/30 bg-red-400/[0.08] px-3 py-2 text-[13px] text-red-400">
          Couldn&apos;t save to the shared store — these figures are only on this device
          right now, and will disappear if you refresh. Check your connection and edit
          again.
        </p>
      )}
      <p className="mt-1 text-[13px] text-neutral-400">
        Total hours planned = Used hours + Servicing (any job under 30 hours) that month, vs.
        hours available from the crew (staff on tools × working days × 8h × 80% productive
        time). Balance = Total hours planned − Hours available, green when there's spare
        capacity, red when that month is short-staffed. Add named staff below with their own
        hours per month for a real Hours available figure — Working days/Staff on tools is the
        estimate used for any month you haven't entered staff hours for. Everything here is editable for planning ahead — saved
        to this browser only, not to the workbook.
      </p>

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
                <td key={m} className={`p-1 ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
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
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight text-neutral-400" style={{ left: 0 }}>— Used hours</td>
              {MONTH_LABELS.map((m) => {
                const v = usedHoursByMonth[m]
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
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight text-neutral-400" style={{ left: 0 }} title="Only used when no staff are added below">
                Working days (estimate)
              </td>
              {MONTH_LABELS.map((m) => (
                <td key={m} className={`p-1 ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
                  <EditableCapacityCell
                    value={workingDaysFor(m) ?? null}
                    onChange={(n) => setWorkingDaysOverrides((prev) => ({ ...prev, [m]: n }))}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky-col sticky-col-end whitespace-normal sm:whitespace-nowrap text-[12px] sm:text-[13px] leading-tight text-neutral-400" style={{ left: 0 }} title="Only used when no staff are added below">
                Staff on tools (estimate)
              </td>
              {MONTH_LABELS.map((m) => (
                <td key={m} className={`p-1 ${m === CURRENT_MONTH ? 'bg-brand-green/[0.06]' : ''}`}>
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

      <StaffRoster
        staff={staffRoster}
        onAdd={addStaffMember}
        onRemove={removeStaffMember}
        onRename={renameStaffMember}
        onHoursChange={updateStaffHours}
        totalFor={rosterStaffFor}
      />
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
