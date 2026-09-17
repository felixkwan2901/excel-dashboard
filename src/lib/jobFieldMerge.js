// How one edit changes a stored { job: { field: value } } blob.
//
// Shared by every store that keeps hand-typed values out of the workbook —
// the checklist and the Monthly Claims figures — because the rule below is
// the same for all of them and is the part that can quietly lose somebody's
// work. Kept import-free so scripts/__tests__ can load it under plain node.

// A cleared value is stored as an empty string, never removed. The workbook
// is still read as the fallback for anything this blob has no entry for, so
// deleting the key hands the field straight back to whatever the spreadsheet
// says — which means clearing it silently undoes itself on the next reload.
// Confirmed on job 9259 before this was fixed: an unticked item came back.
// "Cleared" and "nothing recorded" have to stay different values.
export function setJobField(current, jobNumber, fieldId, value) {
  const job = String(jobNumber)
  return {
    ...(current ?? {}),
    [job]: { ...((current ?? {})[job] ?? {}), [fieldId]: String(value ?? '').trim() },
  }
}
