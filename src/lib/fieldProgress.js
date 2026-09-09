// The dashboard's copy of the field app's progress rules.
//
// Deliberately duplicated rather than shared. The two apps are separate
// repositories deployed independently, and a shared package for thirty lines
// of arithmetic would cost more than it saves at this size. The trade is that
// these rules can drift, so if you change one, change the other: the
// authoritative version, with its tests, is src/lib/progress.js in the
// cde-field repo.
//
// The rules, in short: N/A tasks are excluded rather than counted as zero, a
// job with no tasks is not a job at 0%, and the displayed figure never rounds
// up to 100 or down to 0.
export function fieldProgress(tasks) {
  const counted = (tasks ?? []).filter((t) => !t.na)
  if (counted.length === 0) return { state: 'no-data', percent: null, started: 0, total: 0 }

  const started = counted.filter((t) => typeof t.pct === 'number' && t.pct > 0).length
  const raw = counted.reduce((sum, t) => sum + (typeof t.pct === 'number' ? t.pct : 0), 0) / counted.length
  if (raw <= 0) return { state: 'zero', percent: 0, started: 0, total: counted.length }

  const everyTaskDone = counted.every((t) => t.pct === 100)
  const rounded = raw >= 100 ? (everyTaskDone ? 100 : 99) : Math.min(99, Math.max(1, Math.round(raw)))
  return {
    state: rounded >= 100 ? 'complete' : 'progress',
    percent: rounded,
    started,
    total: counted.length,
  }
}

// A field figure nobody has touched in a fortnight is exactly as misleading
// as a stale export, and the job page already has the vocabulary for saying
// so — see the weeksBehind pill in StatusPills.
const STALE_AFTER_DAYS = 7

export function daysSince(iso) {
  if (!iso) return null
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  return Number.isFinite(days) ? Math.floor(days) : null
}

export function isStale(iso) {
  const days = daysSince(iso)
  return days !== null && days > STALE_AFTER_DAYS
}

// Turns the stored record into rows the tab can render, in catalogue order,
// with labels resolved from the catalogue rather than the slug. Tasks the
// catalogue no longer lists still appear if something was recorded against
// them — removing a task from the list must not silently delete the history.
export function toTaskRows(record, catalogue) {
  if (!record?.tasks) return []
  const recorded = record.tasks
  const listed = (catalogue ?? []).map((entry) => ({
    id: entry.id,
    label: entry.label,
    ...(recorded[entry.id] ?? {}),
    recorded: entry.id in recorded,
  }))
  const listedIds = new Set(listed.map((t) => t.id))
  const orphans = Object.keys(recorded)
    .filter((id) => !listedIds.has(id))
    .map((id) => ({ id, label: id, ...recorded[id], recorded: true, orphan: true }))
  return [...listed, ...orphans].filter((t) => t.recorded)
}
