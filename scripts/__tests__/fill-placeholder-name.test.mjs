import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { fillPlaceholderName } from '../update-jobs.mjs'

// A tiny stand-in for the real workbook: the four sheets that carry a job
// number in column A and a name in column B.
function workbookWith(rows) {
  const wb = new ExcelJS.Workbook()
  for (const name of ['Main Sheet', 'Deliverables Sheet', 'Claim Calculator By Month', 'Upcoming Work Calculator']) {
    const ws = wb.addWorksheet(name)
    rows.forEach(([number, jobName], i) => {
      ws.getRow(i + 1).getCell(1).value = number
      ws.getRow(i + 1).getCell(2).value = jobName
    })
  }
  return wb
}

const nameOn = (wb, sheet, row) => wb.getWorksheet(sheet).getRow(row).getCell(2).value

test('a job named after its own number takes the name from the export', () => {
  const wb = workbookWith([[9437, '9437']])
  const result = fillPlaceholderName(wb, 9437, 'New Build - 65A Belfast Road')
  assert.equal(result.name, 'New Build - 65A Belfast Road')
  // All four sheets, because once a derived row holds a value rather than a
  // formula a rename no longer propagates on its own.
  assert.equal(result.cells, 4)
  for (const sheet of ['Main Sheet', 'Deliverables Sheet', 'Claim Calculator By Month', 'Upcoming Work Calculator']) {
    assert.equal(nameOn(wb, sheet, 1), 'New Build - 65A Belfast Road')
  }
})

test('a name someone chose is never overwritten', () => {
  const wb = workbookWith([[7658, 'Charity Hospital']])
  const result = fillPlaceholderName(wb, 7658, 'Christchurch Charity Hospital Clinical Skills Centre - Design & Price')
  assert.equal(result, null, 'the short hand-written name must survive the export’s long one')
  assert.equal(nameOn(wb, 'Main Sheet', 1), 'Charity Hospital')
})

test('other jobs are left alone', () => {
  const wb = workbookWith([[9437, '9437'], [7658, 'Charity Hospital']])
  fillPlaceholderName(wb, 9437, '65A Belfast Road')
  assert.equal(nameOn(wb, 'Main Sheet', 1), '65A Belfast Road')
  assert.equal(nameOn(wb, 'Main Sheet', 2), 'Charity Hospital')
})

test('an export with no usable name changes nothing', () => {
  const wb = workbookWith([[9437, '9437']])
  assert.equal(fillPlaceholderName(wb, 9437, ''), null)
  assert.equal(fillPlaceholderName(wb, 9437, '   '), null)
  // An export echoing the number back is not a name either.
  assert.equal(fillPlaceholderName(wb, 9437, '9437'), null)
  assert.equal(nameOn(wb, 'Main Sheet', 1), '9437')
})

test('every row of a multi-row Deliverables block is renamed', () => {
  const wb = workbookWith([[8386, '8386'], [8386, '8386'], [8386, '8386']])
  const result = fillPlaceholderName(wb, 8386, 'Bach in Kaikoura')
  assert.equal(result.cells, 12, 'three rows across four sheets')
})
