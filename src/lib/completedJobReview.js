// A completed QUOTED job needs a review when any actual figure came in over its
// quote: hours, labour cost or total cost. Shared by the Completed jobs tab (red
// cells, red row edge) and the notifications bell ("Completed jobs over quote").
const CHECKS = [
  { key: 'hours', label: 'hours', quoted: (j) => j.quotedHours, actual: (j) => j.hours, unit: 'h' },
  { key: 'labour', label: 'labour cost', quoted: (j) => j.labour?.quotedCost, actual: (j) => j.labour?.actualCost, unit: '$' },
  { key: 'cost', label: 'total cost', quoted: (j) => j.pl?.quotedCost, actual: (j) => j.pl?.actualCost, unit: '$' },
]

export function overruns(job) {
  if (job.type !== 'quoted') return []
  return CHECKS.flatMap((c) => {
    const q = c.quoted(job), a = c.actual(job)
    return q != null && a != null && a > q + 0.005 ? [{ key: c.key, label: c.label, quoted: q, actual: a, unit: c.unit }] : []
  })
}

export function jobsToReview(completedJobs) {
  return completedJobs
    .map((job) => ({ job, over: overruns(job) }))
    .filter((r) => r.over.length > 0)
}
