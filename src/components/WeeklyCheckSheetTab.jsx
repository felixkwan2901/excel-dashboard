import { useEffect, useState } from 'react'
import { currentWeekStart, isCurrentWeek } from '../lib/weekStart'
import { getAppData, setAppData } from '../lib/appData'

// Matches the paper "Weekly Job Check Sheet" exactly — 9 recurring checks,
// each a simple done/not-done tick, plus a status pill and free notes. Saved to
// Cloudflare KV per job (see src/lib/appData.js) so it's shared across
// whatever device/browser you're on, not stuck to just one.
const ITEMS = [
  'Programme updated to reflect actual progress',
  'Labour confirmed for next week',
  'Materials on site / ordered for next 2 weeks',
  'Any materials that need returning from the job',
  'Return access equipment',
  'Any variations this week logged and priced',
  'Progress claim submitted (if due this week)',
  'Outstanding RFIs chased',
  'Toolbox talk / H&S walk done',
]

const STATUSES = [
  { key: 'on-track', label: 'On track', style: 'border-brand-green/40 bg-brand-green/10 text-brand-green' },
  { key: 'behind', label: 'Behind', style: 'border-amber-400/40 bg-amber-400/10 text-amber-400' },
  { key: 'flagged', label: 'Flagged', style: 'border-red-400/40 bg-red-400/10 text-red-400' },
]

function defaultState() {
  return {
    weekOf: currentWeekStart(),
    status: 'on-track',
    items: ITEMS.map(() => ({ done: false, na: false })),
    notes: '',
  }
}

// A saved sheet from before this week's Saturday is stale — reset it
// rather than showing (or auto-completing) last week's ticks.
function freshenIfStale(stored) {
  return isCurrentWeek(stored?.weekOf) ? stored : { ...defaultState(), weekOf: currentWeekStart() }
}

function ItemRow({ index, label, item, onChange }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3">
      <span className="w-6 shrink-0 text-[12px] text-neutral-400">{index + 1}.</span>
      <span className="flex-1 text-[13px] text-neutral-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange({ done: !(item.done || item.na), na: false })}
        aria-pressed={item.done || item.na}
        className={`shrink-0 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
          item.done || item.na
            ? 'border-brand-green/40 bg-brand-green/10 text-brand-green'
            : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-neutral-300'
        }`}
      >
        Done
      </button>
    </div>
  )
}

export default function WeeklyCheckSheetTab({ job, onBack }) {
  const [state, setState] = useState(null) // null while loading
  const [saveStatus, setSaveStatus] = useState('') // '' | 'saving' | 'saved'
  const [notesText, setNotesText] = useState('')

  useEffect(() => {
    let cancelled = false
    getAppData(`weekly:${job.jobNumber}`).then((stored) => {
      if (cancelled) return
      const fresh = freshenIfStale(stored)
      setState(fresh)
      setNotesText(fresh.notes)
    })
    return () => {
      cancelled = true
    }
  }, [job.jobNumber])

  function updateState(updater) {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      setSaveStatus('saving')
      setAppData(`weekly:${job.jobNumber}`, next).then((ok) =>
        setSaveStatus(ok ? 'saved' : 'error'),
      )
      return next
    })
  }

  function updateItem(index, next) {
    updateState((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? next : it)),
    }))
  }

  if (!state) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const doneCount = state.items.filter((i) => i.done || i.na).length

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Job checklist
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Weekly job check sheet</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Weekly job check sheet</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {job.jobNumber} {job.jobName}
        </p>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="week-of" className="text-[13px] text-neutral-400">
              Week of
            </label>
            <input
              id="week-of"
              type="date"
              value={state.weekOf}
              onChange={(e) => updateState((prev) => ({ ...prev, weekOf: e.target.value }))}
              className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            {saveStatus && (
              <span
                className={`text-[11px] ${saveStatus === 'error' ? 'text-red-400' : 'text-neutral-400'}`}
                title={saveStatus === 'error' ? 'This tick is only on this device — it will disappear on refresh.' : undefined}
              >
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Not saved' : 'Saved'}
              </span>
            )}
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => updateState((prev) => ({ ...prev, status: s.key }))}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                  state.status === s.key ? s.style : 'border-white/10 text-neutral-400 hover:text-neutral-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-4 text-[13px] text-neutral-400">{doneCount} of {ITEMS.length} checks done</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-brand-green transition-all"
            style={{ width: `${(doneCount / ITEMS.length) * 100}%` }}
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {ITEMS.map((label, i) => (
            <ItemRow key={i} index={i} label={label} item={state.items[i]} onChange={(next) => updateItem(i, next)} />
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="week-notes" className="mb-1 block text-[12px] text-neutral-400">
            Notes for the meeting
          </label>
          <textarea
            id="week-notes"
            rows={3}
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            onBlur={() => {
              if (notesText !== state.notes) updateState((prev) => ({ ...prev, notes: notesText }))
            }}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}
