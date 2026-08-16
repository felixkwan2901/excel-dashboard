import * as XLSX from 'xlsx'
import workbookUrl from '../../Cassidy_Davies_Electrical_BPMN_Data.xlsx?url'

// Lives in public/ rather than an import — Vite doesn't emit a `?url`
// import of a .json file as a fetchable static asset the way it does for
// other file types.
const monthlyHoursLogUrl = `${import.meta.env.BASE_URL}monthly-hours-log.json`

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
      let dataRowIdx = block.weekRows.length - 1
      for (let i = block.weekRows.length - 1; i >= 0; i--) {
        if (weekRowHasData(block.weekRows[i], columnMap)) {
          dataRowIdx = i
          break
        }
      }
      const dataRow = block.weekRows[dataRowIdx]

      // The previously-filled week before the current one, if any — used
      // to show a trend (margin improving/worsening) rather than just a
      // single point-in-time snapshot. A job on its first ever week (or
      // just rolled into a new month) has nothing to compare against yet.
      let previousRow = null
      for (let i = dataRowIdx - 1; i >= 0; i--) {
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
      record.previousMarginToDate = previousRow && marginCol !== undefined ? previousRow[marginCol] : ''
      return record
    })
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
    // Only the Commercial row repeats "Totals" in column 0 — the
    // Residential row leaves it blank, so the reliable signal both totals
    // rows share is the "GP%" label sitting in the Retention column.
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
      margin: toNumber(row[6]),
      quotedMargin: toNumber(row[7]),
      hoursToCompleteBeforeEom: toNumber(row[8]),
      costsToComeBeforeEom: toNumber(row[9]),
      totalCostToComeBeforeEom: toNumber(row[10]),
      estimatedMarginEom: toNumber(row[11]),
      gpEndOfMonth: toNumber(row[12]),
      hoursThisMonth: toNumber(row[13]),
      gpPerHourThisMonth: toNumber(row[14]),
    })
  }

  return { jobs, totals }
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

export async function loadWorkbook() {
  // A hung fetch (e.g. mid-deploy, or a stale service-worker transition)
  // would otherwise leave the app stuck in its loading state indefinitely
  // — this bounds it so an error state (with a retry) shows up instead.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  let res, hoursRes
  try {
    ;[res, hoursRes] = await Promise.all([
      fetch(workbookUrl, { signal: controller.signal }),
      fetch(monthlyHoursLogUrl, { signal: controller.signal }),
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
  // The hours log is a nice-to-have on top of the core workbook data — if
  // it's missing or unreadable for any reason, degrade to an empty history
  // rather than failing the whole page load over it.
  const monthlyHours = hoursRes?.ok
    ? parseMonthlyHoursLog(await hoursRes.json())
    : { months: [], totalsByMonth: [], jobs: [] }

  return { jobs, monthlyClaims, mainSheet, monthlyHours }
}
