import { useLocalStorageState } from '../lib/useLocalStorageState'
import { currentWeekStart } from '../lib/weekStart'

// Matches the paper "Weekly Job Check Sheet" exactly — 9 recurring checks,
// each a checkbox or N/A, plus a status pill and free notes. Saved straight
// to this browser's local storage per job (no Excel sheet backs this yet),
// so it's instant and needs no password — same "click, done" feel as the
// rest of the checklist.
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

function ItemRow({ index, label, item, onChange }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3">
      <span className="w-6 shrink-0 text-[12px] text-neutral-500">{index + 1}.</span>
      <span className="flex-1 text-[13px] text-neutral-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange({ done: !item.done, na: false })}
        aria-pressed={item.done}
        className={`shrink-0 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
          item.done
            ? 'border-brand-green/40 bg-brand-green/10 text-brand-green'
            : 'border-white/10 bg-white/[0.02] text-neutral-500 hover:text-neutral-300'
        }`}
      >
        Done
      </button>
      <button
        type="button"
        onClick={() => onChange({ done: false, na: !item.na })}
        aria-pressed={item.na}
        className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
          item.na
            ? 'border-white/30 bg-white/[0.08] text-neutral-200'
            : 'border-white/10 bg-white/[0.02] text-neutral-500 hover:text-neutral-300'
        }`}
      >
        N/A
      </button>
    </div>
  )
}

export default function WeeklyCheckSheetTab({ job, onBack }) {
  const [state, setState] = useLocalStorageState(`weeklyCheckSheet:${job.jobNumber}`, defaultState(), {
    deserialize: (raw) => {
      const stored = JSON.parse(raw)
      const weekStart = currentWeekStart()
      // A saved sheet from before this week's Saturday is stale — reset it
      // rather than showing (or auto-completing) last week's ticks.
      return stored.weekOf && stored.weekOf >= weekStart ? stored : { ...defaultState(), weekOf: weekStart }
    },
  })
  const doneCount = state.items.filter((i) => i.done).length

  function updateItem(index, next) {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? next : it)),
    }))
  }

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
            <label htmlFor="week-of" className="text-[13px] text-neutral-500">
              Week of
            </label>
            <input
              id="week-of"
              type="date"
              value={state.weekOf}
              onChange={(e) => setState((prev) => ({ ...prev, weekOf: e.target.value }))}
              className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, status: s.key }))}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                  state.status === s.key ? s.style : 'border-white/10 text-neutral-500 hover:text-neutral-300'
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
          <label htmlFor="week-notes" className="mb-1 block text-[12px] text-neutral-500">
            Notes for the meeting
          </label>
          <textarea
            id="week-notes"
            rows={3}
            value={state.notes}
            onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}
