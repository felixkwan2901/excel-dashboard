import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFieldJobs, summariseFieldRecord } from '../../src/lib/fieldSync.js'

test('the field job list keeps what a phone already knows and drops archived jobs', () => {
  const existing = [
    { jobNumber: '8142', jobName: 'Old name', type: 'residential', address: '1 Road St', mapQuery: '1 Road St' },
    { jobNumber: '9999', jobName: 'Archived one', type: 'commercial' },
  ]
  const jobs = [
    { jobNumber: '8142', jobName: 'Fisher Developments', jobCategory: 'Commercial New Build' },
    { jobNumber: '8824', jobName: '3 Innovation Road', jobCategory: '' },
    { jobNumber: '9999', jobName: 'Archived one', jobCategory: 'Residential Service' },
  ]
  const next = buildFieldJobs(existing, jobs, new Set(['9999']))
  assert.deepEqual(next.map((j) => j.jobNumber), ['8142', '8824'])
  assert.equal(next[0].type, 'commercial', 'the type follows the type of work')
  assert.equal(next[0].address, '1 Road St', 'the address a phone already had is kept')
  assert.equal(next[0].jobName, 'Fisher Developments', 'the name follows the workbook')
  assert.equal(next[1].type, undefined, 'no type of work, no checklist type')
})

test('a field record becomes a percentage, who is on site, and whether it is stale', () => {
  const fresh = new Date().toISOString()
  const old = new Date(Date.now() - 10 * 86400000).toISOString()
  const r = summariseFieldRecord({
    tasks: { 'rough-in': { pct: 50 }, 'fit-off': { pct: 0 }, 'test': { na: true, pct: 0 } },
    visits: [{ by: 'Doug', action: 'arrived', at: old }, { by: 'Doug', action: 'left', at: fresh }, { by: 'Kyle', action: 'arrived', at: fresh }],
    log: [{ t: 'rough-in', at: old }],
  })
  assert.equal(r.percent, 25, 'N/A tasks are left out of the average')
  assert.deepEqual(r.onSite, ['Kyle'], 'only whoever last arrived and has not left')
  assert.equal(r.stale, true, 'nothing changed for ten days')
  assert.equal(summariseFieldRecord(null), null)
  assert.equal(summariseFieldRecord({ tasks: {} }).state, 'no-data')
})
