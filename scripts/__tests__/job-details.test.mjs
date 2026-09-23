// The typed-in site details, and the mapping that turns a row of dashboard
// columns into the shape the field app's job screen already reads.
// Constants and pure functions only — jobDetails.js is import-free so plain
// node can load it.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  JOB_DETAILS_KEY,
  JOB_DETAIL_FIELDS,
  JOB_DETAIL_KEYS,
  splitHazards,
  toFieldJob,
} from '../../src/lib/jobDetails.js'

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

test('nothing typed produces nothing at all, not a row of empty fields', () => {
  assert.deepEqual(toFieldJob(undefined), {})
  assert.deepEqual(toFieldJob({}), {})
  assert.deepEqual(toFieldJob({ contactName: '   ', hazards: '' }), {})
})

test('a contact becomes the list shape the field screen iterates', () => {
  const out = toFieldJob({
    contactName: 'Dave Harper',
    contactRole: 'Site foreman',
    contactPhone: '027 555 0101',
    contactEmail: 'dave@example.co.nz',
  })
  assert.deepEqual(out.contacts, [
    { role: 'Site foreman', name: 'Dave Harper', phone: '027 555 0101', email: 'dave@example.co.nz' },
  ])
})

// The field screen labels the row "<role> · <name>", so a blank role renders
// as a leading separator and reads as a rendering fault.
test('a contact with no role still gets one', () => {
  const out = toFieldJob({ contactName: 'Dave', contactPhone: '027 555 0101' })
  assert.equal(out.contacts[0].role, 'Site contact')
})

// Somebody will type a name and a number and no email, and that has to work.
test('a contact with only an email is still a contact', () => {
  const out = toFieldJob({ contactEmail: 'dave@example.co.nz' })
  assert.equal(out.contacts.length, 1)
  assert.equal(out.contacts[0].phone, '')
  assert.equal(out.contacts[0].email, 'dave@example.co.nz')
})

test('the email key is absent rather than blank when nobody typed one', () => {
  const out = toFieldJob({ contactName: 'Dave', contactPhone: '027 555 0101' })
  assert.ok(!('email' in out.contacts[0]))
})

test('hazards split on semicolons and new lines, one per row on site', () => {
  assert.deepEqual(splitHazards('Live switchboard; asbestos in ceiling'), [
    'Live switchboard',
    'asbestos in ceiling',
  ])
  assert.deepEqual(splitHazards('Live board\nOpen trench\n'), ['Live board', 'Open trench'])
  assert.deepEqual(splitHazards(';;  ;'), [])
})

// "Live switchboard, isolated Tuesday" is one hazard. Splitting it would show
// a crew the words "isolated Tuesday" with no subject.
test('a comma does not split a hazard', () => {
  assert.deepEqual(splitHazards('Live switchboard, isolated Tuesday'), [
    'Live switchboard, isolated Tuesday',
  ])
})

test('site fields land under site, where the Getting in screen reads them', () => {
  const out = toFieldJob({ gateCode: 'Keybox 4821', parking: 'Rear yard', hours: '7am - 4pm' })
  assert.deepEqual(out.site, { gateCode: 'Keybox 4821', parking: 'Rear yard', hours: '7am - 4pm' })
})

// The address is imported from the Jobs export, not typed here — this mapping
// must never emit one, or a publish would overwrite the real address with
// nothing.
test('the mapping never touches the address', () => {
  const out = toFieldJob({ gateCode: 'Keybox 4821', parking: 'Rear yard' })
  assert.ok(!('address' in out.site))
})

test('induction is kept as the sentence somebody typed', () => {
  const out = toFieldJob({ induction: 'Site office, ask for Dave' })
  assert.equal(out.inductionRequired, 'Site office, ask for Dave')
})

test('the work fields use the names the field screen already reads', () => {
  const out = toFieldJob({ switchboard: 'Plant room, level 1', supply: '3 phase, 100A' })
  assert.equal(out.switchboardLocation, 'Plant room, level 1')
  assert.equal(out.supply, '3 phase, 100A')
})

// Every key this emits has to be one buildJob in cde-field passes through,
// otherwise it is written to KV, published, and silently dropped on arrival.
test('every key it emits is one the field app carries', () => {
  const CARRIED = new Set([
    'site', 'dates', 'contacts', 'hazards', 'notes', 'visits', 'history',
    'scope', 'supply', 'switchboardLocation', 'inductionRequired',
  ])
  const out = toFieldJob(Object.fromEntries(JOB_DETAIL_KEYS.map((k) => [k, 'x'])))
  for (const key of Object.keys(out)) assert.ok(CARRIED.has(key), `field app drops: ${key}`)
})
