# Building the dashboard in Tableau

The web dashboard stays the live view. Tableau is for the deeper cuts — the
questions worth sitting down with rather than glancing at.

## Getting the data

**Update data → Export for Tableau.** Five CSVs, generated in the browser from
what the dashboard has already parsed and saved to your machine. Re-export
whenever you want fresh figures; it takes a click and there is nothing to
schedule.

They are built from the app's own parser rather than a separate script that
re-reads the workbook, so they cannot disagree with what the site shows.

| File | Grain | Use it for |
|---|---|---|
| `cde-jobs.csv` | one row per job | Anything cross-sectional: margins, cost vs quote, GP $/hour |
| `cde-claims-by-month.csv` | job × month | Billing over time, concentration, profit by month |
| `cde-hours-by-month.csv` | job × month | Where hours actually went |
| `cde-capacity-by-month.csv` | month × measure | Servicing/residential/commercial split, capacity, balance |
| `cde-planned-hours.csv` | job × month | Forward workload |

Everything except `cde-jobs.csv` is **long**, not wide: one row per job per
month rather than a column per month. Tableau wants the date to be a field it
can drop on an axis, and twelve month columns force a pivot on every
connection.

`month` is written as a real date (`2026-08-01`), so Tableau types it as a
date and orders it properly. A `YYYY-MM` string sorts Apr, Aug, Dec.

## Relationships

Relate the month tables to `cde-jobs.csv` on **jobNumber** — a relationship,
not a join. A join fans out the per-job figures across every month row, so a
`SUM([totalActualCost])` silently triples once a job has three months of
claims. Relationships keep each table at its own grain and aggregate before
combining.

`jobNumber` is a string in every file. Keep it that way; it is the join key
everywhere in this system and it is stable across workbook uploads.

## Calculations worth having

```
// Above zero the month is short of people, below it there is room to sell.
Short or spare      IF [Balance hours] > 0 THEN "Short" ELSE "Spare" END

// The test the site's Needs review count uses.
Behind quote        [Margin to date] < [Quoted margin]

// The gap that matters: what was sold against what is being delivered.
Margin gap          [Margin to date] - [Quoted margin]

// Cost side only, with the gross profit taken back out.
Cost excl. GP       [Total cost] - [GP to add]
```

## The eight views on the site, as Tableau sheets

1. **Claimed against costs, by month** — `claims-by-month`. Month to Columns,
   Measure Values (claim, costs) to Rows, Measure Names to Colour. Side-by-side bars.
2. **Concentration** — `claims-by-month`. A table calc: rank jobs by claim
   within each month, then a running sum of claim as a percent of total.
   Rank on Columns, the running percent on Rows, Month to Colour.
3. **Planned against capacity** — `capacity-by-month`, filtered to *Total
   hours planned* and *Hours available*. Month to Columns, value to Rows,
   measure to Colour.
4. **Workload mix** — same file, filtered to the three component measures.
   Area mark, measure to Colour. They sum to Total hours planned, which is
   what makes the stack honest.
5. **Short or spare** — same file, filtered to *Balance hours*. Area mark with
   the `Short or spare` calc on Colour.
6. **Margin spread** — `jobs`. A bin on `marginToDate` (0.1 wide), count of
   jobs on Rows.
7. **Biggest jobs** — `jobs`. Job name to Rows sorted by `totalActualCost`,
   the two cost measures to Columns.
8. **Delivered against quoted margin** — `jobs`. `quotedMargin` to Columns,
   `marginToDate` to Rows, job to Detail, `Behind quote` to Colour. Add a
   reference line at y = x for the parity diagonal, and **fix both axes to the
   same range** — the diagonal means nothing if they differ.

## Two things to be careful of

**Don't average a percentage.** `marginToDate` and `quotedMargin` are already
ratios, so `AVG([Margin to date])` weights a $5k job the same as a $500k one —
one tiny job at -298% drags the headline down for no real reason. Compute it
as `SUM([profit]) / SUM([claim])`, or weight by cost, the way the site's
headline margin does.

**The current month is not a full month.** `claims-by-month` includes the
month in progress. On the 10th that is three jobs out of thirty, and any
month-on-month view will show a cliff that is just the calendar. Filter it out
or label it.

## Publishing

Tableau Desktop alone can't put a view on the website. Options:

- **Keep it local** — build in Desktop, share `.twbx` files. Nothing leaves
  your machine. This is the default and the safest.
- **Tableau Public** — free, and **completely public**: the workbook and its
  data are downloadable by anyone who finds it. This data is client sites,
  costs and margins. If you want a Tableau piece for your portfolio, build it
  from anonymised figures instead — renamed jobs, scaled numbers, same shapes.
- **Tableau Cloud / Server** — real data behind a login, but a separate paid
  product from Desktop, and the refresh story needs designing: the live edits
  (checklist ticks, planning figures) exist only in Cloudflare KV, so a
  published extract would lag the site unless something feeds it.
