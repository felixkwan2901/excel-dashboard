import { useEffect, useState } from 'react'
import { CircleDashed, CircleDot, CircleCheck } from 'lucide-react'
import { pollStagedStatus } from '../lib/pollStagedStatus'
import { saveEdit } from '../lib/saveEdit'
import { saveChecklistItem } from '../lib/checklistStore'
import {
  ONBOARDING_ITEMS,
  LINK_ITEM_COUNTS,
  isLinkedChecklistCompleteFromRecord,
  fetchLinkedChecklistRecord,
  fetchJobCreatedAt,
  isTwoWeeksOverdueFromStamp,
  isItemSettledNow,
  WEEKLY_ITEM_INDEX,
} from '../lib/onboardingChecklist'

import { workerFetch } from '@/lib/workerClient'
import { isCurrentWeek } from '../lib/weekStart'

// Thursday morning is when the Weekly job check sheet is supposed to be
// done for the week (see its "Notes for the meeting" field) — if it isn't
// finished by then, item 18 should be hard to miss rather than just another
// unchecked row.
function isThursdayMorning() {
  const now = new Date()
  return now.getDay() === 4 && now.getHours() < 12
}

// "2026-09-05" -> "5 Sept". Parsed from the parts rather than through
// new Date("2026-09-05"), which JS reads as UTC midnight and renders as the
// 4th anywhere west of Greenwich — and as a date that reads one day early is
// exactly the bug weekStart.js already had to fix once, it isn't worth
// reintroducing here.
function formatWeekOf(weekOf) {
  if (!weekOf) return ''
  const [y, m, d] = weekOf.split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
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

// A single checkbox: done, or not done. Saves as 'Yes' / '' under the hood,
// so the workbook's Main Sheet columns are untouched.
function ChecklistCell({ value, saving, onChange }) {
  // 'N/A' is no longer offered — an item is either done or it isn't. Values
  // already saved as 'N/A' still read as done, so the 50-odd items across 17
  // jobs that people deliberately marked not-applicable don't reappear as
  // outstanding work. Toggling one writes 'Yes' or '', so N/A drains out of
  // the workbook naturally rather than needing a rewrite.
  const done = value === 'Yes' || value === 'N/A'
  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={saving}
        onClick={() => onChange(done ? '' : 'Yes')}
        aria-pressed={done}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[14px] font-bold transition-colors disabled:opacity-50 ${
          done
            ? 'border-brand-green bg-brand-green text-[#04170c]'
            : 'border-white/20 bg-white/[0.03] text-white/25 hover:border-brand-green/60 hover:bg-brand-green/10 hover:text-brand-green'
        }`}
        title={done ? 'Done — click to clear' : 'Mark done'}
      >
        ✓
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
  const weeklyColKey = columns[WEEKLY_ITEM_INDEX]?.key

  // The Weekly Job Check Sheet record for every job whose item 18 is ticked
  // — needed because that tick expires when the week rolls over (see
  // isItemSettledNow), and the counts below cover all 28 jobs, not just the
  // selected one. Only ticked jobs are fetched: where the item is already
  // unticked no weekly record can change the answer, so asking would be 28
  // requests to learn nothing.
  const [weeklyByJob, setWeeklyByJob] = useState(() => new Map())
  const weeklyTickedJobs = jobs
    .filter((j) => {
      const v = values[j.jobNumber]?.[weeklyColKey]
      return v === 'Yes' || v === 'N/A'
    })
    .map((j) => j.jobNumber)
  // A string, not the array — the array is rebuilt every render and would
  // re-fire the effect forever.
  const weeklyFetchKey = weeklyTickedJobs.join(',')
  // Derived rather than a `loaded` flag, which would mean setting state
  // synchronously inside the effect for the nothing-to-fetch case. An empty
  // list is vacuously loaded, which is the right answer anyway.
  const weeklyLoaded = weeklyTickedJobs.every((n) => weeklyByJob.has(n))
  useEffect(() => {
    if (!weeklyFetchKey) return
    let cancelled = false
    Promise.all(
      weeklyFetchKey
        .split(',')
        .map((n) => fetchLinkedChecklistRecord('weekly', n).then((r) => [n, r])),
    ).then((entries) => {
      if (!cancelled) setWeeklyByJob(new Map(entries))
    })
    return () => {
      cancelled = true
    }
  }, [weeklyFetchKey])

  // Ticked, or holding a legacy 'N/A' from before the N/A option was removed
  // — both mean the item needs no further action. Item 18 additionally has to
  // still be true *this week*; until its records land, fall back to the raw
  // value so the list doesn't paint ticks off and then back on.
  const isSettled = (jobNumber, colKey) => {
    const v = values[jobNumber]?.[colKey]
    if (colKey !== weeklyColKey || !weeklyLoaded) return v === 'Yes' || v === 'N/A'
    return isItemSettledNow(ONBOARDING_ITEMS[WEEKLY_ITEM_INDEX], v, weeklyByJob.get(jobNumber) ?? null)
  }
  const settledCount = (jobNumber) => columns.filter((c) => isSettled(jobNumber, c.key)).length

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
  // Owner groups for the picker, in the order a person would look: named
  // owners alphabetically, then the unowned jobs last. Built from whichever
  // list the progress filter has left visible, so the two controls compose
  // rather than fight — filtering to "Not started" then opening the picker
  // shows only the not-started jobs, still grouped by who owns them.
  // Plain derived value, not a useMemo: sortedJobs is rebuilt and sorted in
  // place on each render, so the compiler cannot prove a manual memo here is
  // safe — and it optimises this for us once we stop asking.
  const ownerGroups = (() => {
    const source = visibleJobs.length > 0 ? visibleJobs : sortedJobs
    const byOwner = new Map()
    for (const job of source) {
      const owner = (job.jobOwner || '').trim()
      if (!byOwner.has(owner)) byOwner.set(owner, [])
      byOwner.get(owner).push(job)
    }
    return [...byOwner.entries()]
      .map(([owner, list]) => ({ owner, jobs: list }))
      .sort((a, b) => {
        if (!a.owner) return 1
        if (!b.owner) return -1
        return a.owner.localeCompare(b.owner)
      })
  })()

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

    // The gate runs before the no-op check on purpose. Item 18's tick expires
    // when the week rolls over while the stored column still says 'Yes', so
    // clicking it sends 'Yes' over 'Yes' — an early return there would make
    // the click do nothing at all, with no hint why.
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

    if (newValue === previousValue) return

    setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [colKey]: newValue } }))
    setSavingKeys((prev) => new Set(prev).add(cellKey))
    setStatus({ kind: 'idle', message: '' })

    const column = columnByKey.get(colKey)
    function revert(message) {
      setValues((prev) => ({ ...prev, [job.jobNumber]: { ...prev[job.jobNumber], [colKey]: previousValue } }))
      setStatus({ kind: 'error', message })
    }

    setStatus({ kind: 'idle', message: `Saving "${column.label}" for ${job.jobNumber} ${job.jobName}…` })
    // Straight to KV, keyed by the item's own id. This used to stage an Excel
    // edit and wait on a merge, which is why a checkbox took minutes; nothing
    // in the workbook reads these columns.
    const saved = await saveChecklistItem(job.jobNumber, item.id, newValue)
    if (saved) {
      setStatus({ kind: 'ok', message: `Saved "${column.label}" for ${job.jobNumber} ${job.jobName}.` })
      // Item 19 ("Job completion checklist completed") archives the job
      // the moment it's marked Yes — that's the whole point of the item.
      if (item?.link === 'completion' && newValue === 'Yes') archiveJob(job)
    } else {
      revert('Could not save — nothing was changed.')
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
          Tick a task when it&apos;s done — it saves instantly and syncs everywhere, while the
          workbook itself catches up in the background. From the workbook&apos;s Main Sheet.
        </p>
      </div>

      {(status.message || archiving) && (
        <p className={`text-sm ${status.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
          {status.message}
        </p>
      )}

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        {/* Sticks to the top while the list scrolls. Nineteen items is more
            than a screen, and once the header had gone there was nothing on
            the page saying which job you were ticking — on a checklist that
            writes straight through to the workbook, that is not a cosmetic
            problem. The job picker rides along with it, so switching job no
            longer means scrolling back up either. */}
        <div className="checklist-jobbar flex flex-wrap items-center justify-between gap-4">
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
            /* A <select> sizes itself to its widest option, and these read
               "6792 — Major Hornbrook · 13/19" — wide enough to push the page
               past a phone's screen and give the whole dashboard a horizontal
               scrollbar. min-w-0 + max-w-full lets it shrink; the browser
               truncates the label and the full text is still there when the
               list is open. */
            className="min-w-0 max-w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-neutral-200 focus:border-brand-green/50 focus:outline-none"
          >
            {/* Grouped by owner. Twenty-eight jobs in one flat list means
                scanning all of them to find the three that are yours; the
                owner is already on this sheet, so the grouping costs nothing
                but reading it. Jobs with nobody in the owner column go in a
                group that says so rather than being quietly dropped — there
                are ten of them, and a list that hid a third of the work
                would be worse than an ungrouped one. */}
            {ownerGroups.map(({ owner, jobs: groupJobs }) => (
              <optgroup key={owner || '_none'} label={owner || 'No owner set'}>
                {groupJobs.map((job) => (
                  <option key={job.jobNumber} value={job.jobNumber} className="bg-[#11161c] text-neutral-200">
                    {job.jobNumber} — {job.jobName} · {progressByJob.get(job.jobNumber)}/{columns.length}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* A compact filter row, not three 152px cards.
            Those cards are right on Projects, where three of them ARE the
            page. Here they are a control: the page is the checklist
            underneath, and the cards pushed it below the fold so the first
            thing you came to read needed a scroll to reach. The counts still
            lead — they are the number you want off this page — but at a size
            that suits a filter rather than a headline. Clicking one filters
            the picker below; clicking the active one again clears it. */}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PROGRESS_CARDS.map((card) => {
            const active = progressFilter === card.key
            const count = filterCounts[card.key]
            const alert = card.key === 'notStarted' && count > 0
            const Icon = card.icon
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => applyFilter(active ? 'all' : card.key)}
                aria-pressed={active}
                className={`checklist-filter ${active ? 'is-active' : ''}`}
              >
                <span className="checklist-filter__icon" aria-hidden="true">
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                <span className={`checklist-filter__count ${alert ? 'is-alert' : ''}`}>{count}</span>
                <span className="checklist-filter__label">{card.label}</span>
                {/* The explanation only appears on the one you have chosen —
                    three of them at rest was three lines of text nobody was
                    reading, for the same reason the cards were too tall. */}
                {active && <span className="checklist-filter__hint">Showing these · click to clear</span>}
              </button>
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

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-neutral-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-full bg-amber-400/70" /> To do
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-full bg-brand-green/70" /> Done
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map((c, i) => {
                const item = ONBOARDING_ITEMS[i]
                const label = item?.label ?? c.label
                const itemValue = values[selectedJob.jobNumber][c.key]
                const isDone = isSettled(selectedJob.jobNumber, c.key)
                const pending = !isDone
                // Item 18 ticked in the workbook, but for a week that has
                // since ended — worth saying out loud, because otherwise the
                // row just quietly reads as never done.
                const weeklyExpired =
                  c.key === weeklyColKey && pending && (itemValue === 'Yes' || itemValue === 'N/A')
                // Two different reasons an expired item 18 can be outstanding,
                // and saying the wrong one is worse than saying nothing: the
                // sheet may be this week's and unfinished, or it may be a
                // completed sheet from a week that has since ended.
                const weeklyNote = !weeklyExpired
                  ? ''
                  : isCurrentWeek(linkedRecords.weekly?.weekOf)
                    ? `This week's sheet is ${(linkedRecords.weekly?.items ?? []).filter((it) => it.done || it.na).length} of ${LINK_ITEM_COUNTS.weekly} done.`
                    : formatWeekOf(linkedRecords.weekly?.weekOf)
                      ? `Last done for the week of ${formatWeekOf(linkedRecords.weekly.weekOf)} — this week's sheet isn't started.`
                      : "This week's sheet isn't started."
                // Both branches require the item to still be outstanding. The
                // weekly one used to skip that check, which is how a ticked
                // row ended up flashing red.
                const overdue =
                  (item?.link === 'weekly' &&
                    pending &&
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
                    : 'border-white/15 bg-white/[0.05] border-l-[3px] border-l-amber-400/70'
                const cellKey = `${selectedJob.jobNumber}:${c.key}`
                const rowSaving = savingKeys.has(cellKey)
                // With N/A gone there is one control per row, and it was a 32px
                // box you had to hit exactly — awkward on a tablet on site.
                // Clicking anywhere on the row now toggles it. Clicks that
                // start on a real control (the link on items 18/19, the
                // retention input on item 4, the tick itself) are left alone so
                // they keep doing their own job.
                //
                // Deliberately not role="button": the row already contains
                // buttons, and nesting interactive roles breaks screen-reader
                // navigation. The tick stays the real control for keyboard and
                // assistive tech; the row click is a pointer convenience.
                const toggleRow = (e) => {
                  if (rowSaving) return
                  if (e.target.closest('button, input, a')) return
                  handleChange(selectedJob, c.key, isDone ? '' : 'Yes', item)
                }
                return (
                  <div
                    key={c.key}
                    onClick={toggleRow}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border p-3 transition-colors hover:border-white/25 ${rowStyle} ${
                      rowSaving ? 'opacity-60' : ''
                    }`}
                  >
                    {item?.link ? (
                      <div className="flex-1">
                        <button
                          type="button"
                          onClick={() =>
                            item.link === 'weekly'
                              ? onOpenWeeklyCheckSheet(selectedJob)
                              : onOpenJobCompletionChecklist(selectedJob)
                          }
                          className="text-left text-[13.5px] leading-snug text-brand-green underline decoration-brand-green/40 underline-offset-2 hover:text-white"
                        >
                          <span className="mr-2 font-semibold tabular-nums text-neutral-400">{i + 1}.</span>
                          {label}
                        </button>
                        {weeklyNote && (
                          <p className="mt-1 text-[11.5px] text-neutral-400">{weeklyNote}</p>
                        )}
                      </div>
                    ) : (
                      // Settled items step back so the eye lands on what is left.
                      <span
                        className={`text-[13.5px] leading-snug ${
                          isDone ? 'text-neutral-400' : 'text-neutral-100'
                        }`}
                      >
                        <span className="mr-2 font-semibold tabular-nums text-neutral-400">{i + 1}.</span>
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
                            {overdue ? 'Overdue' : '2 weeks'}
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
                        <span className="text-[12px] text-neutral-400">%</span>
                      </div>
                    )}
                    <div className="shrink-0">
                      <ChecklistCell
                        value={isDone ? 'Yes' : ''}
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
