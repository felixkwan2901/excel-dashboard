// Repairs jobs that were added to the workbook but never appeared on the site,
// and optionally sets their names.
//
// add-new-job.mjs used to write a new job's number and name into the Claim
// Calculator and Upcoming Work sheets as formulas pointing at its Main Sheet
// row. A formula is invisible to everything that reads this workbook: the
// dashboard parses with SheetJS, which reads a formula's *cached* value;
// ExcelJS writes formulas with no cached value because it does not evaluate
// them; and nothing in this pipeline opens the file in Excel to recalculate.
// So the row existed, held only formulas, and the parser — which needs a
// numeric job number — skipped it. The job was in the workbook and could not
// be seen or planned against.
//
// Rows are identified by the Main Sheet row their formula points at, not by
// counting blanks, so each one is matched to its actual job rather than
// guessed at.
//
//   node scripts/repair-new-job-rows.mjs
//   node scripts/repair-new-job-rows.mjs 9437="65A Belfast Road (Revised)"
//
// With no arguments it converts every formula row it finds. Arguments rename
// a job first — in the Main Sheet and the Deliverables Sheet, which are where
// a name actually lives — and the converted rows then carry the new name.
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
const MAIN_REF = /'Main Sheet'!A(\d+)/

const renames = new Map(
  process.argv.slice(2).map((arg) => {
    const at = arg.indexOf('=')
    if (at === -1) throw new Error(`Expected jobNumber=Name, got "${arg}"`)
    return [arg.slice(0, at).trim(), arg.slice(at + 1).trim()]
  }),
)

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(WORKBOOK)

const main = workbook.getWorksheet('Main Sheet')
const deliverables = workbook.getWorksheet('Deliverables Sheet')
if (!main || !deliverables) throw new Error('Could not find Main Sheet / Deliverables Sheet')

let changed = 0

// 1. Renames, in the two sheets that hold a name as a value.
for (const [jobNumber, name] of renames) {
  let hits = 0
  for (const ws of [main, deliverables]) {
    for (let r = 1; r <= ws.rowCount; r += 1) {
      const cell = ws.getRow(r).getCell(1)
      if (String(cell.value ?? '').trim() !== String(jobNumber)) continue
      const before = ws.getRow(r).getCell(2).value
      ws.getRow(r).getCell(2).value = name
      console.log(`${ws.name} row ${r}: ${jobNumber} renamed ${JSON.stringify(before)} -> ${JSON.stringify(name)}`)
      hits += 1
      changed += 1
    }
  }
  if (hits === 0) console.warn(`  ! ${jobNumber}: no row found to rename`)
}

// 2. Formula rows become values, matched to their job through the Main Sheet
//    row the formula names.
for (const sheetName of SHEETS) {
  const ws = workbook.getWorksheet(sheetName)
  if (!ws) throw new Error(`Could not find "${sheetName}"`)

  for (let r = 1; r <= ws.rowCount; r += 1) {
    const cell = ws.getRow(r).getCell(1).value
    if (!cell || typeof cell !== 'object' || !cell.formula) continue
    const match = MAIN_REF.exec(cell.formula)
    if (!match) continue

    const mainRow = Number(match[1])
    const jobNumber = main.getRow(mainRow).getCell(1).value
    const jobName = main.getRow(mainRow).getCell(2).value
    if (typeof jobNumber !== 'number' || !jobNumber) {
      console.warn(`  ! ${sheetName} row ${r}: Main Sheet row ${mainRow} has no job number, left alone`)
      continue
    }

    ws.getRow(r).getCell(1).value = jobNumber
    ws.getRow(r).getCell(2).value = String(jobName ?? jobNumber)
    console.log(`${sheetName} row ${r}: ${jobNumber} ${JSON.stringify(String(jobName ?? jobNumber))} (was a formula)`)
    changed += 1
  }
}

if (changed === 0) {
  console.log('\nNothing to change; workbook untouched.')
} else {
  await workbook.xlsx.writeFile(WORKBOOK)
  console.log(`\nChanged ${changed} cells and saved the workbook.`)
}
