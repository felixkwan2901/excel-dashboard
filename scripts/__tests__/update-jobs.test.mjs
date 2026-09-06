import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMoney,
  parsePercent,
  monthKey,
  calendarWeekOfMonth,
} from '../update-jobs.mjs'

// ---------------------------------------------------------------------------
// Which week an upload lands in. Getting this wrong writes the week's figures
// over the wrong slot, which reads as a job's costs jumping or vanishing.
// ---------------------------------------------------------------------------

test('calendar week follows the day of the month, not the upload order', () => {
  assert.equal(calendarWeekOfMonth(new Date(2026, 8, 1)), 1)   // 1 Sep
  assert.equal(calendarWeekOfMonth(new Date(2026, 8, 7)), 1)   // 7 Sep — still week 1
  assert.equal(calendarWeekOfMonth(new Date(2026, 8, 8)), 2)   // 8 Sep — week 2
  assert.equal(calendarWeekOfMonth(new Date(2026, 8, 14)), 2)
  assert.equal(calendarWeekOfMonth(new Date(2026, 8, 15)), 3)
  assert.equal(calendarWeekOfMonth(new Date(2026, 8, 22)), 4)
})

test('week is capped at 5 — the sheet has no sixth slot', () => {
  assert.equal(calendarWeekOfMonth(new Date(2026, 7, 29)), 5)
  assert.equal(calendarWeekOfMonth(new Date(2026, 7, 31)), 5) // 31 Aug would be week 5
  assert.equal(calendarWeekOfMonth(new Date(2026, 0, 31)), 5)
})

// ---------------------------------------------------------------------------
// Month key — decides which month a snapshot is filed under, and drives the
// rollover that closes the previous month out.
// ---------------------------------------------------------------------------

test('month key is zero-padded and year-prefixed', () => {
  assert.equal(monthKey(new Date(2026, 0, 15)), '2026-01')
  assert.equal(monthKey(new Date(2026, 8, 3)), '2026-09')
  assert.equal(monthKey(new Date(2026, 11, 31)), '2026-12')
})

test('month key uses local time, so a late-evening run stays in its own month', () => {
  // 31 Aug 23:00 NZ is already 1 Sep in UTC. Filing it as September would
  // close August out a day early and take the last day's work with it.
  assert.equal(monthKey(new Date(2026, 7, 31, 23, 0, 0)), '2026-08')
})

// ---------------------------------------------------------------------------
// Parsing the figures out of the export. These read real spreadsheet cells,
// which arrive as numbers, currency strings, or percentages.
// ---------------------------------------------------------------------------

test('money parses numbers and currency strings alike', () => {
  assert.equal(parseMoney(30925), 30925)
  assert.equal(parseMoney('$30,925'), 30925)
  assert.equal(parseMoney('$30,925.50'), 30925.5)
  assert.equal(parseMoney('-$715'), -715)
  assert.equal(parseMoney(0), 0)
})

test('money returns null for non-string, non-number input', () => {
  assert.equal(parseMoney(null), null)
  assert.equal(parseMoney(undefined), null)
  assert.equal(parseMoney({}), null)
})

// NOTE: documents current behaviour, which is arguably wrong — see the
// summary in the commit. Stripping non-numeric characters turns '' and 'n/a'
// into '', and Number('') is 0, which is finite — so a blank or unreadable
// cell parses as a real $0 rather than "no figure". The required-fields check
// in readExport only rejects null/undefined, so a zero sails through and gets
// written to the workbook as an actual zero. Pinned here so the behaviour
// can't change by accident, not because it is correct.
test('money turns blank and unreadable cells into 0, not null', () => {
  assert.equal(parseMoney(''), 0)
  assert.equal(parseMoney('   '), 0)
  assert.equal(parseMoney('n/a'), 0)
})

test('percent converts a % string to a fraction but leaves bare numbers alone', () => {
  // 6.82% must become 0.0682 — filing it as 6.82 would read as a 682% margin.
  // Compared with a tolerance: dividing by 100 is not exact in binary floating
  // point (-2.2/100 lands on -0.022000000000000002).
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`)
  close(parsePercent('6.82%'), 0.0682)
  close(parsePercent('28.94%'), 0.2894)
  close(parsePercent('-2.2%'), -0.022)
  assert.equal(parsePercent(0.0682), 0.0682)
})

test('percent returns null for non-string, non-number input', () => {
  assert.equal(parsePercent(null), null)
  assert.equal(parsePercent({}), null)
})

// Same caveat as parseMoney above: 'n/a' becomes 0, i.e. a 0% margin.
test('percent turns blank and unreadable cells into 0, not null', () => {
  assert.equal(parsePercent(''), 0)
  assert.equal(parsePercent('n/a'), 0)
})
