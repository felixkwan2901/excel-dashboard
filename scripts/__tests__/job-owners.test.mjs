import test from 'node:test'
import assert from 'node:assert/strict'
import {
  JOB_OWNERS,
  OWNER_COL,
  selectedOwner,
  planOwnerEdits,
  ownerEditsPayload,
} from '../../src/lib/jobOwners.js'

const JOBS = [
  { jobNumber: '8824', jobName: '3 Innovation Road', jobOwner: 'Tom' },
  { jobNumber: '9065', jobName: 'Cooltranz stage 4', jobOwner: 'Tom Price' },
  { jobNumber: '9351', jobName: 'Harewood Golf Club', jobOwner: '' },
]

test('an old short name reads as unset, so it still needs choosing', () => {
  assert.equal(selectedOwner({ jobOwner: 'Tom' }), '')
  assert.equal(selectedOwner({ jobOwner: 'Cameron' }), '')
  assert.equal(selectedOwner({ jobOwner: 'Tom Price' }), 'Tom Price')
  assert.equal(selectedOwner({ jobOwner: '  Tom Price  ' }), 'Tom Price')
  assert.equal(selectedOwner({}), '')
})

test('a job nobody touched is not an edit', () => {
  assert.deepEqual(planOwnerEdits({}, JOBS), [])
})

test('showing an unrecognised owner as blank does not clear it', () => {
  // 8824 displays as unset because "Tom" is not one of the three. If that
  // display leaked into the draft it would wipe the cell; only a real choice
  // counts.
  const fromDisplayOnly = Object.fromEntries(JOBS.map((j) => [j.jobNumber, selectedOwner(j)]))
  const changes = planOwnerEdits(fromDisplayOnly, JOBS)
  assert.deepEqual(changes.map((c) => c.jobNumber), ['8824'])
  assert.equal(changes[0].to, '')
  // …and that only happens because the draft explicitly holds every job. A
  // draft built from real clicks holds only what was clicked:
  assert.deepEqual(planOwnerEdits({ '9351': 'Tom Price' }, JOBS).map((c) => c.jobNumber), ['9351'])
})

test('choosing the same name again is not an edit', () => {
  assert.deepEqual(planOwnerEdits({ '9065': 'Tom Price' }, JOBS), [])
})

test('clearing an owner is a real edit', () => {
  const changes = planOwnerEdits({ '9065': '' }, JOBS)
  assert.deepEqual(changes.map((c) => [c.jobNumber, c.from, c.to]), [['9065', 'Tom Price', '']])
})

test('a name outside the three is never written', () => {
  assert.deepEqual(planOwnerEdits({ '9351': 'Dylan Cassidy' }, JOBS), [])
})

test('the payload targets Main Sheet column C', () => {
  assert.equal(OWNER_COL, 2)
  assert.deepEqual(ownerEditsPayload(planOwnerEdits({ '9351': 'Tom Price' }, JOBS)), [
    { jobNumber: '9351', col: 2, value: 'Tom Price' },
  ])
})

test('the three names are the ones agreed', () => {
  assert.deepEqual(JOB_OWNERS, ['Cameron Skilton', 'Charles Roselier', 'Tom Price'])
})
