import { useEffect, useState } from 'react'
import { CircleDashed, CircleDot, CircleCheck } from 'lucide-react'
import StatCard from './StatCard'
import { pollStagedStatus } from '../lib/pollStagedStatus'
import { saveEdit } from '../lib/saveEdit'
import {
  ONBOARDING_ITEMS,
  LINK_ITEM_COUNTS,
  isLinkedChecklistCompleteFromRecord,
  fetchLinkedChecklistRecord,
  fetchJobCreatedAt,
  isTwoWeeksOverdueFromStamp,
} from '../lib/onboardingChecklist'

import { workerFetch } from '@/lib/workerClient'

// Thursday morning is when the Weekly job check sheet is supposed to be
// done for the week (see its "Notes for the meeting" field) — if it isn't
// finished by then, item 18 should be hard to miss rather than just another
// unchecked row.
function isThursdayMorning() {
  const now = new Date()
  return now.getDay() === 4 && now.getHours() < 12
}

// A local `text` state separate from the committed `value` prop — needed
// so onBlur can actually tell whether anything changed. A flat controlled
// input whose onChange writes straight into the same state used for the
// "did it change" comparison always finds them equal by the time blur
// fires (onChange already moved that state to match), silently skipping
// every save. Same reasoning as MonthlyClaims/UpcomingWorkTab's EditableCell.
function RetentionInput({ value, saving, onChange }) {
  const [text, setText] = useState(value)
  return (
    <input
      type="number"
      value={text}
      disabled={saving}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onChange(text)
      }}
      placeholder="Ret %"
      title="Retention % — syncs to Monthly claims"
      className="w-16 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-right text-[12px] text-neutral-200 focus:border-brand-green/50 focus:outline-none disabled:opacity-50"
    />
  )
}

// A checkbox (done) plus an N/A pill — matches the paper form's checkbox +
// N/A circle exactly, instead of a 4-option dropdown nobody needs (there's
// no "No" on the paper checklist, just done or not-yet). Still saves as
// 'Yes' / 'N/A' / '' under the hood, so the workbook's Main Sheet columns
// are untouched.
function ChecklistCell({ value, saving, onChange }) {
  const done = value === 'Yes'
  const na = value === 'N/A'
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={saving}
        onClick={() => onChange(done ? '' : 'Yes')}
        aria-pressed={done}
        // A ticked box used to be the only signal that an item was handled, and
        // an unticked one rendered its ✓ in text-transparent — so a pending row
        // showed an empty square with no hint it was even clickable. Solid green
        // when done, a visible ghost tick when not.
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[14px] font-bold transition-colors disabled:opacity-50 ${
          done
            ? 'border-brand-green bg-brand-green text-[#04170c]'
            : 'border-white/20 bg-white/[0.03] text-white/25 hover:border-brand-green/60 hover:bg-brand-green/10 hover:text-brand-green'
        }`}
        title={done ? 'Done — click to clear' : 'Mark done'}
      >
        ✓
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => onChange(na ? '' : 'N/A')}
        aria-pressed={na}
        title={na ? 'Not applicable — click to clear' : 'Mark not applicable'}
        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
          na
            ? 'border-white/40 bg-white/[0.14] text-white'
            : 'border-white/10 bg-white/[0.02] text-neutral-500 hover:border-white/25 hover:text-neutral-200'
        }`}
      >
        N/A
      </button>
    </div>
  )
}

export default function MainSheetTab({
  mainSheet,
  monthlyClaims,
  onBack,
  onOpenWeeklyCheckSheet,
  onOpenJobCompletionChecklist,
}) {
  const { jobs, columns } = mainSheet

  const sortedJobs = [...jobs].sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber))
  const [selectedJobNumber, setSelectedJobNumber] = useState('')
  const [progressFilter, setProgressFilter] = useState('all')
  const [values, setValues] = useState(() => {
    const map = {}
    for (const job of jobs) map[job.jobNumber] = { ...job.checklist }
    return map
  })
  const [savingKeys, setSavingKeys] = useState(() => new Set())
  const [status, setStatus] = useState({ kind: 'idle', message: '' }) // idle | ok | error
  const [archiving, setArchiving] = useState(false)

  // Retention % lives on the Claim Calculator By Month sheet (col F), not
  // the Main Sheet — "Load retentions" just needs a place to type it in
  // once, so this syncs straight to that sheet via the same endpoint the
  // Monthly claims page's Claim Calculator modal already uses.
  const retentionByJob = new Map((monthlyClaims?.jobs ?? []).map((j) => [j.jobNumber, j.retention]))
  const [retentionValues, setRetentionValues] = useState(() => {
    const map = {}
    for (const job of jobs) map[job.jobNumber] = retentionByJob.get(job.jobNumber) ?? ''
    return map
  })
  const [retentionSaving, setRetentionSaving] = useState(() => new Set())

  const columnByKey = new Map(columns.map((c) => [c.key, c]))
  // "Settled" = ticked or marked N/A. An item that doesn't apply to a job
  // needs no action, so it shouldn't sit in the "still to do" count — the
  // row colouring below already treats the two the same, and counting only
  // 'Yes' meant the header could claim four items outstanding while not a
  // single row was amber.
  const settledCount = (jobNumber) =>
    columns.filter((c) => {
      const v = values[jobNumber]?.[c.key]
      return v === 'Yes' || v === 'N/A'
    }).length

  const selectedJob = sortedJobs.find((j) => j.jobNumber === selectedJobNumber) ?? sortedJobs[0] ?? null
  const selectedJobDone = selectedJob ? settledCount(selectedJob.jobNumber) : 0

  // Onboarding progress for every job, so the filters below can say how many
  // jobs sit in each state and the picker can show each job's own progress.
  const progressByJob = new Map(sortedJobs.map((j) => [j.jobNumber, settledCount(j.jobNumber)]))
  const bucketOf = (jobNumber) => {
    const done = progressByJob.get(jobNumber) ?? 0
    if (done === 0) return 'notStarted'
    if (done >= columns.length) return 'complete'
    return 'inProgress'
  }
  const PROGRESS_CARDS = [
    {
      key: 'notStarted',
      label: 'Not started',
      context: 'Nothing ticked yet',
      icon: CircleDashed,
      ring: 'ring-red-400/60',
    },
    {
      key: 'inProgress',
      label: 'In progress',
      context: 'Started, not finished',
      icon: CircleDot,
      ring: 'ring-amber-400/60',
    },
    {
      key: 'complete',
      label: 'Complete',
      context: `All ${columns.length} items settled`,
      icon: CircleCheck,
      ring: 'ring-brand-green/60',
    },
  ]
  const filterCounts = {
    all: sortedJobs.length,
    notStarted: sortedJobs.filter((j) => bucketOf(j.jobNumber) === 'notStarted').length,
    inProgress: sortedJobs.filter((j) => bucketOf(j.jobNumber) === 'inProgress').length,
    complete: sortedJobs.filter((j) => bucketOf(j.jobNumber) === 'complete').length,
  }
  const visibleJobs =
    progressFilter === 'all' ? sortedJobs : sortedJobs.filter((j) => bucketOf(j.jobNumber) === progressFilter)

  // Selecting a filter that excludes the currently open job would leave the
  // picker showing something the filter says isn't there — move to the first
  // job that does belong.
  function applyFilter(key) {
    setProgressFilter(key)
    const next = key === 'all' ? sortedJobs : sortedJobs.filter((j) => bucketOf(j.jobNumber) === key)
    if (next.length > 0 && !next.some((j) => j.jobNumber === selectedJob?.jobNumber)) {
      setSelectedJobNumber(next[0].jobNumber)
    }
  }

  // The Weekly/Completion checklist records and the job-created stamp now
  // live in Cloudflare KV (shared across devices, see src/lib/appData.js)
  // instead of localStorage — fetched once per job selection into state so
  // the render loop below (item rows, the overdue flash) stays synchronous.
  const [linkedRecords, setLinkedRecords] = useState({ weekly: null, completion: null })
  const [jobCreatedAt, setJobCreatedAt] = useState(null)
  useEffect(() => {
    if (!selectedJob) return
    let cancelled = false
    Promise.all([
      fetchLinkedChecklistRecord('weekly', selectedJob.jobNumber),
      fetchLinkedChecklistRecord('completion', selectedJob.jobNumber),
      fetchJobCreatedAt(selectedJob.jobNumber),
    ]).then(([weekly, completion, createdAt]) => {
      if (cancelled) return
      setLinkedRecords({ weekly, completion })
      setJobCreatedAt(createdAt)
    })
    return () => {
      cancelled = true
    }
    // Keyed on the job number (a stable primitive) rather than
    // `selectedJob` itself, which is a fresh object every render and would
    // refetch on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJob?.jobNumber])

  async function archiveJob(job) {
    setArchiving(true)
    setStatus({ kind: 'idle', message: `Job completion checklist marked complete — archiving ${job.jobNumber}…` })
    try {
      const res = await workerFetch(`/archive-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jobNumber: job.jobNumber, action: 'archive' }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setStatus({ kind: 'error', message: payload.message ?? `Auto-archive failed (${res.status}).` })
        return
      }
      const result = await pollStagedStatus(payload.staged)
      if (result.status === 'done') {
        setStatus({ kind: 'ok', message: `${job.jobNumber} ${job.jobName} archived automatically.` })
      } else if (result.status === 'failed') {
        setStatus({ kind: 'error', message: `Auto-archive failed: ${result.message}` })
      } else {
        setStatus({ kind: 'error', message: 'Auto-archive still processing after 3 minutes — check back shortly.' })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: `Could not reach the upload service to auto-archive: ${String(err.message ?? err)}` })
    } finally {
      setArchiving(false)
    }
  }

  async function handleChange(job, colKey, newValue, item) {
    const cellKey = `${job.jobNumber}:${colKey}`
    const previousValue = values[job.jobNumber][colKey]
    if (newValue === previousValue) return

    if (item?.link && newValue === 'Yes') {
      const record = await fetchLinkedChecklistRecord(item.link, job.jobNumber)
      if (!isLinkedChecklistCompleteFromRecord(item.link, record)) {
        const sheetName = item.link === 'weekly' ? 'Weekly Job Check Sheet' : 'Job Completion Checklist'
        const count = LINK_ITEM_COUNTS[item.link]
        setStatus({
          kind: 'error',
          message: `Finish all ${count} items on the ${sheetName} first — click "${item.label}" to open it.`,
        })
        return
      }
    }

    setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [colKey]: newValue } }))
    setSavingKeys((prev) => new Set(prev).add(cellKey))
    setStatus({ kind: 'idle', message: '' })

    const column = columnByKey.get(colKey)
    function revert(message) {
      setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [colKey]: previousValue } }))
      setStatus({ kind: 'error', message })
    }

    setStatus({ kind: 'idle', message: `Processing "${column.label}" for ${job.jobNumber} ${job.jobName}…` })
    const result = await saveEdit('main-sheet', job.jobNumber, column.col, newValue)
    if (result.status === 'done') {
      setStatus({ kind: 'ok', message: `Saved "${column.label}" for ${job.jobNumber} ${job.jobName} — synced everywhere already; the workbook catches up in the background.` })
      // Item 19 ("Job completion checklist completed") archives the job
      // the moment it's marked Yes — that's the whole point of the item.
      if (item?.link === 'completion' && newValue === 'Yes') archiveJob(job)
    } else if (result.status === 'failed' || result.status === 'error') {
      revert(`${result.message} — reverted.`)
    } else {
      // Timed out waiting — the workflow may still finish it later, so
      // don't revert (that could fight a save that lands right after).
      setStatus({ kind: 'error', message: result.message })
    }
    setSavingKeys((prev) => {
      const next = new Set(prev)
      next.delete(cellKey)
      return next
    })
  }

  async function handleRetentionChange(job, newValue) {
    const previousValue = retentionValues[job.jobNumber]
    if (newValue === previousValue) return

    setRetentionValues((prev) => ({ ...prev, [job.jobNumber]: newValue }))
    setRetentionSaving((prev) => new Set(prev).add(job.jobNumber))
    setStatus({ kind: 'idle', message: `Saving retention % for ${job.jobNumber} ${job.jobName}…` })

    function revert(message) {
      setRetentionValues((prev) => ({ ...prev, [job.jobNumber]: previousValue }))
      setStatus({ kind: 'error', message })
    }

    const result = await saveEdit('claim-calculator', job.jobNumber, 5, newValue)
    if (result.status === 'done') {
      setStatus({
        kind: 'ok',
        message: `Saved retention % for ${job.jobNumber} ${job.jobName} — synced to Monthly claims too.`,
      })
    } else if (result.status === 'failed' || result.status === 'error') {
      revert(`${result.message} — reverted.`)
    } else {
      setStatus({ kind: 'error', message: result.message })
    }
    setRetentionSaving((prev) => {
      const next = new Set(prev)
      next.delete(job.jobNumber)
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
        <span className="text-text-primary">Job checklist</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Job checklist</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Tick a task done or mark it N/A — it saves instantly and syncs everywhere, while the
          workbook itself catches up in the background. From the workbook&apos;s Main Sheet.
        </p>
      </div>

      {(status.message || archiving) && (
        <p className={`text-sm ${status.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
          {status.message}
        </p>
      )}

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Job onboarding checklist</h2>
            {selectedJob && (
              // "11 of 19 complete" makes you do the subtraction. What actually
              // matters on a checklist is how many are left, so lead with that.
              <p className="mt-1 text-[13px] text-neutral-400">
                {columns.length - selectedJobDone > 0 ? (
                  <>
                    <span className="text-[15px] font-semibold text-amber-400">
                      {columns.length - selectedJobDone}
                    </span>{' '}
                    still to do
                    <span className="text-neutral-600"> · </span>
                    {selectedJobDone} of {columns.length} done
                  </>
                ) : (
                  <span className="font-semibold text-brand-green">
                    All {columns.length} items complete
                  </span>
                )}
              </p>
            )}
          </div>
          <select
            value={selectedJob?.jobNumber ?? ''}
            onChange={(e) => setSelectedJobNumber(e.target.value)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 focus:border-brand-green/50 focus:outline-none"
          >
            {(visibleJobs.length > 0 ? visibleJobs : sortedJobs).map((job) => (
              <option key={job.jobNumber} value={job.jobNumber} className="bg-[#11161c] text-neutral-200">
                {job.jobNumber} — {job.jobName} · {progressByJob.get(job.jobNumber)}/{columns.length}
              </option>
            ))}
          </select>
        </div>

        {/* Three big cards rather than a row of small chips: this is the first
            thing you want off this page — how many jobs nobody has started —
            and a subtle pill was easy to scroll straight past. Clicking one
            filters the picker below; clicking the active one again clears it. */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PROGRESS_CARDS.map((card) => {
            const active = progressFilter === card.key
            const count = filterCounts[card.key]
            return (
              <div
                key={card.key}
                className={`rounded-[18px] transition-shadow ${
                  active ? `ring-2 ${card.ring}` : ''
                }`}
              >
                <StatCard
                  icon={card.icon}
                  label={card.label}
                  value={count}
                  context={active ? 'Showing these — click to clear' : card.context}
                  tone={card.key === 'notStarted' && count > 0 ? 'critical' : 'neutral'}
                  onClick={() => applyFilter(active ? 'all' : card.key)}
                />
              </div>
            )
          })}
        </div>

        {selectedJob && (
          <>
            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-brand-green transition-all duration-300"
                style={{ width: `${columns.length ? (selectedJobDone / columns.length) * 100 : 0}%` }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-full bg-amber-400/70" /> To do
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-full bg-brand-green/70" /> Done
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-full bg-white/20" /> N/A
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map((c, i) => {
                const item = ONBOARDING_ITEMS[i]
                const label = item?.label ?? c.label
                const itemValue = values[selectedJob.jobNumber][c.key]
                const pending = itemValue !== 'Yes' && itemValue !== 'N/A'
                const isDone = itemValue === 'Yes'
                const isNa = itemValue === 'N/A'
                const overdue =
                  (item?.link === 'weekly' &&
                    isThursdayMorning() &&
                    !isLinkedChecklistCompleteFromRecord('weekly', linkedRecords.weekly)) ||
                  (item?.twoWeek && pending && isTwoWeeksOverdueFromStamp(jobCreatedAt))
                // Done, N/A and still-to-do rows all used to render identically,
                // so the only way to read the list was to check each small tick
                // box in turn. Give each state its own weight instead: settled
                // rows recede, outstanding ones carry a left bar and a lighter
                // panel, so what still needs doing is what catches the eye.
                const rowStyle = overdue
                  ? 'overdue-flash'
                  : isDone
                    ? 'border-brand-green/25 bg-brand-green/[0.06] border-l-[3px] border-l-brand-green/70'
                    : isNa
                      ? 'border-white/[0.05] bg-white/[0.015] border-l-[3px] border-l-white/20'
                      : 'border-white/15 bg-white/[0.05] border-l-[3px] border-l-amber-400/70'
                return (
                  <div
                    key={c.key}
                    className={`flex items-center justify-between gap-3 rounded-[10px] border p-3 transition-colors ${rowStyle}`}
                  >
                    {item?.link ? (
                      <button
                        type="button"
                        onClick={() =>
                          item.link === 'weekly'
                            ? onOpenWeeklyCheckSheet(selectedJob)
                            : onOpenJobCompletionChecklist(selectedJob)
                        }
                        className="flex-1 text-left text-[13.5px] leading-snug text-brand-green underline decoration-brand-green/40 underline-offset-2 hover:text-white"
                      >
                        <span className="mr-2 font-semibold tabular-nums text-neutral-500">{i + 1}.</span>
                        {label}
                      </button>
                    ) : (
                      // Settled items step back so the eye lands on what is left.
                      <span
                        className={`text-[13.5px] leading-snug ${
                          isDone ? 'text-neutral-400' : isNa ? 'text-neutral-500' : 'text-neutral-100'
                        }`}
                      >
                        <span className="mr-2 font-semibold tabular-nums text-neutral-500">{i + 1}.</span>
                        {label}
                        {/* The 2-week target only means something while the item
                            is outstanding — once it's done or N/A the badge is
                            just amber noise competing with the rows that do
                            still need attention. */}
                        {item?.twoWeek && pending && (
                          <span
                            className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                              overdue
                                ? 'border-red-400/40 bg-red-400/10 text-red-400'
                                : 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                            }`}
                          >
                            {overdue ? 'Overdue' : '2 wks'}
                          </span>
                        )}
                      </span>
                    )}
                    {item?.retentionInput && (
                      <div className="flex shrink-0 items-center gap-1">
                        <RetentionInput
                          key={selectedJob.jobNumber}
                          value={retentionValues[selectedJob.jobNumber]}
                          saving={retentionSaving.has(selectedJob.jobNumber)}
                          onChange={(newValue) => handleRetentionChange(selectedJob, newValue)}
                        />
                        <span className="text-[12px] text-neutral-500">%</span>
                      </div>
                    )}
                    <div className="w-28 shrink-0">
                      <ChecklistCell
                        value={values[selectedJob.jobNumber][c.key]}
                        saving={savingKeys.has(`${selectedJob.jobNumber}:${c.key}`)}
                        onChange={(newValue) => handleChange(selectedJob, c.key, newValue, item)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
