import test from 'node:test'
import assert from 'node:assert/strict'
import { JOB_OWNERS, OWNER_COL } from '../../src/lib/jobOwners.js'

// loadWorkbook.js reads the owner from row[2] of the Main Sheet, and
// apply-main-sheet-edits.mjs writes an edit to getCell(col + 1). Those two
// agree only while this constant is 2; a change here writes the owner into
// the job name column and the site would keep reading the old one.
test('the owner column is Main Sheet column C, 0-based', () => {
  assert.equal(OWNER_COL, 2)
})

test('the owners are the three agreed names, and full names', () => {
  assert.deepEqual(JOB_OWNERS, ['Cameron Skilton', 'Charles Roselier', 'Tom Price'])
  for (const name of JOB_OWNERS) assert.match(name, /\S+\s+\S+/, `${name} should be a full name`)
})
