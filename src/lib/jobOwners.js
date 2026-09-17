// Who owns a job — the names and where the answer is stored.
//
// Constants only, and deliberately free of imports: scripts/__tests__ runs
// under plain node, which cannot resolve this project's extensionless Vite
// imports. The reading and writing lives in jobOwnerStore.js.

// A fixed list rather than free text. The workbook column already held "Tom"
// and "Cameron" against "Tom Price" and "Cameron Skilton", and two spellings
// of one person are two owners to every filter, group and count in the app.
export const JOB_OWNERS = ['Cameron Skilton', 'Charles Roselier', 'Tom Price']

// The owner lives in the KV store rather than in the workbook. It used to be
// written to Main Sheet column C, which cost an Excel merge and a redeploy —
// about three minutes — every time somebody picked a name from a dropdown,
// and bought nothing: no formula on any sheet references that column. It is a
// label. The workbook is still read as the fallback, so owners already
// recorded there keep showing without a migration.
//
// This exact string has to be in the Worker's APP_DATA_KEY_RE allowlist
// (upload-worker/src/index.js) or every save is rejected with a 400.
export const OWNERS_KEY = 'planning:job-owners'
