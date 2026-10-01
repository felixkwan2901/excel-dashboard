// The pure half of the field-app link (no network, so Node can test it):
// the list the phones read, and what one field record means on the dashboard.
import { CATEGORY_SITE_TYPE } from './jobCategories.js'
import { fieldProgress, isStale, toTaskRows } from './fieldProgress.js'

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
      const type = CATEGORY_SITE_TYPE[(j.jobCategory || '').trim()] ?? prev.type
      return { ...prev, jobNumber: String(j.jobNumber), jobName: j.jobName, ...(type ? { type } : {}) }
    })
    .sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber))
}

// One record → what the dashboard shows for it. Who is on site is whoever's
// latest visit is an arrival; "updated" is the last change to any task.
export function summariseFieldRecord(record) {
  if (!record) return null
  const progress = fieldProgress(toTaskRows(record, null))
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

