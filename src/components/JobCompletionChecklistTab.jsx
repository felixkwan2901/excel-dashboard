import { useLocalStorageState } from '../lib/useLocalStorageState'

// Matches the paper "Job Completion Checklist" exactly — 11 close-out
// items, each a checkbox or N/A, plus a completed date and free notes.
// Saved to this browser's local storage per job (no Excel sheet backs this
// yet), same as the Weekly job check sheet.
const ITEMS = [
  'Final QA completed',
  'Certificate of Compliance (COC) issued',
  'As-built drawings completed and issued',
  'O&M manuals / warranty documentation handed over',
  'Defects (snag) list closed out',
  'Client / builder sign-off obtained',
  'Final invoice raised',
  'Retentions claim lodged',
  'Job closed in Katipult / Procore',
  'WhatsApp group archived',
  'Tools, equipment, and leftover materials returned to yard',
]

function defaultState() {
  return {
    dateCompleted: '',
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

export default function JobCompletionChecklistTab({ job, onBack }) {
  const [state, setState] = useLocalStorageState(`jobCompletionChecklist:${job.jobNumber}`, defaultState())
  const doneCount = state.items.filter((i) => i.done || i.na).length

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
        <span className="text-text-primary">Job completion checklist</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Job completion checklist</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {job.jobNumber} {job.jobName}
        </p>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <div className="flex items-center gap-2">
          <label htmlFor="date-completed" className="text-[13px] text-neutral-500">
            Date completed
          </label>
          <input
            id="date-completed"
            type="date"
            value={state.dateCompleted}
            onChange={(e) => setState((prev) => ({ ...prev, dateCompleted: e.target.value }))}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-neutral-200 focus:border-brand-green/50 focus:outline-none"
          />
        </div>

        <p className="mt-4 text-[13px] text-neutral-400">{doneCount} of {ITEMS.length} items complete</p>
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
          <label htmlFor="completion-notes" className="mb-1 block text-[12px] text-neutral-500">
            Notes / flags for attention
          </label>
          <textarea
            id="completion-notes"
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
