---
name: katipolt-completed-export
description: Export this month's COMPLETED Katipolt jobs for the Cassidy-Davies dashboard's "Completed jobs" tab (GP per hour). Charge Up jobs get one Profit & Loss export each; Quoted jobs get a Profit & Loss export AND a Timesheets export each. Also exports the two filtered Jobs lists and writes manifest.csv, which maps every downloaded file to its job. Runs in the user's Chrome via Claude in Chrome. Use when asked to export, download or collect completed jobs, finished jobs, or this month's completed job reports from Katipolt.
---

# Katipolt completed-jobs export

Collects everything the dashboard needs to work out GP per hour for jobs completed this month, and a manifest that tells the dashboard which file belongs to which job. Runs in the user's own Chrome via the `mcp__claude-in-chrome__*` tools. Downloads land in the user's Downloads folder, which this session cannot see — never claim to have checked the files on disk.

**Why the manifest matters.** A Charge Up P&L export has no job number anywhere inside it, and every download gets a generic name (`ProfitAndLoss-2026-09-29-08_07.xlsx`, `Timesheets - 2026-09-29 (3).xlsx`). The dashboard matches files to jobs by **download order** and double-checks each match against a figure you read off the screen. So: one download at a time, in the order you write in the manifest, and never a download that isn't in the manifest (or a manifest row without its download).

## What gets downloaded

| Job type | Files per job | How |
|---|---|---|
| Charge Up | 1 — Profit & Loss | job → **More** → **Reports** → Export to Excel |
| Quoted | 2 — Profit & Loss, then Timesheets | job → **More** → **Reports** → Export to Excel; then **Sales & Costs** → **Timesheets** → **Export** |

Plus the two filtered **Jobs** lists (for job names), at the start.

## Before starting

1. Ask the user to **move any existing `ProfitAndLoss…`, `Timesheets…` and `Jobs…` files out of Downloads** (into another folder, or delete them). Old downloads with the same names break the ordering. Wait for them to confirm.
2. Create a task list (TaskCreate): build the job lists, Charge Up exports, Quoted exports, write the manifest, final report.
3. Confirm the Katipolt tab is open and take one full-size screenshot to establish the coordinate frame. Coordinates below are for a **1456x836** frame (from the in-progress P&L export). If the frame differs, read every position from screenshots instead of reusing these numbers — and do that anyway for the Timesheets steps, which were never measured.

## Step 1 — build the two job lists

On **Jobs**, set the filters with **Refine** (check them in a screenshot before reading anything):

- **Stage: Completed**
- **Job Type: Charge Up**, then later **Quoted**
- **Completed: This Month** — *not* "Last Modified". Last Modified pulls in far more jobs than were completed this month.

For each job type:
1. Read every **Job No.** on the list (`get_page_text` or screenshots). Check the "1–N of N" counter at the bottom and page through if N is more than the rows per page. The count you read must equal N.
2. Click the **export (cloud) icon** above the list to download the list itself (it saves as `Jobs - <date>.xlsx`). This gives the dashboard the job names.

Do Charge Up first, then Quoted. De-duplicate each list. Report both counts to the user before exporting anything.

## Step 2 — Charge Up jobs (one file each)

Same two-batch loop as the in-progress P&L export. Screenshot at the end of each batch — never click export without seeing the loaded card first.

### Batch A — search the job

```
left_click  (1082, 22)    # search icon in the top-right header
wait 1
triple_click (1267, 22)   # the search INPUT — second click is required, see quirks
type "<job number>"
wait 3
screenshot scale 0.6
```

Confirm a **Jobs** result row appeared and its number matches.

### Batch B — open the job's Reports tab

```
left_click  (1275, 148)   # first search result row
wait 4
left_click  (828, 122)    # "More" in the IN-PAGE tab bar
wait 1
left_click  (827, 197)    # "Reports" in the dropdown
wait 6
screenshot scale 0.6
```

Verify the header shows the expected job number **and** the Profit & Loss card has finished loading (not a spinner).

### Then — read, record, export

1. **Read the job's total Profit** from the P&L card (the Total row's Profit, or "Profit to Date"). Zoom into the card if the number is small. This is the manifest `check` value.
2. If the card says **"No data to display"**, do **not** export. Record the job with `file` = `none` and move on.
3. Otherwise click the **Export to Excel (.xlsx)** icon (cloud with up-arrow, top-right of the P&L card), wait 3, and take a screenshot to confirm the download started.
4. Add the manifest row straight away (see below), then go to the next job.

Export icon position shifts with the yellow **Customer notes** banner — read it from each screenshot:

| Page state | Export icon |
|---|---|
| No banner | (1360, **213**) |
| Yellow "Customer notes" banner present | (1360, **252**) |

## Step 3 — Quoted jobs (two files each, always in this order)

For each quoted job:

1. **P&L** — Batch A + Batch B as above. If the card shows "No data to display", record `pl` as `none`, skip the timesheet too, and move on. Otherwise click the export icon, wait 3, confirm, and record the `pl` row (leave `check` empty — a quoted export carries its own job number).
2. **Timesheets** — in the same job, click **Sales & Costs** in the in-page tab bar (Overview / Quotes / Site Visits / **Sales & Costs** / …), then **Timesheets**. Wait for the list to load and screenshot.
   - **Read the total hours** (the Total of the Quantity column, or add up the rows). This is the `check` value.
   - If there are **no timesheet entries**, do not export; record `ts` with `file` = `none`.
   - Otherwise click **Export**, wait 3, confirm the download started, and record the `ts` row.

On the first quoted job, take extra screenshots to find the Sales & Costs → Timesheets → Export positions, then reuse them (re-checking whenever the layout looks different).

## The manifest

Keep it as you go, one row per attempted file, numbered in the exact order you did them:

```
order,job,type,file,check
1,10016,chargeup,pl,172.78
2,10007,chargeup,pl,-45.10
3,9980,chargeup,none,
4,9987,quoted,pl,
5,9987,quoted,ts,12.50
6,9802,quoted,pl,
7,9802,quoted,ts,4.00
```

- `type` is `chargeup` or `quoted`; `file` is `pl`, `ts` or `none`.
- `check`: Charge Up P&L → total profit as a plain number (no `$` or commas; negative with `-`). Timesheets → total hours. Quoted P&L → empty.
- One `none` row per job where nothing was exported, so the order stays true.
- No commas inside values.
- **Every row needs its job number — charge-up rows too.** A charge-up P&L has no job number inside it, so the manifest is the only place it exists. A charge-up row with a blank `job` can't be loaded (the dashboard lists it as "needs a job number" instead of guessing).
- `file` is `pl`, `ts` or `none` — the word, not the file name. Keep the job as a plain number (`9814`, not `9814.0`), and only write timesheet rows for **quoted** jobs. A timesheet `check` of 0 is ignored, so don't write 0 when the hours couldn't be read — leave it empty.

When finished, **show the whole manifest in a code block** and ask the user to save it as `manifest.csv` in the same folder as the downloads (Notepad: File → Save As → *All files* → `manifest.csv`).

## Quirks that will bite

- **Search needs two clicks.** The header search icon only opens the panel; click the input separately before typing.
- **Do not use ctrl+a to clear the field.** It types a literal `a` into the input. `triple_click` the input, then type — that focuses and clears in one go.
- **Two "More" menus exist.** Ignore the left sidebar one. Use the in-page tab bar: Overview / Quotes / Site Visits / Sales & Costs / Correspondence / Files / **More** → Orders / **Reports** / Fixed Prices / Scheduling / History.
- Search result rows shift slightly on a fresh Dashboard vs a job page (y≈153 vs y≈148); read the row from the screenshot if a click misses.
- **Never export twice** for the same row. If unsure whether a click registered, look for the download in a screenshot before clicking again; if a duplicate did download, tell the user which job so they can delete the extra file.
- If Chrome asks where to save or to allow multiple downloads, stop and ask the user to accept — don't click through browser permission prompts yourself.

## What to report at the end

- Counts: Charge Up jobs exported, Quoted jobs exported (P&L + timesheet), and every `none` row with its reason ("No data to display", "no timesheet entries").
- Jobs whose P&L loaded but showed $0.00 profit or zero hours — thin, worth a look.
- The manifest (code block), plus the reminder to save it as `manifest.csv`.
- Then tell the user how to load it: open the dashboard (cd-dashboard.fkw24.workers.dev) → **Update data** → the **Completed jobs** section (not "Update job data" — that one is for in-progress jobs), click the file picker, select **all** the downloaded files (both Jobs lists, every ProfitAndLoss and Timesheets file) **and** `manifest.csv` together, and click **Upload completed jobs**. After about a minute it says how many jobs were loaded; if the files and manifest don't line up it loads nothing and says which job to fix.
- Do not claim to have checked the files on disk.
