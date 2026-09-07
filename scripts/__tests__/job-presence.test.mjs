import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findJobsMissingFromSheets, formatMissingJobsReport } from '../lib/job-presence.mjs'

// Minimal stand-in for the ExcelJS shape these helpers read: column 1 holds
// the job number, and eachRow walks the populated rows.
function workbookWith(sheets) {
  return {
    getWorksheet(name) {
      const numbers = sheets[name]
      if (!numbers) return null
      return {
        eachRow(fn) {
          for (const n of numbers) fn({ getCell: () => ({ value: n }) })
        },
      }
    },
  }
}

const blocks = [
  { jobNumber: 8946, jobName: 'Westcoast Vaults' },
  { jobNumber: 8530, jobName: '224 Cashel St - Eastern WC Block Reno' },
]

test('reports a job that is only on some tabs — the 8530 case', () => {
  const wb = workbookWith({
    'Main Sheet': [8946, 8530],
    'Claim Calculator By Month': [8946],
    'Upcoming Work Calculator': [8946],
  })
  const gaps = findJobsMissingFromSheets(wb, blocks)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].jobNumber, 8530)
  assert.deepEqual(gaps[0].missingFrom, ['Claim Calculator By Month', 'Upcoming Work Calculator'])
})

test('says nothing when every job is on every tab', () => {
  const wb = workbookWith({
    'Main Sheet': [8946, 8530],
    'Claim Calculator By Month': [8946, 8530],
    'Upcoming Work Calculator': [8946, 8530],
  })
  assert.deepEqual(findJobsMissingFromSheets(wb, blocks), [])
  assert.equal(formatMissingJobsReport([]), null)
})

test('ignores blocks that are not real jobs', () => {
  // A blank-named block is invisible to the rest of the pipeline; it should
  // not be reported as missing from anywhere.
  const wb = workbookWith({
    'Main Sheet': [8946],
    'Claim Calculator By Month': [8946],
    'Upcoming Work Calculator': [8946],
  })
  const withJunk = [{ jobNumber: 8946, jobName: 'Westcoast Vaults' }, { jobNumber: 0, jobName: '' }]
  assert.deepEqual(findJobsMissingFromSheets(wb, withJunk), [])
})

test('treats a whole missing sheet as every job missing from it', () => {
  const wb = workbookWith({ 'Main Sheet': [8946, 8530] })
  const gaps = findJobsMissingFromSheets(wb, blocks)
  assert.equal(gaps.length, 2)
  assert.ok(gaps.every((g) => g.missingFrom.includes('Claim Calculator By Month')))
})

test('the report names the job and the tabs it is missing from', () => {
  const report = formatMissingJobsReport([
    { jobNumber: 8530, jobName: '224 Cashel St', missingFrom: ['Claim Calculator By Month'] },
  ])
  assert.match(report, /8530/)
  assert.match(report, /224 Cashel St/)
  assert.match(report, /Claim Calculator By Month/)
  assert.match(report, /Projects and nowhere else/)
})
