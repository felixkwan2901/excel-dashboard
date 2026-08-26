import * as XLSX from 'xlsx'
import { fetchOverrides } from './overrides'

// Lives in public/ as a stable, unhashed path (not a Vite `?url` import) so
// a data-only change (ticking a checklist box, editing a claim figure) can
// be synced straight into the deployed site without a full rebuild — see
// process-pending-updates.yml's "sync data files" step. Content-hash
// cache-busting doesn't apply to a stable path, so the fetch below uses
// `cache: 'no-store'` instead to guarantee this is never served stale.
const workbookUrl = `${import.meta.env.BASE_URL}Cassidy_Davies_Electrical_BPMN_Data.xlsx`

const monthlyHoursLogUrl = `${import.meta.env.BASE_URL}monthly-hours-log.json`
const monthlyClaimsLogUrl = `${import.meta.env.BASE_URL}monthly-claims-log.json`
const archivedJobsUrl = `${import.meta.env.BASE_URL}archived-jobs.json`

// Columns are located by header text, not position — the real sheet's
// headers have embedded newlines ("Job\nNumber") and have already drifted
// once before, so matching by (whitespace-normalized) text is far more
// resilient than trusting column order.
const FIELD_HEADER_ALIASES = {
  jobNumber: ['Job Number'],
  jobName: ['Job Name'],
  quotedPrice: ['Quoted Price'],
  claimToDate: ['Claim to date'],
  remainingToClaim: ['Remaining to claim'],
  pctClaimRemaining: ['% Claim remaining'],
  totalQuotedCost: ['Total quoted cost'],
  totalActualCost: ['Total actual cost'],
  quotedMaterialCost: ['Quoted material cost'],
  actualMaterialCost: ['Actual material cost'],
  materialCostRemaining: ['Material cost remaining'],
  materialPctRemaining: ['Material % remaining'],
  estimatedPctMaterialsReceived: ['Estimated % of materials recieved', 'Estimated % of materials received'],
  quotedLabourCost: ['Quoted labour cost'],
  actualLabourCost: ['Actual labour cost'],
  labourCostRemaining: ['Labour cost remaining'],
  labourCostPctRemaining: ['Labour cost % remaining'],
  quotedLabourHours: ['Quoted labour hours'],
  actualLabourHours: ['Actual labour hours'],
  labourHoursRemaining: ['Labour hours remaining'],
  labourHourPctRemaining: ['Labour hour % remaining'],
  estimatedPctJobComplete: ['Estimated % of job complete'],
  gpPerHour: ['GP $ Per Hour'],
  quotedGpPerHour: ['Quoted GP $ Per Hour'],
  marginToDate: ['Margin to date'],
  quotedMargin: ['Quoted margin'],
}

function normalizeHeader(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
}

function buildColumnMap(headerRow) {
  const normalized = headerRow.map(normalizeHeader)
  const columnMap = {}
  for (const [field, aliases] of Object.entries(FIELD_HEADER_ALIASES)) {
    const col = aliases.map((alias) => normalized.indexOf(normalizeHeader(alias))).find((idx) => idx !== -1)
    if (col !== undefined && col !== -1) columnMap[field] = col
  }
  return columnMap
}

// A number, or null if the cell is blank or a formula-error string like
// "#DIV/0!" (which shows up on marginToDate for jobs with no quoted price
// yet) — never NaN, so callers can do straightforward `!== null` checks.
function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// A row is a real job's summary row only if it has a positive job number
// and a real name — this is what distinguishes a genuine "Start of month"
// row from the handful of junk blocks in the sheet (job number 0, or a
// placeholder name like "Contracting").
function isValidJobRow(row) {
  const num = row[0]
  const name = row[1]
  return typeof num === 'number' && num > 0 && typeof name === 'string' && name.trim() !== '' && name.trim() !== '0'
}

// A week row counts as having real data if it has a positive quoted
// price — that field is carried forward unchanged from the previous week
// whenever nothing was revised, so it only reads as 0/blank on a week
// that genuinely hasn't been filled in yet (e.g. St Barnabas Church's
// Week 5 is entirely blank/zero while Weeks 1-4 have real figures).
function weekRowHasData(row, columnMap) {
  const col = columnMap.quotedPrice
  if (col === undefined) return true
  const n = Number(row[col])
  return Number.isFinite(n) && n > 0
}

// The job-costing data has moved to a different tab before (Sheet1 →
// "Deliverables Sheet" once already), and the workbook also carries a
// near-duplicate "…Test Sheet" tab with the same columns — so rather than
// hardcode a tab name, find whichever sheet actually has the job-costing
// header row (Job Number + Quoted Price + Total actual cost all present).
// Test-named tabs are only used as a last resort, in case the real sheet
// ever gets renamed to include "test" itself.
function findJobsSheet(workbook) {
  const candidates = []
  for (const name of workbook.SheetNames) {
    const rows = sheetRows(workbook.Sheets[name])
    const headerIdx = rows.findIndex((row) => normalizeHeader(row[0]) === 'job number')
    if (headerIdx === -1) continue
    const columnMap = buildColumnMap(rows[headerIdx])
    if (columnMap.jobNumber === undefined || columnMap.quotedPrice === undefined) continue
    if (columnMap.totalActualCost === undefined) continue
    candidates.push({ name, rows })
  }
  const preferred = candidates.find((c) => !normalizeHeader(c.name).includes('test'))
  return (preferred ?? candidates[0])?.rows ?? []
}

// Every job is a block of rows: one "Start of month" row (has Job Number/
// Job Name) followed by "Week 1".."Week 5" rows (blank Job Number/Name,
// updated figures) — quoted price, actual cost, claim-to-date, and margin
// all keep changing week to week as the job progresses and gets revised.
// "Start of month" is just the baseline snapshot, not the current one, so
// each job's numbers are taken from the most recent week that actually has
// data, walking backwards past any trailing blank/not-yet-updated weeks —
// only jobNumber/jobName come from the block's first row, since later rows
// leave those blank.
//
// Blocks are delimited by the literal "Week" column text ("Start of
// month" starts a new block, "Week N" continues the current one) rather
// than by blank-row detection — the junk blocks below job 9508 have their
// own "Start of month"/"Week N" rows too despite an invalid job number, so
// checking for blank cells alone would merge them into the prior real job.
function rowsAfterHeader(rows) {
  const headerIdx = rows.findIndex((row) => normalizeHeader(row[0]) === 'job number')
  if (headerIdx === -1) return []
  const columnMap = buildColumnMap(rows[headerIdx])

  const blocks = []
  let current = null
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const weekLabel = row[2]
    if (weekLabel === 'Start of month') {
      if (current) blocks.push(current)
      current = { startRow: row, weekRows: [row] }
    } else if (current && typeof weekLabel === 'string' && weekLabel.startsWith('Week')) {
      current.weekRows.push(row)
    }
  }
  if (current) blocks.push(current)

  return blocks
    .filter((block) => isValidJobRow(block.startRow))
    .map((block) => {
      // dataRowIdx defaults to the LAST week row when nothing has data at
      // all — reasonable for the figures below (every row is blank anyway,
      // so it doesn't matter which blank row gets shown). lastFilledWeekIdx
      // tracks the real answer separately: it only advances when a row
      // actually has data, so a job with nothing filled in since "Start of
      // month" (not even that baseline) reads as week 0 — behind, not
      // "caught up to Week 5" — for staleness purposes below.
      let dataRowIdx = block.weekRows.length - 1
      let lastFilledWeekIdx = 0
      for (let i = block.weekRows.length - 1; i >= 0; i--) {
        if (weekRowHasData(block.weekRows[i], columnMap)) {
          dataRowIdx = i
          lastFilledWeekIdx = i
          break
        }
      }
      const dataRow = block.weekRows[dataRowIdx]

      // The previously-filled WEEK before the current one, if any — used to
      // show a trend (margin improving/worsening) rather than just a
      // single point-in-time snapshot. Deliberately excludes index 0
      // ("Start of month", the baseline quote figures) as a comparison
      // point: that's not "last week", it's the whole job's starting
      // position, and diffing against it produced wild, meaningless swings
      // (effectively "change since the quote was made" rather than "change
      // since last week"). A job on its first ever week (or one that just
      // rolled into a new month, with only one week logged since) has
      // nothing genuinely comparable yet.
      let previousRow = null
      for (let i = dataRowIdx - 1; i >= 1; i--) {
        if (weekRowHasData(block.weekRows[i], columnMap)) {
          previousRow = block.weekRows[i]
          break
        }
      }

      const record = {}
      for (const field of Object.keys(FIELD_HEADER_ALIASES)) {
        const col = columnMap[field]
        if (col === undefined) {
          record[field] = ''
          continue
        }
        // jobNumber/jobName only ever appear on the block's first row.
        record[field] = field === 'jobNumber' || field === 'jobName' ? block.startRow[col] : dataRow[col]
      }
      const marginCol = columnMap.marginToDate
      // undefined, not '' — toNumber() treats '' as 0 (Number('') === 0) but
      // undefined as null (Number(undefined) is NaN), and "no previous week"
      // has to come out as null here, not a false previous margin of 0%.
      record.previousMarginToDate = previousRow && marginCol !== undefined ? previousRow[marginCol] : undefined
      // dataRowIdx is 0 for "Start of month" (nothing uploaded yet this
      // month) or 1-5 for "Week N" — kept as a plain number here so
      // withDerivedFields can compare it against today's real calendar
      // week without re-parsing the label string.
      record.lastUpdatedWeekIndex = lastFilledWeekIdx
      record.lastUpdatedLabel = block.weekRows[lastFilledWeekIdx][2] || 'Start of month'
      return record
    })
}

// Same rule scripts/update-jobs.mjs uses server-side to decide which week
// slot a fresh export lands in — mirrored here so the dashboard can tell
// whether a job's last update has actually caught up to the real current
// week, not just whether it has *any* data.
function calendarWeekOfMonth(date) {
  return Math.min(5, Math.ceil(date.getDate() / 7))
}

function withDerivedFields(job) {
  const jobNumber = String(job.jobNumber)
  const jobName = String(job.jobName)
  const quotedPrice = toNumber(job.quotedPrice)
  const claimToDate = toNumber(job.claimToDate)
  const remainingToClaim = toNumber(job.remainingToClaim)
  const pctClaimRemaining = toNumber(job.pctClaimRemaining)
  const totalQuotedCost = toNumber(job.totalQuotedCost)
  const totalActualCost = toNumber(job.totalActualCost)
  const quotedMaterialCost = toNumber(job.quotedMaterialCost)
  const actualMaterialCost = toNumber(job.actualMaterialCost)
  const materialCostRemaining = toNumber(job.materialCostRemaining)
  const materialPctRemaining = toNumber(job.materialPctRemaining)
  const estimatedPctMaterialsReceived = toNumber(job.estimatedPctMaterialsReceived)
  const quotedLabourCost = toNumber(job.quotedLabourCost)
  const actualLabourCost = toNumber(job.actualLabourCost)
  const labourCostRemaining = toNumber(job.labourCostRemaining)
  const labourCostPctRemaining = toNumber(job.labourCostPctRemaining)
  const quotedLabourHours = toNumber(job.quotedLabourHours)
  const actualLabourHours = toNumber(job.actualLabourHours)
  const labourHoursRemaining = toNumber(job.labourHoursRemaining)
  const labourHourPctRemaining = toNumber(job.labourHourPctRemaining)
  const estimatedPctJobComplete = toNumber(job.estimatedPctJobComplete)
  const gpPerHour = toNumber(job.gpPerHour)
  const quotedGpPerHour = toNumber(job.quotedGpPerHour)
  const marginToDate = toNumber(job.marginToDate)
  const quotedMargin = toNumber(job.quotedMargin)
  const previousMarginToDate = toNumber(job.previousMarginToDate)

  // How the job's margin moved between its last two logged weeks — a
  // direction, not just a point-in-time snapshot. Null when there's no
  // prior week to compare against yet (a job on its very first week, or
  // one that just rolled into a new month and only has one week logged
  // since).
  const marginTrend =
    marginToDate !== null && previousMarginToDate !== null ? marginToDate - previousMarginToDate : null

  // Comparing actual-cost-to-date against the full quote flags almost every
  // ongoing job as "over budget" purely because it's mid-way through
  // spending its budget, not because it's actually trending over. Once
  // there's enough progress to divide by safely, project the final cost at
  // the current burn rate (actual cost / % complete) and compare THAT to
  // the quote instead — a job at 20% complete having spent 25% of its
  // budget is projected to finish under quote and shouldn't be flagged;
  // one at 90% complete on pace to land 20% over should be. Below 5%
  // complete the projection divides by a near-zero denominator and swings
  // wildly, so fall back to the old flat comparison until there's enough
  // progress to make pace meaningful.
  const MIN_PCT_COMPLETE_FOR_PACE = 0.05
  const hasReliablePace = estimatedPctJobComplete !== null && estimatedPctJobComplete >= MIN_PCT_COMPLETE_FOR_PACE
  const projectedTotalCost =
    hasReliablePace && totalActualCost !== null ? totalActualCost / estimatedPctJobComplete : null
  const projectedOverrun =
    projectedTotalCost !== null && totalQuotedCost !== null ? projectedTotalCost - totalQuotedCost : null
  const overBudget = hasReliablePace
    ? projectedOverrun !== null && projectedOverrun > 0
    : totalActualCost !== null && totalQuotedCost !== null && totalActualCost > totalQuotedCost
  const losingMargin = marginToDate !== null && marginToDate < 0

  // Whether this job's last recorded week has actually caught up to
  // today's real calendar week — a job sitting on Week 1 while the month
  // is already in Week 3 means no export has been uploaded for it in two
  // weeks, not that it has no data at all. weeksBehind stays 0 once a job
  // is current (never negative — there's no such thing as "ahead").
  const currentCalendarWeek = calendarWeekOfMonth(new Date())
  const lastUpdatedWeekIndex = job.lastUpdatedWeekIndex ?? 0
  const weeksBehind = Math.max(0, currentCalendarWeek - lastUpdatedWeekIndex)
  const isStale = weeksBehind > 0

  return {
    jobNumber,
    jobName,
    quotedPrice,
    claimToDate,
    remainingToClaim,
    pctClaimRemaining,
    totalQuotedCost,
    totalActualCost,
    quotedMaterialCost,
    actualMaterialCost,
    materialCostRemaining,
    materialPctRemaining,
    estimatedPctMaterialsReceived,
    quotedLabourCost,
    actualLabourCost,
    labourCostRemaining,
    labourCostPctRemaining,
    quotedLabourHours,
    actualLabourHours,
    labourHoursRemaining,
    labourHourPctRemaining,
    estimatedPctJobComplete,
    gpPerHour,
    quotedGpPerHour,
    marginToDate,
    quotedMargin,
    previousMarginToDate,
    marginTrend,
    projectedTotalCost,
    projectedOverrun,
    overBudget,
    losingMargin,
    flagged: overBudget || losingMargin,
    lastUpdatedLabel: job.lastUpdatedLabel ?? 'Start of month',
    weeksBehind,
    isStale,
  }
}

// "Claim Calculator By Month" is a single current-month snapshot (not an
// actual month-by-month history — there's no month column, just one row
// per job) of this month's claim/costs/profit plus a projection to end of
// month, closed out with two "Totals" rows splitting the whole book into
// Commercial vs Residential. Read independently of the Deliverables Sheet
// parsing above since it's a different shape (one row per job, no
// Start-of-month/Week blocks).
function parseMonthlyClaims(workbook) {
  const sheet = workbook.Sheets['Claim Calculator By Month']
  if (!sheet) return { jobs: [], totals: [] }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  const jobs = []
  const totals = []

  for (const row of rows) {
    // One combined total across every job now (used to be a separate
    // Commercial/Residential split, but that was just two hardcoded row
    // ranges from however the sheet was originally laid out — any job
    // added later fell outside both and was silently never counted; see
    // scripts/update-jobs.mjs). The old second totals row still exists in
    // the sheet but has its "GP%" marker cleared, so only this one match.
    if (row[5] === 'GP%') {
      totals.push({
        category: String(row[1] ?? '').trim(),
        claim: toNumber(row[2]),
        costs: toNumber(row[3]),
        profit: toNumber(row[4]),
        gpPct: toNumber(row[6]),
        eomGpPct: toNumber(row[8]),
      })
      continue
    }

    if (typeof row[0] !== 'number' || row[0] <= 0) continue
    const jobName = String(row[1] ?? '').trim()
    if (!jobName || jobName === '0') continue

    jobs.push({
      jobNumber: String(row[0]),
      jobName,
      claim: toNumber(row[2]),
      costs: toNumber(row[3]),
      profit: toNumber(row[4]),
      // Retention (col F) doubles as the totals-row detector above — for a
      // real job row it's also a genuine, manually-entered figure.
      retention: toNumber(row[5]),
      margin: toNumber(row[6]),
      quotedMargin: toNumber(row[7]),
      hoursToCompleteBeforeEom: toNumber(row[8]),
      costsToComeBeforeEom: toNumber(row[9]),
      totalCostToComeBeforeEom: toNumber(row[10]),
      estimatedMarginEom: toNumber(row[11]),
      gpEndOfMonth: toNumber(row[12]),
      hoursThisMonth: toNumber(row[13]),
      gpPerHourThisMonth: toNumber(row[14]),
      // Free-text note (col Q) — plain manual entry, no formula.
      notes: String(row[16] ?? '').trim(),
    })
  }

  return { jobs, totals }
}

// Jan-Dec hours-allocation columns (F-Q) on "Upcoming Work Calculator".
const UPCOMING_WORK_MONTH_COLUMNS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const UPCOMING_WORK_MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// "Upcoming Work Calculator" — one row per job. Job number/name and
// Quoted/Used/Remaining hours (cols C/D/E) are formulas (identity pulls
// from Main Sheet; hours are a LOOKUP into that job's own Deliverables
// Sheet week range) — read here as plain derived values, same as every
// other formula-backed field elsewhere in this file. The Jan-Dec columns
// and the notes column (S) are the sheet's only manual entry.
function parseUpcomingWork(workbook) {
  const sheet = workbook.Sheets['Upcoming Work Calculator']
  if (!sheet) return { jobs: [] }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  const jobs = []

  for (const row of rows) {
    if (typeof row[0] !== 'number' || row[0] <= 0) continue
    const jobName = String(row[1] ?? '').trim()
    if (!jobName || jobName === '0') continue

    const months = {}
    UPCOMING_WORK_MONTH_COLUMNS.forEach((col, i) => {
      months[UPCOMING_WORK_MONTH_LABELS[i]] = toNumber(row[col])
    })

    jobs.push({
      jobNumber: String(row[0]),
      jobName,
      quotedHours: toNumber(row[2]),
      usedHours: toNumber(row[3]),
      remainingHours: toNumber(row[4]),
      months,
      notes: String(row[18] ?? '').trim(),
    })
  }

  return { jobs }
}

// "Main Sheet" is the project-handover checklist — one row per job (each
// followed by a blank separator row, same pattern as the other sheets),
// columns 3-22 each a Yes/No/N/A milestone ("Contract Signed & Returned",
// "Warranty Signed & Returned", ...). Two header rows are combined per
// column since some columns only carry a sub-label in the second row
// (e.g. "Long Lead Time Materials Ordered" / "Ordered"). Values aren't
// perfectly consistent in the source data (mixed "Yes"/"yes" casing, and
// at least one cell holding a raw date instead of Yes/No) — read as plain
// trimmed text rather than trying to coerce it, and let the editing UI
// normalize it going forward.
function parseMainSheet(workbook) {
  const sheet = workbook.Sheets['Main Sheet']
  if (!sheet) return { jobs: [], columns: [] }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  const h1 = rows[1] ?? []
  const h2 = rows[2] ?? []
  const columns = []
  for (let c = 3; c <= 22; c++) {
    const label = [h1[c], h2[c]]
      .map((s) => String(s ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' — ')
    if (!label) continue
    columns.push({ key: `col${c}`, col: c, label })
  }

  const jobs = []
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r]
    if (typeof row[0] !== 'number' || row[0] <= 0) continue
    const jobName = String(row[1] ?? '').trim()
    if (!jobName || jobName === '0') continue

    const checklist = {}
    for (const column of columns) checklist[column.key] = String(row[column.col] ?? '').trim()

    jobs.push({
      jobNumber: String(row[0]),
      jobName,
      jobOwner: String(row[2] ?? '').trim(),
      checklist,
    })
  }

  return { jobs, columns }
}

// The log only ever records each job's CUMULATIVE hours-to-date as of the
// last snapshot taken in a given month (see scripts/log-monthly-hours.mjs
// for why — the workbook itself has no month-by-month history to read).
// Hours actually worked in a month is the difference between that month's
// cumulative figure and the previous month's for the same job. A job's
// first appearance in the log has no prior figure to diff against, so it's
// left out of that month's total rather than counted as a false spike of
// "all hours ever logged, attributed to one month".
function parseMonthlyHoursLog(log) {
  const months = Object.keys(log).sort()
  const jobNumbers = new Set()
  for (const month of months) for (const jobNumber of Object.keys(log[month])) jobNumbers.add(jobNumber)

  const jobs = [...jobNumbers].map((jobNumber) => {
    let jobName = ''
    let previousCumulative = null
    const hoursByMonth = {}
    for (const month of months) {
      const entry = log[month][jobNumber]
      if (!entry) continue
      jobName = entry.jobName
      if (previousCumulative !== null) {
        hoursByMonth[month] = Math.max(0, entry.cumulativeHours - previousCumulative)
      }
      previousCumulative = entry.cumulativeHours
    }
    return { jobNumber, jobName, hoursByMonth }
  })

  const totalsByMonth = months.map((month) => ({
    month,
    totalHours: jobs.reduce((sum, j) => sum + (j.hoursByMonth[month] ?? 0), 0),
  }))

  return { months: months.slice(1), totalsByMonth: totalsByMonth.slice(1), jobs }
}

// Unlike the hours log above, Claim/Costs/Profit are already THIS MONTH's
// figures at the point scripts/update-jobs.mjs logs them (not a running
// cumulative total) — so every logged month is directly usable with no
// diffing and no "first month is only a baseline" exclusion.
function parseMonthlyClaimsLog(log) {
  const months = Object.keys(log).sort()
  const jobNumbers = new Set()
  for (const month of months) for (const jobNumber of Object.keys(log[month])) jobNumbers.add(jobNumber)

  const jobs = [...jobNumbers].map((jobNumber) => {
    let jobName = ''
    const claimByMonth = {}
    const costsByMonth = {}
    const profitByMonth = {}
    for (const month of months) {
      const entry = log[month][jobNumber]
      if (!entry) continue
      jobName = entry.jobName
      claimByMonth[month] = entry.claim
      costsByMonth[month] = entry.costs
      profitByMonth[month] = entry.profit
    }
    return { jobNumber, jobName, claimByMonth, costsByMonth, profitByMonth }
  })

  const totalsByMonth = months.map((month) => ({
    month,
    totalClaim: jobs.reduce((sum, j) => sum + (j.claimByMonth[month] ?? 0), 0),
    totalCosts: jobs.reduce((sum, j) => sum + (j.costsByMonth[month] ?? 0), 0),
    totalProfit: jobs.reduce((sum, j) => sum + (j.profitByMonth[month] ?? 0), 0),
  }))

  return { months, totalsByMonth, jobs }
}

// Overlays saveEdit()'s instant-write KV blobs (src/lib/overrides.js) on
// top of what the Excel workbook itself currently says, so an edit shows
// up everywhere within about a second instead of waiting on the real
// merge+redeploy (~1-2 minutes). Each function maps a saved "col" back to
// the field name the parsed job object actually uses.

function applyMainSheetOverrides(mainSheet, overrides) {
  for (const job of mainSheet.jobs) {
    const jobOverrides = overrides[job.jobNumber]
    if (!jobOverrides) continue
    for (const [col, entry] of Object.entries(jobOverrides)) {
      job.checklist[`col${col}`] = entry.value
    }
  }
}

// col -> [field name, isNumeric] on the Claim Calculator By Month sheet —
// matches MonthlyClaims.jsx's EDITABLE_FIELDS and MainSheetTab's item-4
// retention side-save (col 5).
const CLAIM_CALC_OVERRIDE_FIELDS = {
  5: ['retention', true],
  8: ['hoursToCompleteBeforeEom', true],
  9: ['costsToComeBeforeEom', true],
  16: ['notes', false],
}

function applyClaimCalcOverrides(monthlyClaims, overrides) {
  for (const job of monthlyClaims.jobs) {
    const jobOverrides = overrides[job.jobNumber]
    if (!jobOverrides) continue
    for (const [col, entry] of Object.entries(jobOverrides)) {
      const field = CLAIM_CALC_OVERRIDE_FIELDS[col]
      if (!field) continue
      const [key, numeric] = field
      job[key] = numeric ? Number(entry.value) || 0 : entry.value
    }
  }
}

// col -> month key on the Upcoming Work Calculator sheet — matches
// UpcomingWorkTab.jsx's MONTH_FIELDS/NOTES_COL.
const UPCOMING_WORK_OVERRIDE_MONTHS = {
  5: 'Jan', 6: 'Feb', 7: 'Mar', 8: 'Apr', 9: 'May', 10: 'Jun',
  11: 'Jul', 12: 'Aug', 13: 'Sep', 14: 'Oct', 15: 'Nov', 16: 'Dec',
}

function applyUpcomingWorkOverrides(upcomingWork, overrides) {
  for (const job of upcomingWork.jobs) {
    const jobOverrides = overrides[job.jobNumber]
    if (!jobOverrides) continue
    for (const [col, entry] of Object.entries(jobOverrides)) {
      if (col === '18') {
        job.notes = entry.value
        continue
      }
      const monthKey = UPCOMING_WORK_OVERRIDE_MONTHS[col]
      if (monthKey) job.months[monthKey] = Number(entry.value) || 0
    }
  }
}

export async function loadWorkbook() {
  // A hung fetch (e.g. mid-deploy, or a stale service-worker transition)
  // would otherwise leave the app stuck in its loading state indefinitely
  // — this bounds it so an error state (with a retry) shows up instead.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  let res, hoursRes, claimsLogRes, archivedRes, mainSheetOverrides, claimCalcOverrides, upcomingWorkOverrides
  try {
    ;[res, hoursRes, claimsLogRes, archivedRes, mainSheetOverrides, claimCalcOverrides, upcomingWorkOverrides] =
      await Promise.all([
        fetch(workbookUrl, { signal: controller.signal, cache: 'no-store' }),
        fetch(monthlyHoursLogUrl, { signal: controller.signal, cache: 'no-store' }),
        fetch(monthlyClaimsLogUrl, { signal: controller.signal, cache: 'no-store' }),
        fetch(archivedJobsUrl, { signal: controller.signal, cache: 'no-store' }),
        fetchOverrides('main-sheet'),
        fetchOverrides('claim-calculator'),
        fetchOverrides('upcoming-work'),
      ])
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) throw new Error(`Could not load the workbook (${res.status})`)
  const buffer = await res.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const jobRows = findJobsSheet(workbook)
  const jobs = rowsAfterHeader(jobRows).map(withDerivedFields)
  const monthlyClaims = parseMonthlyClaims(workbook)
  const mainSheet = parseMainSheet(workbook)
  const upcomingWork = parseUpcomingWork(workbook)
  applyMainSheetOverrides(mainSheet, mainSheetOverrides)
  applyClaimCalcOverrides(monthlyClaims, claimCalcOverrides)
  applyUpcomingWorkOverrides(upcomingWork, upcomingWorkOverrides)
  // The hours log is a nice-to-have on top of the core workbook data — if
  // it's missing or unreadable for any reason, degrade to an empty history
  // rather than failing the whole page load over it.
  const monthlyHours = hoursRes?.ok
    ? parseMonthlyHoursLog(await hoursRes.json())
    : { months: [], totalsByMonth: [], jobs: [] }
  const monthlyClaimsHistory = claimsLogRes?.ok
    ? parseMonthlyClaimsLog(await claimsLogRes.json())
    : { months: [], totalsByMonth: [], jobs: [] }

  // Archiving a completed job doesn't touch the workbook at all — it just
  // adds the job number to this list, which every job-bearing view filters
  // against here, in one place, rather than each sheet's own workbook data
  // ever being modified/deleted. Degrades to "nothing archived" if this is
  // missing/unreadable, same reasoning as the hours log above.
  const archivedJobNumbers = new Set(archivedRes?.ok ? await archivedRes.json() : [])
  const notArchived = (job) => !archivedJobNumbers.has(job.jobNumber)
  // Captured from the full, unfiltered list before archived jobs get
  // removed below — an "un-archive" control needs each archived job's
  // name to show, not just its number.
  const archivedJobs = jobs
    .filter((job) => archivedJobNumbers.has(job.jobNumber))
    .map((job) => ({ jobNumber: job.jobNumber, jobName: job.jobName }))

  return {
    jobs: jobs.filter(notArchived),
    monthlyClaims: { ...monthlyClaims, jobs: monthlyClaims.jobs.filter(notArchived) },
    mainSheet: { ...mainSheet, jobs: mainSheet.jobs.filter(notArchived) },
    monthlyHours,
    monthlyClaimsHistory: { ...monthlyClaimsHistory, jobs: monthlyClaimsHistory.jobs.filter(notArchived) },
    upcomingWork: { ...upcomingWork, jobs: upcomingWork.jobs.filter(notArchived) },
    archivedJobs,
  }
}
