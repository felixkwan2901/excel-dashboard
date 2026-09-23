// Per-job customization of the field app's 21-task checklist — the key and
// the shape, and where the answer is stored.
//
// Constants and pure functions only, deliberately free of imports:
// scripts/__tests__ runs under plain node, which cannot resolve this
// project's extensionless Vite imports. The reading and writing lives in
// fieldChecklistOverridesStore.js.
//
// What this is NOT: a way to hide a task that doesn't apply to a job. The
// 21-item template stays the shared default for every job of its type —
// this only rewords an existing task for one specific job, or adds an extra
// task specific to it. Removing/hiding a base task was considered and not
// chosen.
//
// This exact string has to be in the Worker's APP_DATA_KEY_RE allowlist
// (upload-worker/src/index.js AND site-worker/index.js) or every save is
// rejected with a 400.
export const FIELD_CHECKLIST_OVERRIDES_KEY = 'planning:field-checklist-overrides'

// { [jobNumber]: { overrides: { [taskId]: "custom wording" },
//                  extra: [{ id: "office-<uuid>", label: "..." }] } }
//
// Office edits carry no individual "by" attribution — consistent with the
// owner and category edits, which also record no name for who set them.
// A site edit made from the field app always does carry one; that
// asymmetry is deliberate and lives on the field-app side of this feature.
export const EMPTY_JOB_OVERRIDES = { overrides: {}, extra: [] }

// True if a job has nothing customized — used to decide whether the job's
// entry in the stored blob can be dropped entirely rather than kept as an
// empty shell.
export function isEmptyOverrides(entry) {
  if (!entry) return true
  const overrides = entry.overrides ?? {}
  const extra = entry.extra ?? []
  return Object.keys(overrides).length === 0 && extra.length === 0
}
