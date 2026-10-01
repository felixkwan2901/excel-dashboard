import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFieldJobs, jobTaskRows, summariseFieldRecord } from '../../src/lib/fieldSync.js'

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
  assert.equal(next[0].category, 'Commercial New Build', 'the Today screen groups by this')
  assert.equal(next[1].category, undefined, 'no type of work set, so no category on the entry')
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
  assert.equal(r.percent, 25, 'N/A tasks are left out of the average (no catalogue given: only recorded tasks count)')
  assert.deepEqual(r.onSite, ['Kyle'], 'only whoever last arrived and has not left')
  assert.equal(r.stale, true, 'nothing changed for ten days')
  assert.equal(summariseFieldRecord(null), null)
  // With the phone's checklist in hand, untouched tasks count as 0 — one task
  // at 25% out of twenty-one is 1%, as the phone's ring says.
  const catalogue = Array.from({ length: 21 }, (_, i) => ({ id: `t${i}`, label: `Task ${i}` }))
  const one = summariseFieldRecord({ tasks: { t0: { pct: 25 } } }, catalogue)
  assert.equal(one.percent, 1)
  assert.equal(one.total, 21)
  // Archived catalogue tasks are skipped; office extras and on-site extras are included once.
  const rows = jobTaskRows({ tasks: { t0: { pct: 50 }, gone: { pct: 100 } }, extraTasks: [{ id: 'x1' }] },
    [{ id: 't0' }, { id: 'old', archived: true }], { extra: [{ id: 'x1' }, { id: 'x2' }] })
  assert.deepEqual(rows.map((r) => r.id), ['t0', 'x1', 'x2', 'gone'])
  assert.equal(summariseFieldRecord({ tasks: {} }).state, 'no-data')
})
