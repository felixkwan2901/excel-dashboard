import { getAppData, setAppData } from './appData'
import { setJobField } from './jobFieldMerge'

// The four figures on the Monthly Claims page that a person types rather than
// the weekly export supplying: retention, the hours and costs still to come
// before end of month, and the note.
//
// They used to be written to the Claim Calculator By Month sheet, which cost
// an Excel merge and a redeploy for each one. Nothing in the workbook
// calculates from them — the projected end-of-month figures are worked out in
// the page itself, from whatever value it holds. The workbook is still read
// as the fallback, so the thirty values already recorded there keep showing
// without a migration.
export const CLAIM_FIELDS_KEY = 'planning:claim-fields'

// Keyed by field name, not by the sheet column it used to occupy. Same
// reasoning as the checklist: a column number is a fact about a spreadsheet
// this data is leaving.
export const CLAIM_FIELDS = ['retention', 'hoursToCompleteBeforeEom', 'costsToComeBeforeEom', 'notes']

// Which of them are numbers, so a stored string reads back as the type the
// page expects rather than as "0" or NaN further down.
export const NUMERIC_CLAIM_FIELDS = new Set(['retention', 'hoursToCompleteBeforeEom', 'costsToComeBeforeEom'])

// { [jobNumber]: { retention: '2.5', notes: '…', … } }
export async function fetchClaimFields() {
  return (await getAppData(CLAIM_FIELDS_KEY)) ?? {}
}

// Read-modify-write of the one blob. Returns the map saved, or null if the
// write never reached the server.
export async function saveClaimField(jobNumber, fieldId, value) {
  if (!CLAIM_FIELDS.includes(fieldId)) throw new Error(`Unknown claim field: ${fieldId}`)
  const current = await fetchClaimFields()
  const next = setJobField(current, jobNumber, fieldId, value)
  const ok = await setAppData(CLAIM_FIELDS_KEY, next)
  return ok ? next : null
}
