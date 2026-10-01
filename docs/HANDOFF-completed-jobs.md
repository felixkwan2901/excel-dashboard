# Handoff — Completed jobs (read this before touching it)

Written 1 Oct 2026 for whoever picks this up next (a new chat, another model). Short version: **the numbers are settled and were argued over line by line with the owner — change how it looks, not what it calculates.**

## Where things live
| What | Where |
|---|---|
| Data (64 jobs, all September 2026) | `public/completed-jobs.json` — **never hand-edit**; it's written by the upload pipeline |
| Completed jobs page | `src/components/CompletedJobsTab.jsx` (table, filters, totals row, tick-to-compare) |
| Completed insights page | `src/components/CompletedInsightsTab.jsx` (by type of work, by person × month) |
| Compare panel + AI summary | `src/components/CompletedCompare.jsx` → worker route `/job-summary` (Gemini) |
| Per-person maths, project GP/hr | `src/lib/completedJobPeople.js` |
| Over-quote flag rule | `src/lib/completedJobReview.js` (also feeds the bell in `NotificationsBell.jsx`) |
| Dashboard "GP per hour by person" chart | `src/components/ChartsTab.jsx` |
| Reading Katipolt exports | `scripts/lib/completed-job.mjs` |
| Upload page | `src/components/CompletedJobsUpload.jsx` (Update data → Completed jobs) |

Upload path: page → `POST /completed-jobs` (upload worker, proxied by the site worker) → staged in GitHub under `pending-updates/completed-jobs/` → `process-pending-updates.yml` runs `scripts/apply-completed-jobs-uploads.mjs` → commits `completed-jobs.json` + `sync-meta.json` (`completedJobsUpdatedAt`) → copies to both sites. A refused upload lands in `pending-updates/failed/` with a `.error.json` saying why.

## The numbers — the owner's rules
- **Project GP/hr** (what the pages show): a job's **profit to date** ÷ **actual hours**. Quoted: `pl.profitToDate ÷ hours`. Charge-up: `profit ÷ Sold hours`. `projectGpPerHour()` is the single definition.
- **People:** a person's GP on a job ("Their GP") = the job's **labour GP/hr × their hours** (hidden rate; the parts add back to the job's labour profit). A person's **number** (By person, the Dashboard chart, Compare) is **time-weighted**: for each job, `(their hours on it ÷ their hours on all their jobs) × their GP on that job`, added up (`timeWeighted()` in `completedJobPeople.js`). Kyle: 10 h of 20.25 = 49.4% × $12.61 + 22.2% × −$26.14 + 16% × $56.55 + 12.3% × $369.66 = $55.13; a one-job person is 100% of it (Hayden $27.41). **Quoted jobs only.** **No per-hour rate and no dollar total are shown for people anywhere** — the owner rejected both the project-based rate ("everyone on 9635 identical") and the summed dollars.
- **Figures come from Katipolt's Profit & Loss Summary report** (`pl.*`, charge-up `profit`). Its labour pricing differs from the per-job P&L exports (e.g. job 10035, same 0.75 h: $29.25 cost in the Summary vs $46.49 in the export), and the owner confirmed the Summary matches Katipolt's screens. The per-job P&L/Timesheets files supply only: which job it is, who worked, for how many hours, and labour cost.
- **Hours:** quoted job actual = timesheet hours, quoted h = Budgeted "Quoted Quantity". Charge-up actual = **Sold** labour hours; quoted h = Sold + Unsold; "Diff h" = quoted − actual (so for charge-up it is the unsold hours).
- **Over quote (red, blinking, in the bell):** a *quoted* job whose actual hours, labour cost or total cost exceeds quoted.
- **No actual hours** (all unsold, or none booked): still loaded, `flags: ['no-sold-hours']`, GP/hr `null`, left out of every average. **No name in Katipolt:** named by its number, `flags: ['no-name']`.
- `contributors()` merges "… After Hours" / "… Overtime" lines into the person and nets negative (correction) lines; anyone left ≤ 0 is listed as an adjustment, not a contributor.
- By person: one GP/hr column per month + a Total; a person whose latest month is below the month before is flagged. `month` ("YYYY-MM") is picked on the upload form.

## Do not
- Change any calculation above, or display the labour GP/hr anywhere, without asking.
- Put test data in `completed-jobs.json`, or change owner / type-of-work dropdowns, while testing: the local preview reads and writes the **real** KV and the real workers. (Local console shows CORS errors on `/whoami` — normal.)
- Push, deploy or run `wrangler deploy` without asking. Deploy the upload worker only as `cd upload-worker && npx wrangler deploy --config ./wrangler.toml` — a plain `wrangler deploy` once deployed the wrong worker. Secrets (`GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN` …) are set by the owner with `gh secret set` / `wrangler secret put`; never ask for them in chat. There is no Anthropic API key.
- Reorder/rename record fields or the `completedJobs.*` / `completed-jobs.*` localStorage keys casually — saved preferences depend on them.

## Katipolt quirks
- A charge-up P&L export contains **no job number**. Fix: include the Summary report in the upload; `matchFromSummary()` pairs each file to a job by total sell + total hours (passes: exact profit → jobs not yet loaded → jobs already loaded). A quoted P&L names its own job; a timesheet is matched to its quoted job by total hours. `manifest.csv` (`order,job,type,file,check`) still works and is now optional.
- Two jobs with identical figures (e.g. the −$77.47 pair) are paired arbitrarily; the numbers are identical either way.
- Exports download in **ascending** job order; Chrome's "(1)" numbering within one minute is not always the real order — the loader tries each order against the manifest's checks.

## The shared table (1 Oct 2026)
Every job table — Projects (`JobTable.jsx`), Monthly claims, Upcoming work's planned hours, Completed jobs — is now `src/components/table/DataTable.jsx` driven by `useDataTable.js`. One place for frozen columns, two-row group headers, Simple/Full presets, the grouped column picker, sorting (blanks last), ticked rows + pinned totals, expandable rows, and "Export CSV" of the rows and columns shown (via `downloadCsv`). Column shape and props are documented at the top of each file. Pages keep their own data, filters, editing and phone cards; `useDataTable` returns `rows` (sorted) and `sort` for those. Storage is per table id: `<id>.hiddenColumns`, `<id>.columnPreset`, and `<id>.sort` only when `persistSort` is on. The old keys (`completedJobs.hiddenGroups.v2`, `jobTable.visibleColumns`, `jobTable.showTrend`, `monthlyClaims.showWorkings`) are read once to seed the new ones — don't delete that migration for a while. Upcoming work's capacity grid (7 fixed rows × 12 months) is not a data list and stays hand-written.

## Still to do (owner's list, 1 Oct 2026)
- ~~Completed insights by-type table~~ done 1 Oct: now `DataTable` with grouped Charge-up / Quoted / All headers, plain counts, `GpCell` bars, a pinned totals row, and rows that expand to their jobs. `GpCell` lives in `src/components/table/`.
- ~~Friendlier upload~~ done 1 Oct: the loader's core is `scripts/lib/completed-job-core.mjs` (no Node imports; `completed-job.mjs` wraps it for scripts), and the Update data page runs that same core in the browser (`src/lib/completedJobsPreview.js`) to show a checklist of expected files, "N jobs matched · N need a look · N have no hours", the jobs, and problems in plain words (`src/lib/uploadWords.js`, tested) before anything uploads. The load button is off until the check passes. Note: all 14 failed uploads to date were sent without the Profit & Loss Summary report, so the preview's first job is to say so.
- ~~Needs-attention home screen~~ done 1 Oct: `src/components/NeedsAttention.jsx` at the top of the Overview — active jobs flagged, completed jobs over quote, jobs missing this week's update, completed jobs with no type of work (latest month), nothing claimed / costs-but-no-claim this month, people below last month. Each line opens the fixing view; `CompletedJobsTab` takes a `preset` ({ review: true } or { work: 'Not set' }) for that. The bell is unchanged.
- Then, in the owner's order: screenshot tests (dark/light × laptop/phone), plain words + tooltips everywhere, PDF/Excel month report, month-end review flow, charts pass, accessibility (skeletons, saved-with-undo, empty states, icon beside red, calmer blink, keyboard), field app for outdoors.

## UI conventions you'll hit
- `.table-scroll` (App.css) scrolls both ways, max 70vh, header row pinned; `.table-freeze` adds the two-row header and pinned Total row; `.sticky-col` freezes Job #/Job name. Print turns the scroll box off.
- Theme colours via CSS vars (`--viz-critical` red, `--viz-1`, `--brand-green`); keep both dark and light working.
- Table column groups can be hidden (Columns button); Worked by / Type of work / Owner / Date added start hidden on purpose.

## UI audit — all 10 items done 1 Oct 2026
Done, all in `CompletedJobsTab.jsx` (+ a few header rules in App.css under `.table-freeze thead th`): 1. explainer folded behind a "How this works ▸" link next to the H1. 2. over-quote list is a one-line bar ("N quoted jobs over quote — review ▸") that expands; the Over quote stat in the strip opens it too. 3. column presets — **Simple** (default; `completedJobs.columnPreset`) shows Job #/name/type, GP/hr, Quoted h, Actual h, Diff h, Profit to date, Margin to date; **Full** uses the old group picker (`hiddenGroups.v2`); ticking a group in "Choose" switches to Full. 4. Job type / Type of work are `<select>`s with counts; an amber "N jobs need a type of work — show them" pill filters to Not set. 5. `GpCell`: 15px bold figure + a bar against the best GP/hr shown; green when ≥ the overall rate of the jobs shown, red when negative. 6. `SummaryStrip`: month picker (latest month by default, "All months" only when >1 month), project GP/hr of the jobs shown, jobs (+ per-type rates), over-quote count, and a "vs previous month" delta when a previous month exists. The month filters everything on the page (table, review bar, counts); opening a job from the bell switches to that job's month. 7. frozen name column 260 px; header text 12 px, sub-row sentence case. 8. Diff h header reads "Under quote h" (quoted filter) / "Unsold h" (charge-up) / "Diff h" (all), with a tooltip on the header and on every cell.

9. Ticking a job shows a pinned selection bar at the top of the table section (N selected · Compare & AI summary ▸ · Show selected only · Clear); `CompletedCompare` renders under that bar, not below the table. 10. Phone: compact cards (~108 px; number · type, name, GP/hr with bar, one hours/profit line; tap for type of work, owner, the other figures and who worked), a search box (job # or name, desktop too), and the filter bar (search, type, work, sort, the amber pill) is `sticky` on phones. `Sidebar` scrolls the active link into view on the ≤860 px strip. Page height went from ~31,000 px to ~8,700 px.

Commit messages end with the attribution line the session gives. Ask before pushing.
