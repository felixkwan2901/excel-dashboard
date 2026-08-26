import { useEffect, useState } from 'react'
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

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

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
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[12px] font-medium transition-colors disabled:opacity-50 ${
          done
            ? 'border-brand-green/40 bg-brand-green/10 text-brand-green'
            : 'border-white/10 bg-white/[0.02] text-transparent hover:border-white/20'
        }`}
        title="Done"
      >
        ✓
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => onChange(na ? '' : 'N/A')}
        aria-pressed={na}
        className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
          na
            ? 'border-white/30 bg-white/[0.08] text-neutral-200'
            : 'border-white/10 bg-white/[0.02] text-neutral-500 hover:text-neutral-300'
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
  const selectedJob = sortedJobs.find((j) => j.jobNumber === selectedJobNumber) ?? sortedJobs[0] ?? null
  const selectedJobDone = selectedJob
    ? columns.filter((c) => values[selectedJob.jobNumber][c.key] === 'Yes').length
    : 0

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
      const res = await fetch(`${UPLOAD_WORKER_URL}/archive-job`, {
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
              <p className="mt-1 text-[13px] text-neutral-400">
                {selectedJobDone} of {columns.length} items complete
              </p>
            )}
          </div>
          <select
            value={selectedJob?.jobNumber ?? ''}
            onChange={(e) => setSelectedJobNumber(e.target.value)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 focus:border-brand-green/50 focus:outline-none"
          >
            {sortedJobs.map((job) => (
              <option key={job.jobNumber} value={job.jobNumber} className="bg-[#11161c] text-neutral-200">
                {job.jobNumber} — {job.jobName}
              </option>
            ))}
          </select>
        </div>

        {selectedJob && (
          <>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-brand-green transition-all"
                style={{ width: `${columns.length ? (selectedJobDone / columns.length) * 100 : 0}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map((c, i) => {
                const item = ONBOARDING_ITEMS[i]
                const label = item?.label ?? c.label
                const itemValue = values[selectedJob.jobNumber][c.key]
                const pending = itemValue !== 'Yes' && itemValue !== 'N/A'
                const overdue =
                  (item?.link === 'weekly' &&
                    isThursdayMorning() &&
                    !isLinkedChecklistCompleteFromRecord('weekly', linkedRecords.weekly)) ||
                  (item?.twoWeek && pending && isTwoWeeksOverdueFromStamp(jobCreatedAt))
                return (
                  <div
                    key={c.key}
                    className={`flex items-center justify-between gap-3 rounded-[10px] border p-3 ${
                      overdue ? 'overdue-flash' : 'border-white/[0.06] bg-white/[0.02]'
                    }`}
                  >
                    {item?.link ? (
                      <button
                        type="button"
                        onClick={() =>
                          item.link === 'weekly'
                            ? onOpenWeeklyCheckSheet(selectedJob)
                            : onOpenJobCompletionChecklist(selectedJob)
                        }
                        className="flex-1 text-left text-[13px] text-brand-green underline decoration-brand-green/40 underline-offset-2 hover:text-white"
                      >
                        <span className="mr-2 text-neutral-500">{i + 1}.</span>
                        {label}
                      </button>
                    ) : (
                      <span className="text-[13px] text-neutral-300">
                        <span className="mr-2 text-neutral-500">{i + 1}.</span>
                        {label}
                        {item?.twoWeek && (
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
