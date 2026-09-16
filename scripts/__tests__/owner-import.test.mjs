import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findHeaderRow,
  readOwnerRows,
  planOwnerEdits,
  ownerEditsPayload,
  OWNER_COL,
} from '../../src/lib/ownerImport.js'

// The real Katipolt Jobs export, as taken on 18 August 2026: a blank row,
// then the headings, and no owner column at all.
const REAL_EXPORT = [
  ['', '', '', '', '', '', '', ''],
  ['Job No.', 'Name', 'Created', 'Customer', 'Job Address', 'Brief Description', 'Job Stage', 'Tags'],
  ['9783', 'Replace Highbays', '17/08/2026', 'Tunnel Wash Group Ltd', '2 Bowmaker Crescent', '', 'In Progress', ''],
]

const WITH_OWNER = [
  ['', '', '', ''],
  ['Job No.', 'Name', 'Owner', 'Job Stage'],
  ['8824', '3 Innovation Road', 'Tom Price', 'In Progress'],
  ['9065', 'Cooltranz stage 4', 'Cameron Skilton', 'In Progress'],
  ['9351', 'Harewood Golf Club', 'Charles Roselier', 'In Progress'],
]

const JOBS = [
  { jobNumber: '8824', jobName: '3 Innovation Road', jobOwner: 'Tom' },
  { jobNumber: '9065', jobName: 'Cooltranz stage 4', jobOwner: 'Cameron Skilton' },
  { jobNumber: '9351', jobName: 'Harewood Golf Club', jobOwner: '' },
]

test('finds the header row below the export’s blank first row', () => {
  assert.equal(findHeaderRow(WITH_OWNER), 1)
  assert.equal(findHeaderRow([['Job No.', 'Name']]), 0)
  assert.equal(findHeaderRow([['nothing', 'here']]), -1)
})

test('a Jobs export with no owner column says so, rather than reading as empty', () => {
  const r = readOwnerRows(REAL_EXPORT)
  assert.equal(r.ok, false)
  assert.match(r.error, /no owner column/i)
  assert.match(r.error, /Katipolt/)
})

test('a file that is not a Jobs export is rejected on the job number column', () => {
  const r = readOwnerRows([['Quote Number', 'Description', 'Stage']])
  assert.equal(r.ok, false)
  assert.match(r.error, /Job No\./)
})

test('reads owners and reports which heading it used', () => {
  const r = readOwnerRows(WITH_OWNER)
  assert.equal(r.ok, true)
  assert.equal(r.ownerHeader, 'Owner')
  assert.deepEqual(r.entries.map((e) => e.jobNumber), ['8824', '9065', '9351'])
})

test('the owner column is found by heading, not position', () => {
  const moved = [
    ['Job Stage', 'Customer', 'Job No.', 'Project Manager'],
    ['In Progress', 'Acme', '8824', 'Tom Price'],
  ]
  const r = readOwnerRows(moved)
  assert.equal(r.ok, true)
  assert.equal(r.ownerHeader, 'Project Manager')
  assert.deepEqual(r.entries, [{ jobNumber: '8824', owner: 'Tom Price' }])
})

test('splits the four outcomes apart', () => {
  const { entries } = readOwnerRows(WITH_OWNER)
  const plan = planOwnerEdits(entries, JOBS)
  assert.deepEqual(plan.changes.map((c) => [c.jobNumber, c.from, c.to]), [
    ['8824', 'Tom', 'Tom Price'],
    ['9351', '', 'Charles Roselier'],
  ])
  assert.deepEqual(plan.unchanged.map((u) => u.jobNumber), ['9065'])
  assert.deepEqual(plan.unrecognisedName, [])
  assert.deepEqual(plan.notOnDashboard, [])
})

test('a name outside the three is reported, never written', () => {
  const plan = planOwnerEdits([{ jobNumber: '8824', owner: 'Dylan Cassidy' }], JOBS)
  assert.equal(plan.changes.length, 0)
  assert.deepEqual(plan.unrecognisedName.map((u) => u.owner), ['Dylan Cassidy'])
})

test('a Katipolt job the dashboard does not hold is reported, not invented', () => {
  const plan = planOwnerEdits([{ jobNumber: '9783', owner: 'Tom Price' }], JOBS)
  assert.equal(plan.changes.length, 0)
  assert.deepEqual(plan.notOnDashboard.map((u) => u.jobNumber), ['9783'])
})

test('case and spacing in the export still match the agreed name', () => {
  const plan = planOwnerEdits([{ jobNumber: '9351', owner: '  tom price ' }], JOBS)
  assert.deepEqual(plan.changes.map((c) => c.to), ['Tom Price'])
})

test('a job listed twice is written once', () => {
  const plan = planOwnerEdits(
    [{ jobNumber: '9351', owner: 'Tom Price' }, { jobNumber: '9351', owner: 'Cameron Skilton' }],
    JOBS,
  )
  assert.equal(plan.changes.length, 1)
  assert.equal(plan.changes[0].to, 'Tom Price')
})

test('the payload targets Main Sheet column C', () => {
  const payload = ownerEditsPayload([{ jobNumber: '8824', to: 'Tom Price' }])
  assert.equal(OWNER_COL, 2)
  assert.deepEqual(payload, [{ jobNumber: '8824', col: 2, value: 'Tom Price' }])
})
