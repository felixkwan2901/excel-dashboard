import { getAppData, setAppData } from './appData'
import { ONBOARDING_ITEMS } from './onboardingChecklist'
import { setJobField } from './jobFieldMerge'

// The job onboarding checklist, stored in KV rather than the workbook.
//
// The ticks used to be written to Main Sheet columns D..W, which cost an
// Excel merge and a redeploy — about three minutes — for every checkbox. No
// formula anywhere in the workbook reads those columns: of the 3,157 formulas
// in the file, 3,151 are on a test sheet the site never opens, and none of
// the six that remain touches the checklist. The workbook was being used as a
// slow database for data only this site reads.
//
// The workbook is still read as the fallback, so every tick already recorded
// keeps showing without a migration. Anything set from now on lives here.
export const CHECKLIST_KEY = 'planning:job-checklist'

// { [jobNumber]: { [itemId]: 'Yes' | 'N/A' | '' } }
//
// Keyed by item id, not by column number. Positional storage is what made
// this brittle: reordering or inserting an item would have silently
// re-pointed every recorded tick at a different question, with nothing on
// screen to show it had happened.
export async function fetchJobChecklists() {
  return (await getAppData(CHECKLIST_KEY)) ?? {}
}

// Read-modify-write of the one blob. Returns the map saved, or null if the
// write never reached the server — a tick must not stay on screen if it was
// not stored.
export async function saveChecklistItem(jobNumber, itemId, value) {
  if (!ONBOARDING_ITEMS.some((i) => i.id === itemId)) {
    throw new Error(`Unknown checklist item: ${itemId}`)
  }
  const job = String(jobNumber)
  const current = await fetchJobChecklists()
  const next = setJobField(current, job, itemId, value)
  const ok = await setAppData(CHECKLIST_KEY, next)
  return ok ? next : null
}
