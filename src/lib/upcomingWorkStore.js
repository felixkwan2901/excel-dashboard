import { getAppData, setAppData } from './appData'
import { setJobField } from './jobFieldMerge'

// Planned hours per month per job, and the note beside them.
//
// The last thing anybody typed into the workbook. Like the checklist and the
// claim figures, nothing in the file calculates from these — the capacity
// comparison is worked out on the page, from staff on tools, working days and
// the productive allowance. Writing them to Excel bought a merge and a
// redeploy for a number in a cell.
//
// The workbook is still read as the fallback, so the fifty-one values already
// recorded there keep showing without a migration.
export const UPCOMING_WORK_KEY = 'planning:upcoming-work'

// Keyed by month name and the literal 'notes', not by sheet column. Month
// names because that is what the page and the parsed job object already use;
// a column number is a fact about a spreadsheet this data is leaving.
export const MONTH_KEYS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const NOTES_FIELD = 'notes'

// { [jobNumber]: { Jan: '120', Feb: '', notes: '…' } }
export async function fetchUpcomingWork() {
  return (await getAppData(UPCOMING_WORK_KEY)) ?? {}
}

export async function saveUpcomingWorkField(jobNumber, fieldId, value) {
  if (fieldId !== NOTES_FIELD && !MONTH_KEYS.includes(fieldId)) {
    throw new Error(`Unknown upcoming-work field: ${fieldId}`)
  }
  const current = await fetchUpcomingWork()
  const next = setJobField(current, jobNumber, fieldId, value)
  const ok = await setAppData(UPCOMING_WORK_KEY, next)
  return ok ? next : null
}
