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
- **Labour GP/hr** (`job.gpPerHour` on a quoted job = quoted labour cost − actual labour cost, ÷ actual hours) is **never displayed**. It only splits a job between its people: a person's part = that rate × their hours; a person's GP/hr = Σ parts ÷ Σ hours. **Quoted jobs only** — charge-up jobs aren't split per person.
- **Figures come from Katipolt's Profit & Loss Summary report** (`pl.*`, charge-up `profit`). Its labour pricing differs from the per-job P&L exports (e.g. job 10035, same 0.75 h: $29.25 cost in the Summary vs $46.49 in the export), and the owner confirmed the Summary matches Katipolt's screens. The per-job P&L/Timesheets files supply only: which job it is, who worked, for how many hours, and labour cost.
- **Hours:** quoted job actual = timesheet hours, quoted h = Budgeted "Quoted Quantity". Charge-up actual = **Sold** labour hours; quoted h = Sold + Unsold; "Diff h" = quoted − actual (so for charge-up it is the unsold hours).
- **Over quote (red, blinking, in the bell):** a *quoted* job whose actual hours, labour cost or total cost exceeds quoted.
- **No actual hours** (all unsold, or none booked): still loaded, `flags: ['no-sold-hours']`, GP/hr `null`, left out of every average. **No name in Katipolt:** named by its number, `flags: ['no-name']`.
- `contributors()` merges "… After Hours" / "… Overtime" lines into the person and nets negative (correction) lines; anyone left ≤ 0 is listed as an adjustment, not a contributor.
- By person: one GP/hr column per month + a Total; a person whose latest month is below the month before is flagged. `month` ("YYYY-MM") is picked on the upload form.

## Do not
- Change any calculation above, or display labour GP/hr, without asking.
- Put test data in `completed-jobs.json`, or change owner / type-of-work dropdowns, while testing: the local preview reads and writes the **real** KV and the real workers. (Local console shows CORS errors on `/whoami` — normal.)
- Push, deploy or run `wrangler deploy` without asking. Deploy the upload worker only as `cd upload-worker && npx wrangler deploy --config ./wrangler.toml` — a plain `wrangler deploy` once deployed the wrong worker. Secrets (`GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN` …) are set by the owner with `gh secret set` / `wrangler secret put`; never ask for them in chat. There is no Anthropic API key.
- Reorder/rename record fields or the `completedJobs.*` / `completed-jobs.*` localStorage keys casually — saved preferences depend on them.

## Katipolt quirks
- A charge-up P&L export contains **no job number**. Fix: include the Summary report in the upload; `matchFromSummary()` pairs each file to a job by total sell + total hours (passes: exact profit → jobs not yet loaded → jobs already loaded). A quoted P&L names its own job; a timesheet is matched to its quoted job by total hours. `manifest.csv` (`order,job,type,file,check`) still works and is now optional.
- Two jobs with identical figures (e.g. the −$77.47 pair) are paired arbitrarily; the numbers are identical either way.
- Exports download in **ascending** job order; Chrome's "(1)" numbering within one minute is not always the real order — the loader tries each order against the manifest's checks.

## UI conventions you'll hit
- `.table-scroll` (App.css) scrolls both ways, max 70vh, header row pinned; `.table-freeze` adds the two-row header and pinned Total row; `.sticky-col` freezes Job #/Job name. Print turns the scroll box off.
- Theme colours via CSS vars (`--viz-critical` red, `--viz-1`, `--brand-green`); keep both dark and light working.
- Table column groups can be hidden (Columns button); Worked by / Type of work / Owner / Date added start hidden on purpose.

## Open work — the UI audit (nothing below is done)
1. Collapse the long explainer paragraph on Completed jobs (first screen has no table). 2. One-line "5 jobs over quote ▸" instead of the long red banner. 3. "Simple" column preset — quoted profit/margin/labour-quoted are blank for ~78% of rows (charge-up). 4. Replace the two chip rows with dropdowns; surface "24 jobs need a type of work". 5. Make GP/hr visually dominant (scale/bar). 6. One summary strip with month picker + flagged count instead of two cards. 7. Job names are truncated; header text small/low contrast. 8. "Diff h" is confusing for charge-up — rename/tooltip. 9. Selection bar with Compare near the table, not below it. 10. Phone: 64 cards ≈ 31,000 px tall — compact cards, search, pinned filters; top nav strip hides "Completed jobs".

Commit messages end with the attribution line the session gives. Ask before pushing.
