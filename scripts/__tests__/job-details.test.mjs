// The typed-in site details: the field list, and the key names the field app
// reads them back by.
//
// The mapping into the field app's shape is NOT tested here any more — it
// lives in cde-field, which reads this blob live. What is tested here is the
// half of the contract this repo owns: the key names. cde-field has the
// matching test against the same names, so a rename on either side fails a
// test rather than quietly emptying a screen.
import test from 'node:test'
import assert from 'node:assert/strict'
import { JOB_DETAILS_KEY, JOB_DETAIL_FIELDS, JOB_DETAIL_KEYS } from '../../src/lib/jobDetails.js'

// A key the Worker's allowlist does not match is rejected with a 400, and the
// only symptom is that nothing ever saves.
test('the storage key is one the Workers accept', () => {
  const ALLOWLIST =
    /^(weekly|completion|jobCreated|field):[A-Za-z0-9]{1,20}$|^override:(main-sheet|claim-calculator|upcoming-work)$|^planning:(staff-roster|servicing|working-days|staff-on-tools|avg-hourly-rate|job-owners|job-categories|job-details|job-checklist|claim-fields|upcoming-work)$|^fieldTasks:(commercial|residential)$/
  assert.ok(ALLOWLIST.test(JOB_DETAILS_KEY))
})

test('every field has a key, a label and a group, and no key repeats', () => {
  for (const f of JOB_DETAIL_FIELDS) {
    assert.ok(f.key && f.label && f.group, `incomplete field: ${JSON.stringify(f)}`)
  }
  assert.equal(new Set(JOB_DETAIL_KEYS).size, JOB_DETAIL_KEYS.length)
})

// The column picker groups by this, and a typo makes a column vanish from the
// panel entirely rather than showing up misfiled.
test('every group is one the column picker lists', () => {
  const ORDER = ['Job', 'Claim', 'Cost', 'Material', 'Labour', 'Margin', 'Progress', 'Contact', 'Safety', 'Site', 'Work']
  for (const f of JOB_DETAIL_FIELDS) assert.ok(ORDER.includes(f.group), `unlisted group: ${f.group}`)
})

// THE CONTRACT WITH THE FIELD APP. It reads this blob directly and maps these
// exact keys onto its job screen. Renaming one here without renaming it there
// does not break a build — it empties a screen silently — so the names are
// pinned. Changing this list means changing cde-field/src/lib/jobDetails.js
// and its matching test in the same breath.
test('the field app reads these exact key names', () => {
  assert.deepEqual(
    [...JOB_DETAIL_KEYS].sort(),
    [
      'contactEmail', 'contactName', 'contactPhone', 'contactRole',
      'gateCode', 'hazards', 'hours', 'induction', 'parking', 'supply', 'switchboard',
    ],
  )
})
