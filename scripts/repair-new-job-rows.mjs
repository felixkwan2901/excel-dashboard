// One-off repair for jobs that were added to the workbook but never showed up
// on the site.
//
// add-new-job.mjs used to write the job number and name into the Claim
// Calculator and Upcoming Work sheets as formulas pointing at the Main Sheet
// row. ExcelJS writes formulas with no cached value and nothing in this
// pipeline opens the file in Excel to recalculate, so SheetJS — which reads
// cached values — saw empty cells. The rows were inserted (the Totals block
// moved down) but stayed blank, and the parser skips any row without a
// numeric job number. The jobs were in the workbook and invisible on the
// site, which is the worst of both.
//
// add-new-job.mjs now writes values. This fills in the rows already left
// blank by the old behaviour.
//
//   node scripts/repair-new-job-rows.mjs 8386 8829 7480 9437
//
// Only ever writes into a row that is genuinely empty, and says exactly what
// it changed. Safe to run twice: a job already present is skipped.
import ExcelJS from 'exceljs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKBOOK = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'Cassidy_Davies_Electrical_BPMN_Data.xlsx',
)
const SHEETS = ['Claim Calculator By Month', 'Upcoming Work Calculator']

const jobNumbers = process.argv.slice(2)
if (jobNumbers.length === 0) {
  console.error('Usage: node scripts/repair-new-job-rows.mjs <jobNumber> [...]')
  process.exit(1)
}

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(WORKBOOK)

let wrote = 0

for (const sheetName of SHEETS) {
  const ws = workbook.getWorksheet(sheetName)
  if (!ws) throw new Error(`Could not find "${sheetName}"`)

  const present = new Set()
  let lastJobRow = 0
  for (let r = 1; r <= ws.rowCount; r++) {
    const a = ws.getRow(r).getCell(1).value
    if (typeof a === 'number' && a > 0) {
      present.add(String(a))
      lastJobRow = r
    }
  }

  const missing = jobNumbers.filter((n) => !present.has(String(n)))
  if (missing.length === 0) {
    console.log(`${sheetName}: all ${jobNumbers.length} already present, nothing to do`)
    continue
  }

  // Fill the blank rows that follow the last real job row — the ones the old
  // insert created. Refuses to touch a row holding anything, so a mistake in
  // the row maths cannot overwrite a job.
  let row = lastJobRow + 1
  for (const jobNumber of missing) {
    while (row <= ws.rowCount && !isBlankRow(ws, row)) row += 1
    if (row > ws.rowCount) throw new Error(`${sheetName}: ran out of blank rows for ${jobNumber}`)
    ws.getRow(row).getCell(1).value = Number(jobNumber)
    ws.getRow(row).getCell(2).value = String(jobNumber)
    ws.getRow(row).commit?.()
    console.log(`${sheetName}: wrote ${jobNumber} into row ${row}`)
    wrote += 1
    row += 1
  }
}

function isBlankRow(ws, rowNumber) {
  const row = ws.getRow(rowNumber)
  for (let c = 1; c <= 20; c += 1) {
    const v = row.getCell(c).value
    if (v !== null && v !== undefined && String(v).trim() !== '') return false
  }
  return true
}

if (wrote > 0) {
  await workbook.xlsx.writeFile(WORKBOOK)
  console.log(`\nWrote ${wrote} cell pairs and saved the workbook.`)
} else {
  console.log('\nNothing to write; workbook untouched.')
}
