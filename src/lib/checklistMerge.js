// The pure half of checklistStore: how one tick changes the stored blob.
//
// Kept import-free so scripts/__tests__ can load it under plain node, and
// separate from the network code because the rule below is the part that can
// quietly lose somebody's work.

// { [jobNumber]: { [itemId]: 'Yes' | 'N/A' | '' } }
//
// An untick is stored as an empty string, never removed. The workbook is
// still read as the fallback for any item this blob has no entry for, so
// deleting the key would hand the item straight back to whatever the
// spreadsheet says. For the 187 ticks already recorded there, that means an
// untick silently undoing itself on the next reload. "Not done" and "nothing
// recorded" have to stay different values.
export function nextChecklist(current, jobNumber, itemId, value) {
  const job = String(jobNumber)
  return {
    ...(current ?? {}),
    [job]: { ...((current ?? {})[job] ?? {}), [itemId]: String(value ?? '').trim() },
  }
}
