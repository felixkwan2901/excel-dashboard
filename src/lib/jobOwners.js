// Who owns a job, and where that is stored.
//
// The owner lives in Main Sheet column C and nothing has ever written it: the
// weekly Profit and Loss export from Katipolt carries no owner at all — its
// sheets are Quotes, Summary, Budgeted and Non-Budgeted, and none of them
// names a person. So the column was filled in by hand when a job was created,
// or not at all, and ten of twenty-eight jobs had no owner. The Owner column
// in the job directory is editable for that reason, and is the only column
// there that is: every other one comes from the workbook's own figures, where
// typing over the top would mean nothing.

// A fixed list rather than free text. The column already held "Tom" and
// "Cameron" against "Tom Price" and "Cameron Skilton", and two spellings of
// one person are two owners to every filter, group and count in the app.
export const JOB_OWNERS = ['Cameron Skilton', 'Charles Roselier', 'Tom Price']

// Main Sheet column C, 0-based — the index loadWorkbook.js reads the owner
// from, and the shape /main-sheet already accepts for checklist edits.
export const OWNER_COL = 2
