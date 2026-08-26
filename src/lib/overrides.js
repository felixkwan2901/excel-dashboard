import { getAppData, setAppData } from './appData'

// One KV blob per sheet ("override:main-sheet" / "override:claim-calculator"
// / "override:upcoming-work"), shaped { [jobNumber]: { [col]: { value, ts } } }.
// This is the instant, cross-device layer saveEdit() writes to right away —
// see that file for why. Reading a job's data (loadWorkbook.js) overlays
// these on top of whatever the Excel workbook itself currently says, so an
// edit shows up everywhere in about a second instead of the ~1-2 minutes
// the real merge+redeploy takes. Each entry gets cleared once the real
// Excel edit lands (or fails) — see saveEdit.js — so in steady state this
// blob only ever reflects edits genuinely still in flight, not a growing
// pile of history.
//
// A shared blob per sheet (rather than one key per job) means reading
// overrides for a whole page is 3 KV reads total, not up to 90 — at the
// cost of a small, accepted race: two edits to the same sheet landing in
// the same instant could clobber each other's overlay entry. That's a
// cosmetic risk only (the real Excel save for each edit still happens
// independently either way), acceptable for how few people use this site
// at once.

export async function fetchOverrides(sheet) {
  return (await getAppData(`override:${sheet}`)) ?? {}
}

export async function setOverride(sheet, jobNumber, col, value) {
  const current = (await getAppData(`override:${sheet}`)) ?? {}
  const next = {
    ...current,
    [jobNumber]: { ...current[jobNumber], [col]: { value, ts: Date.now() } },
  }
  await setAppData(`override:${sheet}`, next)
}

export async function clearOverride(sheet, jobNumber, col) {
  const current = (await getAppData(`override:${sheet}`)) ?? {}
  if (!current[jobNumber]?.[col]) return
  const nextJob = { ...current[jobNumber] }
  delete nextJob[col]
  await setAppData(`override:${sheet}`, { ...current, [jobNumber]: nextJob })
}
