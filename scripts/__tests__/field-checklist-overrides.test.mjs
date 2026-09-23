// Per-job checklist customization: the key and the shape helper. Constants
// only — fieldChecklistOverrides.js is import-free so plain node can load it.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FIELD_CHECKLIST_OVERRIDES_KEY,
  EMPTY_JOB_OVERRIDES,
  isEmptyOverrides,
} from '../../src/lib/fieldChecklistOverrides.js'

// A key the Worker's allowlist does not match is rejected with a 400, and the
// only symptom is that nothing ever saves.
test('the storage key is one the Workers accept', () => {
  const ALLOWLIST =
    /^(weekly|completion|jobCreated|field):[A-Za-z0-9]{1,20}$|^override:(main-sheet|claim-calculator|upcoming-work)$|^planning:(staff-roster|servicing|working-days|staff-on-tools|avg-hourly-rate|job-owners|job-categories|job-details|job-checklist|field-checklist-overrides|claim-fields|upcoming-work)$|^fieldTasks:(commercial|residential)$/
  assert.ok(ALLOWLIST.test(FIELD_CHECKLIST_OVERRIDES_KEY))
})

test('the field app reads this exact key name', () => {
  const READABLE_ON_FIELD_APP =
    /^field:[A-Za-z0-9]{1,20}$|^fieldTasks:(commercial|residential)$|^planning:(staff-roster|field-jobs|job-details|field-admins|field-checklist-overrides)$/
  assert.ok(READABLE_ON_FIELD_APP.test(FIELD_CHECKLIST_OVERRIDES_KEY))
})

test('nothing customized reads as empty', () => {
  assert.equal(isEmptyOverrides(undefined), true)
  assert.equal(isEmptyOverrides(null), true)
  assert.equal(isEmptyOverrides(EMPTY_JOB_OVERRIDES), true)
  assert.equal(isEmptyOverrides({ overrides: {}, extra: [] }), true)
})

test('one overridden task label is not empty', () => {
  assert.equal(isEmptyOverrides({ overrides: { 'task-1': 'Reworded' }, extra: [] }), false)
})

test('one extra task is not empty, even with no overrides', () => {
  assert.equal(
    isEmptyOverrides({ overrides: {}, extra: [{ id: 'office-1', label: 'Extra step' }] }),
    false,
  )
})
