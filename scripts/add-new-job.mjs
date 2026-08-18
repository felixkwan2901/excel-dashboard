#!/usr/bin/env node
// Adds a brand-new job to the workbook — Phase 4 of removing manual Excel
// editing entirely. Wires the job into all four sheets that reference a
// job by row: Deliverables Sheet (a new block, appended at the true end),
// Main Sheet (a new row), Claim Calculator By Month, and Upcoming Work
// Calculator (both: a new row inserted before their trailing Totals/summary
// section, with formulas pointed at the new Main Sheet row / Deliverables
// Sheet block).
//
// Reads staged { jobNumber, jobName, jobOwner, quotedPrice,
// quotedMaterialCost, quotedLabourCost, quotedLabourHours } batches from
// pending-updates/new-job/, same pipeline as the other apply-*.mjs scripts.

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const STAGING_DIR = resolve('pending-updates/new-job')
const FAILED_DIR = resolve('pending-updates/failed')
const WORKBOOK_PATH = resolve('Cassidy_Davies_Electrical_BPMN_Data.xlsx')
const SYNC_META_PATH = resolve('sync-meta.json')

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolveCellValue(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('error' in v) return ''
    if ('result' in v) {
      const r = v.result
      if (r && typeof r === 'object' && 'error' in r) return ''
      return r ?? ''
    }
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
  }
  return v
}

function worksheetToRows(worksheet) {
  const rows = []
  const colCount = Math.max(worksheet.columnCount, 30)
  for (let r = 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r)
    const arr = []
    for (let c = 1; c <= colCount; c++) arr[c - 1] = resolveCellValue(row.getCell(c).value)
    rows[r - 1] = arr
  }
  return rows
}

function normalizeHeader(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function findDeliverablesSheet(workbook) {
  const candidates = []
  for (const worksheet of workbook.worksheets) {
    const rows = worksheetToRows(worksheet)
    const headerIdx = rows.findIndex((r) => normalizeHeader(r[0]) === 'job number')
    if (headerIdx === -1) continue
    const header = rows[headerIdx].map(normalizeHeader)
    if (!header.includes('quoted price') || !header.includes('total actual cost')) continue
    candidates.push({ worksheet, rows, headerIdx })
  }
  const preferred = candidates.find((c) => !c.worksheet.name.toLowerCase().includes('test'))
  const chosen = preferred ?? candidates[0]
  if (!chosen) throw new Error('Could not find the Deliverables Sheet')
  return chosen
}

function buildJobBlocks(rows, headerIdx) {
  const blocks = []
  let current = null
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const label = rows[i][2]
    if (label === 'Start of month') {
      if (current) blocks.push(current)
      current = { startIdx: i, jobNumber: rows[i][0], jobName: rows[i][1], weekIdxs: [i] }
    } else if (current && typeof label === 'string' && label.startsWith('Week')) {
      current.weekIdxs.push(i)
    }
  }
  if (current) blocks.push(current)
  return blocks
}

const isValidJobBlock = (b) =>
  Number(b.jobNumber) > 0 && String(b.jobName ?? '').trim() !== '' && String(b.jobName).trim() !== '0'

// Copies a row's full style (fill/border/font/numFmt/alignment + height) —
// not its values — from one row to another, cell by cell. Used both for a
// pure append (nothing below to shift) and after an insert has already
// opened up the target row.
function copyRowStyle(worksheet, srcRowNum, dstRowNum) {
  const src = worksheet.getRow(srcRowNum)
  const dst = worksheet.getRow(dstRowNum)
  dst.style = src.style
  dst.height = src.height
  src.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    dst.getCell(colNumber).style = cell.style
  })
}

// Inserts one blank row at `insertAtRow` (shifting every row from there
// onward down by one — ExcelJS's spliceRows preserves the shifted rows'
// own values/styles/merges, see its "insert new cells" branch), then fixes
// up the newly-opened row's style by copying it from `styleTemplateRowNum`
// (adjusted by one if that template row was itself at or after the
// insertion point, since it just shifted down too).
function insertBlankRowWithStyle(worksheet, insertAtRow, styleTemplateRowNum) {
  worksheet.spliceRows(insertAtRow, 0, [])
  const effectiveTemplateRow = styleTemplateRowNum >= insertAtRow ? styleTemplateRowNum + 1 : styleTemplateRowNum
  copyRowStyle(worksheet, effectiveTemplateRow, insertAtRow)
  return worksheet.getRow(insertAtRow)
}

function setRowValues(worksheet, rowNum, valuesByCol) {
  const row = worksheet.getRow(rowNum)
  for (const [col, value] of Object.entries(valuesByCol)) row.getCell(Number(col) + 1).value = value
}

// ---------------------------------------------------------------------------
// Deliverables Sheet columns (0-indexed) — same map scripts/update-jobs.mjs
// uses for updating an EXISTING job's week row.
// ---------------------------------------------------------------------------
const DELIV_COL = {
  quotedPrice: 3, claimToDate: 4, remainingToClaim: 5, pctClaimRemaining: 6,
  totalQuotedCost: 7, totalActualCost: 8, quotedMaterialCost: 9, actualMaterialCost: 10,
  materialCostRemaining: 11, materialPctRemaining: 12,
  quotedLabourCost: 14, actualLabourCost: 15, labourCostRemaining: 16, labourCostPctRemaining: 17,
  quotedLabourHours: 18, actualLabourHours: 19, labourHoursRemaining: 20, labourHourPctRemaining: 21,
  gpPerHour: 23, quotedGpPerHour: 24, marginToDate: 25, quotedMargin: 26,
}

// ---------------------------------------------------------------------------
// Add one new job to all four sheets.
// ---------------------------------------------------------------------------

async function addNewJobToWorkbook(workbook, input) {
  const { jobNumber, jobName, jobOwner, quotedPrice, quotedMaterialCost, quotedLabourCost, quotedLabourHours } = input
  const jobNum = Number(jobNumber)

  // -------------------------------------------------------------------
  // 1. Deliverables Sheet — append a whole new block (Start of month +
  //    Week 1-5) at the true end of the sheet, plus a blank separator
  //    before it (matching every other block-to-block gap). Nothing
  //    exists below the current last block, so this is a pure append —
  //    no row-shifting needed here at all.
  // -------------------------------------------------------------------
  const { worksheet: delivWs, rows: delivRows, headerIdx: delivHeaderIdx } = findDeliverablesSheet(workbook)
  const delivBlocks = buildJobBlocks(delivRows, delivHeaderIdx).filter(isValidJobBlock)
  if (delivBlocks.some((b) => Number(b.jobNumber) === jobNum)) {
    throw new Error(`Job ${jobNumber} already exists in the Deliverables Sheet`)
  }
  const lastBlock = delivBlocks[delivBlocks.length - 1]
  const lastBlockEndRow = lastBlock.weekIdxs[lastBlock.weekIdxs.length - 1] + 1 // 1-indexed
  // A separator row template — any block before the last one has a blank
  // row right after its own last week row.
  const templateBlock = delivBlocks.length > 1 ? delivBlocks[0] : lastBlock
  const separatorTemplateRow = templateBlock.weekIdxs[templateBlock.weekIdxs.length - 1] + 2 // 1-indexed, row after last week

  const quotedMaterialCostValue = quotedMaterialCost
  const quotedMaterialPctRemaining = quotedMaterialCostValue ? 1 : 0
  const quotedLabourCostRemaining = quotedLabourCost
  const quotedLabourHoursRemaining = quotedLabourHours

  let nextRow = lastBlockEndRow + 1
  copyRowStyle(delivWs, separatorTemplateRow, nextRow)
  nextRow += 1

  const newBlockStartRow = nextRow
  const weekLabels = ['Start of month', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']
  for (let i = 0; i < weekLabels.length; i++) {
    const srcRow = lastBlock.weekIdxs[i] + 1 // 1-indexed template row for this position
    copyRowStyle(delivWs, srcRow, nextRow)
    setRowValues(delivWs, nextRow, { 2: weekLabels[i] }) // col C: label
    nextRow += 1
  }

  // Only the "Start of month" row (the block's baseline) gets real figures
  // — Week 1-5 stay blank until the normal per-job update pipeline fills
  // them in, same as any other job's first month.
  setRowValues(delivWs, newBlockStartRow, {
    0: jobNum,
    1: String(jobName),
    3: quotedPrice,
    4: 0, // claimToDate
    5: quotedPrice, // remainingToClaim = quotedPrice - 0
    6: quotedPrice ? 1 : 0, // pctClaimRemaining
    7: quotedPrice, // totalQuotedCost — same convention as update-jobs.mjs: quoted cost basis defaults to the quoted price until a real P&L breakdown is uploaded
    8: 0, // totalActualCost
    9: quotedMaterialCostValue,
    10: 0, // actualMaterialCost
    11: quotedMaterialCostValue, // materialCostRemaining
    12: quotedMaterialPctRemaining,
    14: quotedLabourCostRemaining,
    15: 0, // actualLabourCost
    16: quotedLabourCostRemaining, // labourCostRemaining
    17: quotedLabourCostRemaining ? 1 : 0,
    18: quotedLabourHoursRemaining,
    19: 0, // actualLabourHours
    20: quotedLabourHoursRemaining, // labourHoursRemaining
    21: quotedLabourHoursRemaining ? 1 : 0,
    23: 0, // gpPerHour (no actual hours yet)
    24: quotedLabourHoursRemaining ? 0 : 0, // quotedGpPerHour — left 0 until a real quoted profit figure is known
    25: 0, // marginToDate
    26: 0, // quotedMargin
  })

  const newDelivBlockRowRange = { startRow: newBlockStartRow, endRow: newBlockStartRow + 5 }

  // -------------------------------------------------------------------
  // 2. Main Sheet — a new job row, with its own blank separator before
  //    it (matching the alternating job/blank pattern), appended after
  //    the sheet's current last row.
  // -------------------------------------------------------------------
  const mainWs = workbook.getWorksheet('Main Sheet')
  if (!mainWs) throw new Error('Could not find "Main Sheet"')
  const mainRows = worksheetToRows(mainWs)
  let mainLastJobRow = null
  for (let r = 3; r < mainRows.length; r++) {
    const row = mainRows[r]
    if (typeof row[0] === 'number' && row[0] > 0) {
      if (Number(row[0]) === jobNum) throw new Error(`Job ${jobNumber} already exists in Main Sheet`)
      mainLastJobRow = r + 1 // 1-indexed
    }
  }
  if (!mainLastJobRow) throw new Error('Could not find any existing job row in Main Sheet')

  const mainBlankRow = insertBlankRowWithStyle(mainWs, mainLastJobRow + 1, mainLastJobRow + 1)
  const mainNewJobRow = mainBlankRow.number + 1
  copyRowStyle(mainWs, mainLastJobRow, mainNewJobRow)
  setRowValues(mainWs, mainNewJobRow, { 0: jobNum, 1: String(jobName), 2: String(jobOwner ?? '') })
  // Checklist columns (3-22) start blank — left untouched (copied style
  // only, no values), matching a job that hasn't had any milestones
  // ticked off yet.

  // -------------------------------------------------------------------
  // 3. Claim Calculator By Month — a new row inserted right after the
  //    last job row (shifting the trailing blank rows + Totals section
  //    down), with identity/quoted-margin formulas pointed at the new
  //    Main Sheet row and Deliverables Sheet block. Manual columns
  //    (Claim, Costs, Retention, Hours/Costs-to-come-before-E.O.M, notes)
  //    are left blank — fillable via the Claim Calculator editor.
  // -------------------------------------------------------------------
  const claimWs = workbook.getWorksheet('Claim Calculator By Month')
  if (!claimWs) throw new Error('Could not find "Claim Calculator By Month"')
  const claimRows = worksheetToRows(claimWs)
  let claimLastJobRow = null
  for (let r = 0; r < claimRows.length; r++) {
    const row = claimRows[r]
    if (typeof row[0] === 'number' && row[0] > 0) claimLastJobRow = r + 1
  }
  if (!claimLastJobRow) throw new Error('Could not find any existing job row in Claim Calculator By Month')

  // One insert shifts everything from here on down by one — whatever
  // blank row(s) already existed between the last job and the Totals
  // section still exist afterward, just shifted, and serve as the new
  // job's own trailing spacer. Style is copied from the last job row as
  // part of the insert itself.
  const claimNewJobRow = claimLastJobRow + 1
  insertBlankRowWithStyle(claimWs, claimNewJobRow, claimLastJobRow)
  claimWs.getRow(claimNewJobRow).getCell(1).value = { formula: `'Main Sheet'!A${mainNewJobRow}` }
  claimWs.getRow(claimNewJobRow).getCell(2).value = { formula: `'Main Sheet'!B${mainNewJobRow}` }
  claimWs.getRow(claimNewJobRow).getCell(5).value = { formula: `C${claimNewJobRow}-D${claimNewJobRow}` } // Profit
  claimWs.getRow(claimNewJobRow).getCell(7).value = { formula: `(E${claimNewJobRow}+F${claimNewJobRow})/C${claimNewJobRow}` } // Margin
  claimWs.getRow(claimNewJobRow).getCell(8).value = {
    formula: `'Deliverables Sheet'!AA${newDelivBlockRowRange.startRow}`,
  } // Quoted Margin, pointed at the new block's Start-of-month row
  claimWs.getRow(claimNewJobRow).getCell(11).value = { formula: `(I${claimNewJobRow}*40)+J${claimNewJobRow}` } // Total cost to come before E.O.M
  claimWs.getRow(claimNewJobRow).getCell(12).value = {
    formula: `((E${claimNewJobRow}-K${claimNewJobRow})+F${claimNewJobRow})/C${claimNewJobRow}`,
  } // Est. margin E.O.M
  claimWs.getRow(claimNewJobRow).getCell(13).value = { formula: `SUM(E${claimNewJobRow}:F${claimNewJobRow})-K${claimNewJobRow}` } // GP End of month
  claimWs.getRow(claimNewJobRow).getCell(15).value = {
    formula: `SUM(M${claimNewJobRow}/(N${claimNewJobRow}+I${claimNewJobRow}))`,
  } // GP $ per hour this month
  // Manual columns C, D, F, I, J, Q (2,3,5,8,9,16 0-indexed) intentionally
  // left blank — fillable via the Claim Calculator editor once this job
  // actually gets claimed against.

  // -------------------------------------------------------------------
  // 4. Upcoming Work Calculator — same insert-before-summary approach,
  //    with the three hours LOOKUPs pointed at the new Deliverables
  //    Sheet block's actual Week 1-5 row range (S/T/U columns).
  // -------------------------------------------------------------------
  const upcomingWs = workbook.getWorksheet('Upcoming Work Calculator')
  if (!upcomingWs) throw new Error('Could not find "Upcoming Work Calculator"')
  const upcomingRows = worksheetToRows(upcomingWs)
  let upcomingLastJobRow = null
  for (let r = 0; r < upcomingRows.length; r++) {
    const row = upcomingRows[r]
    if (typeof row[0] === 'number' && row[0] > 0) upcomingLastJobRow = r + 1
  }
  if (!upcomingLastJobRow) throw new Error('Could not find any existing job row in Upcoming Work Calculator')

  const upcomingNewJobRow = upcomingLastJobRow + 1
  insertBlankRowWithStyle(upcomingWs, upcomingNewJobRow, upcomingLastJobRow)
  // The new block's Week 1-5 rows (S/T/U columns) — Start of month is
  // excluded from this LOOKUP range, matching the existing pattern seen
  // on every other job row.
  const week1Row = newDelivBlockRowRange.startRow + 1
  const week5Row = newDelivBlockRowRange.endRow
  upcomingWs.getRow(upcomingNewJobRow).getCell(1).value = { formula: `'Main Sheet'!A${mainNewJobRow}` }
  upcomingWs.getRow(upcomingNewJobRow).getCell(2).value = { formula: `'Main Sheet'!B${mainNewJobRow}` }
  upcomingWs.getRow(upcomingNewJobRow).getCell(3).value = {
    formula: `LOOKUP(2,1/('Deliverables Sheet'!S${week1Row}:S${week5Row}<>0),'Deliverables Sheet'!S${week1Row}:S${week5Row})`,
  }
  upcomingWs.getRow(upcomingNewJobRow).getCell(4).value = {
    formula: `LOOKUP(2,1/('Deliverables Sheet'!T${week1Row}:T${week5Row}<>0),'Deliverables Sheet'!T${week1Row}:T${week5Row})`,
  }
  upcomingWs.getRow(upcomingNewJobRow).getCell(5).value = {
    formula: `LOOKUP(2,1/('Deliverables Sheet'!U${week1Row}:U${week5Row}<>0),'Deliverables Sheet'!U${week1Row}:U${week5Row})`,
  }
  // Jan-Dec (cols F-Q) and notes (col S) intentionally left blank —
  // fillable via the Upcoming Work editor.

  return {
    delivStartRow: newDelivBlockRowRange.startRow,
    mainRow: mainNewJobRow,
    claimRow: claimNewJobRow,
    upcomingRow: upcomingNewJobRow,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(STAGING_DIR)) {
    console.log('No pending new-job requests.')
    return
  }
  const files = readdirSync(STAGING_DIR).filter((f) => f.toLowerCase().endsWith('.json')).sort()
  if (files.length === 0) {
    console.log('No pending new-job requests.')
    return
  }

  console.log(`Found ${files.length} staged new-job request(s)`)

  let anyApplied = false
  for (const name of files) {
    const path = join(STAGING_DIR, name)
    let input
    try {
      input = JSON.parse(readFileSync(path, 'utf8'))
    } catch (err) {
      console.log(`  ${name}: invalid JSON — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: `Invalid JSON: ${err.message}` }, null, 2))
      continue
    }

    // Read + apply + write per request, one at a time — each request
    // needs the workbook as it exists after the PREVIOUS request in this
    // batch (e.g. two new jobs staged back to back must land in different
    // rows, not both target the same "last job row").
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(WORKBOOK_PATH)

    try {
      const result = await addNewJobToWorkbook(wb, input)
      await wb.xlsx.writeFile(WORKBOOK_PATH)
      anyApplied = true
      console.log(
        `  ${name}: added job ${input.jobNumber} ${input.jobName} — Deliverables row ${result.delivStartRow}, Main Sheet row ${result.mainRow}, Claim Calculator row ${result.claimRow}, Upcoming Work row ${result.upcomingRow}`,
      )
    } catch (err) {
      console.log(`  ${name}: ${err.message} — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: err.message }, null, 2))
      continue
    }

    rmSync(path, { force: true })
  }

  if (anyApplied) {
    try {
      const meta = JSON.parse(readFileSync(SYNC_META_PATH, 'utf8'))
      meta.updatedAt = new Date().toISOString()
      writeFileSync(SYNC_META_PATH, JSON.stringify(meta, null, 2) + '\n')
    } catch {
      // sync-meta.json is optional
    }
  }
}

main()
