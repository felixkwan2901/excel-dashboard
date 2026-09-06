import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidJobBlock } from '../lib/job-blocks.mjs'

// This predicate gates the entire pipeline: a block it rejects gets no weekly
// figures, no monthly hours entry, and is invisible when a new job is
// appended. The failure is silent, which is why it's worth pinning down.

test('accepts a normal job', () => {
  assert.equal(isValidJobBlock({ jobNumber: 6792, jobName: 'Major Hornbrook' }), true)
})

test('accepts a job number given as a string', () => {
  assert.equal(isValidJobBlock({ jobNumber: '6792', jobName: 'Major Hornbrook' }), true)
})

test('accepts a name with surrounding whitespace', () => {
  // Real exports carry trailing spaces — "Major Hornbrook " is in the live data.
  assert.equal(isValidJobBlock({ jobNumber: 6792, jobName: 'Major Hornbrook ' }), true)
})

test('rejects a blank name', () => {
  // The case behind "why did this job never update?" — a job created without
  // a name is skipped by every script in the pipeline.
  assert.equal(isValidJobBlock({ jobNumber: 6792, jobName: '' }), false)
  assert.equal(isValidJobBlock({ jobNumber: 6792, jobName: '   ' }), false)
  assert.equal(isValidJobBlock({ jobNumber: 6792 }), false)
  assert.equal(isValidJobBlock({ jobNumber: 6792, jobName: null }), false)
})

test("rejects the literal '0' name that empty cells parse to", () => {
  assert.equal(isValidJobBlock({ jobNumber: 6792, jobName: '0' }), false)
  assert.equal(isValidJobBlock({ jobNumber: 6792, jobName: 0 }), false)
})

test('rejects a missing, zero or negative job number', () => {
  assert.equal(isValidJobBlock({ jobName: 'No number' }), false)
  assert.equal(isValidJobBlock({ jobNumber: 0, jobName: 'Zero' }), false)
  assert.equal(isValidJobBlock({ jobNumber: -1, jobName: 'Negative' }), false)
  assert.equal(isValidJobBlock({ jobNumber: 'abc', jobName: 'Not a number' }), false)
})

test('rejects nothing at all without throwing', () => {
  assert.equal(isValidJobBlock(undefined), false)
  assert.equal(isValidJobBlock(null), false)
  assert.equal(isValidJobBlock({}), false)
})
