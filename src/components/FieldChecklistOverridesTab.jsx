import { useState } from 'react'

// Per-job customization of the field app's checklist. The 21-task template
// stays the shared default for every job of its type — this only rewords a
// task for THIS job, or adds a task specific to it. Removing/hiding a base
// task is deliberately not offered here; that is a different feature that
// was considered and not chosen.
//
// The crew can make the same two kinds of edit from the field app itself,
// once they're on site — this is the office's half of the same feature, not
// the only half. A site edit always wins over whatever is typed here if the
// two ever disagree on the same task, since the person standing there is the
// more current source; see cde-field's buildJobs.js for that merge.

// Same shape as JobTable.jsx's DetailCell: uncontrolled, saved on blur, keyed
// on the stored value so an external change (a site override arriving) remounts
// it with fresh text instead of an effect fighting whoever is typing.
function OverrideField({ label, value, placeholder, saving, onSave }) {
  return (
    <input
      type="text"
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      disabled={saving}
      aria-label={`Custom wording for "${label}"`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        const next = e.target.value.trim()
        if (next !== value) onSave(next)
      }}
      className={`w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:border-brand-green/50 focus:outline-none ${
        saving ? 'opacity-50' : ''
      }`}
    />
  )
}

function AddExtraTask({ saving, onAdd }) {
  const [text, setText] = useState('')
  const ready = text.trim().length > 0

  function submit(e) {
    e.preventDefault()
    if (!ready) return
    onAdd(text.trim())
    setText('')
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 pt-3">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 140))}
        placeholder="e.g. Confirm supply authority sign-off before energising"
        className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:border-brand-green/50 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!ready || saving}
        className="shrink-0 rounded-md bg-brand-green/90 px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-40"
      >
        Add
      </button>
    </form>
  )
}

export default function FieldChecklistOverridesTab({
  type,
  catalogue,
  overrides,
  saving,
  onSaveOverride,
  onSaveExtra,
  onRemoveExtra,
}) {
  if (!type) {
    return (
      <p className="py-6 text-[13px] text-neutral-400">
        Set a type of work for this job on the Projects tab first — the checklist depends on
        knowing whether it&apos;s commercial or residential.
      </p>
    )
  }

  const taskOverrides = overrides?.overrides ?? {}
  const extra = overrides?.extra ?? []

  return (
    <div>
      <p className="pb-3 text-[13px] text-neutral-400">
        Reword a task or add a step specific to this job. Everything else on the{' '}
        {type} checklist stays as it is for every other job of this type.
      </p>

      <div className="divide-y divide-white/[0.06] rounded-lg border border-white/10">
        {catalogue.map((task) => (
          <div key={task.id} className="flex flex-col gap-1.5 px-3 py-2.5">
            <span className="text-[12px] text-neutral-500">{task.label}</span>
            <OverrideField
              label={task.label}
              value={taskOverrides[task.id] ?? ''}
              placeholder={task.label}
              saving={saving?.has(`override:${task.id}`) ?? false}
              onSave={(value) => onSaveOverride(task.id, value)}
            />
          </div>
        ))}

        {extra.map((task) => (
          <div key={task.id} className="flex items-start gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-[12px] text-neutral-500">Added for this job</span>
              <OverrideField
                label={task.label}
                value={task.label}
                placeholder="Extra task"
                saving={saving?.has(`extra:${task.id}`) ?? false}
                onSave={(value) => onSaveExtra({ id: task.id, label: value })}
              />
            </div>
            {/* Only an office-added task can be removed here — a task added
                from the field app is deleted where it was written, the same
                rule already applied to hazards there. */}
            <button
              type="button"
              onClick={() => onRemoveExtra(task.id)}
              disabled={saving?.has(`extra:${task.id}`)}
              className="shrink-0 px-1 pt-6 text-[12px] text-neutral-500 hover:text-red-400 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <AddExtraTask saving={saving?.has('newExtra')} onAdd={(label) => onSaveExtra({ label })} />
    </div>
  )
}
