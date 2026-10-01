// The pure half of the field-app link (no network, so Node can test it):
// the list the phones read, and what one field record means on the dashboard.
import { CATEGORY_SITE_TYPE } from './jobCategories.js'
import { fieldProgress, isStale } from './fieldProgress.js'

// The same list the script builds (see scripts/publish-field-jobs.mjs): one
// entry per active job with its number, name and checklist type from the type
// of work; anything else already on an entry (the address, the map query) is
// kept. Order by job number so the list is the same whoever rebuilds it.
export function buildFieldJobs(existing, jobs, archivedNumbers = new Set()) {
  const before = new Map((Array.isArray(existing) ? existing : []).map((j) => [String(j.jobNumber), j]))
  return jobs
    .filter((j) => !archivedNumbers.has(String(j.jobNumber)))
    .map((j) => {
      const prev = before.get(String(j.jobNumber)) ?? {}
      // The type of work goes on the entry as `category` (the Today screen
      // groups by it) and decides the checklist `type`, exactly as the script does.
      const category = (j.jobCategory || '').trim()
      const type = CATEGORY_SITE_TYPE[category] ?? prev.type
      const { category: _old, ...rest } = prev // eslint-disable-line no-unused-vars
      return { ...rest, jobNumber: String(j.jobNumber), jobName: j.jobName, ...(category ? { category } : {}), ...(type ? { type } : {}) }
    })
    .sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber))
}

// The tasks a phone shows for a job, in the phone's own terms: the catalogue
// for the job's type (archived entries left out), the office's extra tasks for
// that job, and any the crew added on site — each with what has been recorded
// against it, or nothing. A task nobody has touched counts as 0, which is how
// the phone's ring works out the job's percentage.
export function jobTaskRows(record, catalogue = [], jobOverrides = null) {
  const ids = [
    ...(catalogue ?? []).filter((t) => t && !t.archived).map((t) => t.id),
    ...(jobOverrides?.extra ?? []).map((t) => t.id),
    ...(record?.extraTasks ?? []).map((t) => t.id),
  ].filter(Boolean)
  const seen = new Set()
  const rows = []
  for (const id of ids) { if (!seen.has(id)) { seen.add(id); rows.push({ id, ...(record?.tasks?.[id] ?? {}) }) } }
  for (const id of Object.keys(record?.tasks ?? {})) if (!seen.has(id)) { seen.add(id); rows.push({ id, ...record.tasks[id] }) }
  return rows
}

// One record → what the dashboard shows for it. Who is on site is whoever's
// latest visit is an arrival; "updated" is the last change to any task.
export function summariseFieldRecord(record, catalogue = [], jobOverrides = null) {
  if (!record) return null
  const progress = fieldProgress(jobTaskRows(record, catalogue, jobOverrides))
  const latest = new Map()
  for (const v of record.visits ?? []) {
    if (!v?.by || !v?.at) continue
    const cur = latest.get(v.by)
    if (!cur || v.at > cur.at) latest.set(v.by, v)
  }
  const onSite = [...latest.values()].filter((v) => v.action === 'arrived').map((v) => v.by)
  const updatedAt = (record.log ?? []).reduce((t, e) => (e?.at && (!t || e.at > t) ? e.at : t), null)
  return { ...progress, onSite, updatedAt, stale: progress.state === 'progress' && isStale(updatedAt) }
}

