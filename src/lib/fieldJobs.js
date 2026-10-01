// The two-way link with the field app, kept live from the browser.
//
//   Dashboard → field app   planning:field-jobs is the list the crew's phones
//                           read. scripts/publish-field-jobs.mjs rebuilds it
//                           from the workbook on a schedule; this rebuilds the
//                           same list the moment the dashboard knows better —
//                           a type of work changed, a job added or archived —
//                           so a phone never waits for the daily run.
//   Field app → dashboard   field:<jobNumber> is what the crew tap on site.
//                           fetchFieldProgress reads every active job's record
//                           so the Projects table and the home screen can show
//                           site progress and who is on site, refreshed while
//                           the page is open.
import { getAppData, setAppData } from './appData'
import { buildFieldJobs, summariseFieldRecord } from './fieldSync'

export { buildFieldJobs, summariseFieldRecord }

export const FIELD_JOBS_KEY = 'planning:field-jobs'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Reads the list, rebuilds it, and writes it back only if it changed.
// Returns 'unchanged' | 'published' | 'failed'.
export async function publishFieldJobs({ jobs, archivedJobs = [] }) {
  const existing = await getAppData(FIELD_JOBS_KEY)
  const archived = new Set(archivedJobs.map((j) => String(j.jobNumber)))
  const next = buildFieldJobs(existing, jobs, archived)
  const prev = [...(Array.isArray(existing) ? existing : [])].sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber))
  if (same(prev, next)) return 'unchanged'
  return (await setAppData(FIELD_JOBS_KEY, next)) ? 'published' : 'failed'
}

// Every job's record at once — one read per job, in parallel.
export async function fetchFieldProgress(jobNumbers) {
  const entries = await Promise.all(jobNumbers.map(async (n) => [String(n), summariseFieldRecord(await getAppData(`field:${n}`))]))
  return new Map(entries.filter(([, v]) => v))
}
