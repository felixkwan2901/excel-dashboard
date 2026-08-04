import * as XLSX from 'xlsx'
import workbookUrl from '../../Cassidy_Davies_Electrical_BPMN_Data.xlsx?url'

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
  quotedLabourCost: ['Quoted labour cost'],
  actualLabourCost: ['Actual labour cost'],
  quotedLabourHours: ['Quoted labour hours'],
  actualLabourHours: ['Actual labour hours'],
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
// and a real name — this is what distinguishes it from the "Week 1..5"
// snapshot rows (blank job number), the blank separator row between every
// job block, and the handful of junk rows in the sheet (job number 0 with
// no name, or a placeholder name like "Contracting").
function isValidJobRow(row) {
  const num = row[0]
  const name = row[1]
  return typeof num === 'number' && num > 0 && typeof name === 'string' && name.trim() !== '' && name.trim() !== '0'
}

function rowsAfterHeader(rows) {
  const headerIdx = rows.findIndex((row) => normalizeHeader(row[0]) === 'job number')
  if (headerIdx === -1) return []
  const columnMap = buildColumnMap(rows[headerIdx])

  const out = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!isValidJobRow(row)) continue
    const record = {}
    for (const field of Object.keys(FIELD_HEADER_ALIASES)) {
      const col = columnMap[field]
      record[field] = col !== undefined ? row[col] : ''
    }
    out.push(record)
  }
  return out
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
  const quotedLabourCost = toNumber(job.quotedLabourCost)
  const actualLabourCost = toNumber(job.actualLabourCost)
  const quotedLabourHours = toNumber(job.quotedLabourHours)
  const actualLabourHours = toNumber(job.actualLabourHours)
  const gpPerHour = toNumber(job.gpPerHour)
  const quotedGpPerHour = toNumber(job.quotedGpPerHour)
  const marginToDate = toNumber(job.marginToDate)
  const quotedMargin = toNumber(job.quotedMargin)

  const overBudget = totalActualCost !== null && totalQuotedCost !== null && totalActualCost > totalQuotedCost
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
    quotedLabourCost,
    actualLabourCost,
    quotedLabourHours,
    actualLabourHours,
    gpPerHour,
    quotedGpPerHour,
    marginToDate,
    quotedMargin,
    overBudget,
    losingMargin,
    flagged: overBudget || losingMargin,
  }
}

export async function loadWorkbook() {
  const buffer = await fetch(workbookUrl).then((res) => res.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'array' })

  const jobRows = sheetRows(workbook.Sheets['Sheet1'])
  const jobs = rowsAfterHeader(jobRows).map(withDerivedFields)

  return { jobs }
}
