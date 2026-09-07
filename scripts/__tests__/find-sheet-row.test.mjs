import { test } from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { findRowByLabel } from '../../src/lib/findSheetRow.js'

// Build a sheet shaped like the Upcoming Work Calculator's capacity block.
function sheetFrom(labelsByRow) {
  const sheet = {}
  let maxRow = 0
  for (const [row, label] of Object.entries(labelsByRow)) {
    const r = Number(row) - 1
    sheet[XLSX.utils.encode_cell({ r, c: 0 })] = { v: label, t: 's' }
    maxRow = Math.max(maxRow, r)
  }
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: 16 } })
  return sheet
}

const ORIGINAL = { 70: 'Total Hours', 71: 'Residential Hours', 72: 'Commercial Hours', 73: 'Hours Available', 74: 'Balance Hours', 76: 'Working Days In Month', 77: 'No - Staff On Tools' }
// What the sheet became after a row was inserted above Total Hours.
const SHIFTED = { 71: 'Total Hours', 72: 'Residential Hours', 73: 'Commercial Hours', 74: 'Hours Available', 75: 'Balance Hours', 77: 'Working Days In Month', 78: 'No - Staff On Tools' }

test('finds each capacity row by its label', () => {
  const s = sheetFrom(SHIFTED)
  assert.equal(findRowByLabel(s, /^hours available$/i, 74), 74)
  assert.equal(findRowByLabel(s, /^working days in month/i, 77), 77)
  assert.equal(findRowByLabel(s, /staff on tools/i, 78), 78)
})

test('follows the rows when one is inserted above them — the actual bug', () => {
  // The same lookups against the pre-insert layout must land one row higher.
  // Hard-coded numbers could not do this, which is why "Staff on tools" ended
  // up showing the working-days figures.
  const s = sheetFrom(ORIGINAL)
  assert.equal(findRowByLabel(s, /^hours available$/i, 74), 73)
  assert.equal(findRowByLabel(s, /^working days in month/i, 77), 76)
  assert.equal(findRowByLabel(s, /staff on tools/i, 78), 77)
})

test('never confuses the two rows the bug swapped', () => {
  const s = sheetFrom(SHIFTED)
  const days = findRowByLabel(s, /^working days in month/i, 77)
  const staff = findRowByLabel(s, /staff on tools/i, 78)
  assert.notEqual(days, staff)
  assert.equal(staff, days + 1, 'staff on tools sits directly below working days')
})

test('falls back to the given row when the label is reworded', () => {
  const s = sheetFrom({ 74: 'Hours Avail.' })
  assert.equal(findRowByLabel(s, /^hours available$/i, 74), 74)
})

test('tolerates an empty or missing sheet', () => {
  assert.equal(findRowByLabel({}, /^anything$/i, 12), 12)
  assert.equal(findRowByLabel(undefined, /^anything$/i, 12), 12)
})

test('matches labels with surrounding whitespace', () => {
  const s = sheetFrom({ 74: '  Hours Available  ' })
  assert.equal(findRowByLabel(s, /^hours available$/i, 99), 74)
})
