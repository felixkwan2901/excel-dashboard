import test from 'node:test'
import assert from 'node:assert/strict'
import { JOB_OWNERS, OWNERS_KEY } from '../../src/lib/jobOwners.js'

test('the owners are the three agreed names, in full', () => {
  assert.deepEqual(JOB_OWNERS, ['Cameron Skilton', 'Charles Roselier', 'Tom Price'])
  for (const name of JOB_OWNERS) assert.match(name, /\S+\s+\S+/, `${name} should be a full name`)
})

// The Worker rejects any key outside its allowlist with a 400, and this one
// had to be added to it by hand (upload-worker/src/index.js). A change here
// without the matching change there makes every owner save fail silently
// from the dropdown's point of view.
test('the storage key is one the Worker allows', () => {
  const APP_DATA_KEY_RE =
    /^(weekly|completion|jobCreated|field):[A-Za-z0-9]{1,20}$|^override:(main-sheet|claim-calculator|upcoming-work)$|^planning:(staff-roster|servicing|working-days|staff-on-tools|avg-hourly-rate|job-owners)$|^fieldTasks:(commercial|residential)$/
  assert.equal(OWNERS_KEY, 'planning:job-owners')
  assert.ok(APP_DATA_KEY_RE.test(OWNERS_KEY), `${OWNERS_KEY} must match the Worker's allowlist`)
})
