import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// checklistStore.js and onboardingChecklist.js both reach the Vite-only
// module graph, so this reads the sources rather than importing them: the
// test runner is plain node and cannot resolve extensionless imports.
const checklist = readFileSync('src/lib/onboardingChecklist.js', 'utf8')
const store = readFileSync('src/lib/checklistStore.js', 'utf8')
const worker = readFileSync('upload-worker/src/index.js', 'utf8')

const ids = [...checklist.matchAll(/\{ id: '([^']+)'/g)].map((m) => m[1])

test('every checklist item has an id, and no two share one', () => {
  assert.equal(ids.length, 19, 'the paper form has nineteen items')
  assert.equal(new Set(ids).size, 19, 'ids must be unique — a duplicate silently merges two questions')
})

// Ids are the storage key. Renaming one orphans every tick already recorded
// against it, and reusing one attaches old answers to a new question. Both
// are invisible on screen, so they are pinned here.
test('the ids are the ones already stored against real ticks', () => {
  assert.deepEqual(ids, [
    'handover-from-estimating', 'ps1-ps3-required', 'accept-in-katipult', 'load-retentions',
    'load-po-number', 'load-contact-details', 'add-to-procore', 'create-whatsapp-group',
    'load-contract-programme', 'check-drawing-revision', 'confirm-icp-lodged', 'sssp-paperwork',
    'organise-handover-meeting', 'confirm-progress-claims', 'order-long-lead-materials',
    'send-subcontractor-po', 'om-manual-started', 'weekly-check-sheet', 'job-completion-checklist',
  ])
})

test('the linked items are still the last two', () => {
  assert.equal(ids[17], 'weekly-check-sheet')
  assert.equal(ids[18], 'job-completion-checklist')
})

// The Worker rejects any key outside its allowlist with a 400, and that list
// is deployed by hand. Drift makes every tick fail in a way the checkbox
// cannot tell apart from a network problem.
test('the storage key is one the deployed Worker allows', () => {
  const key = store.match(/CHECKLIST_KEY = '([^']+)'/)[1]
  assert.equal(key, 'planning:job-checklist')
  const re = eval(worker.match(/const APP_DATA_KEY_RE =\s*(\/.+\/)/)[1])
  assert.ok(re.test(key), `${key} must match the Worker's allowlist`)
  assert.ok(!re.test('planning:not-a-real-key'), 'the allowlist must still reject unknown keys')
})

test('a tick is not written to the workbook any more', () => {
  const tab = readFileSync('src/components/MainSheetTab.jsx', 'utf8')
  assert.ok(tab.includes('saveChecklistItem('), 'ticks should go to the checklist store')
  assert.ok(
    !/saveEdit\('main-sheet'/.test(tab),
    'no checklist tick should still stage an Excel edit',
  )
})

import { setJobField } from '../../src/lib/jobFieldMerge.js'

// The workbook is still the fallback for anything not in this blob. Deleting
// an unticked item therefore hands it back to the spreadsheet, and for the
// 187 ticks already recorded there an untick undoes itself on the next
// reload. Confirmed against job 9259 before this was fixed.
test('an untick is stored, not deleted', () => {
  const after = setJobField({}, '9259', 'create-whatsapp-group', '')
  assert.deepEqual(after, { '9259': { 'create-whatsapp-group': '' } })
  assert.ok('create-whatsapp-group' in after['9259'], 'the key must survive an untick')
})

test('ticking and unticking round-trips without touching other items', () => {
  let s = setJobField({}, '9259', 'sssp-paperwork', 'Yes')
  s = setJobField(s, '9259', 'create-whatsapp-group', 'Yes')
  s = setJobField(s, '9259', 'create-whatsapp-group', '')
  assert.deepEqual(s['9259'], { 'sssp-paperwork': 'Yes', 'create-whatsapp-group': '' })
})

test('other jobs are left alone', () => {
  const s = setJobField({ '8824': { 'sssp-paperwork': 'Yes' } }, '9259', 'sssp-paperwork', 'Yes')
  assert.deepEqual(s['8824'], { 'sssp-paperwork': 'Yes' })
})

test('a job number is keyed as a string either way', () => {
  assert.deepEqual(setJobField({}, 9259, 'sssp-paperwork', 'Yes'), { '9259': { 'sssp-paperwork': 'Yes' } })
})

test('a legacy N/A is kept as-is, not coerced to a tick', () => {
  assert.equal(setJobField({}, '1', 'sssp-paperwork', 'N/A')['1']['sssp-paperwork'], 'N/A')
})

// ---- Monthly Claims hand-typed figures ----

const claimStore = readFileSync('src/lib/claimFieldsStore.js', 'utf8')

test('the claim-fields key is one the deployed Worker allows', () => {
  const key = claimStore.match(/CLAIM_FIELDS_KEY = '([^']+)'/)[1]
  assert.equal(key, 'planning:claim-fields')
  const re = eval(worker.match(/const APP_DATA_KEY_RE =\s*(\/.+\/)/)[1])
  assert.ok(re.test(key), `${key} must match the Worker's allowlist`)
})

// The page reads these back by name, and loadWorkbook decides which to coerce
// to a number by the same names. A rename in one place and not the other puts
// a string where a figure is expected, or silently drops the value.
test('the claim field names match what the page and the loader use', () => {
  const names = claimStore.match(/CLAIM_FIELDS = \[([^\]]+)\]/)[1]
  for (const f of ['retention', 'hoursToCompleteBeforeEom', 'costsToComeBeforeEom', 'notes']) {
    assert.ok(names.includes(`'${f}'`), `${f} must be a stored claim field`)
  }
  const claims = readFileSync('src/components/MonthlyClaims.jsx', 'utf8')
  for (const f of ['retention', 'hoursToCompleteBeforeEom', 'costsToComeBeforeEom', 'notes']) {
    assert.ok(claims.includes(`key: '${f}'`), `${f} must still be the page's field key`)
  }
})

test('the notes field is not coerced to a number', () => {
  const numeric = claimStore.match(/NUMERIC_CLAIM_FIELDS = new Set\(\[([^\]]+)\]\)/)[1]
  assert.ok(!numeric.includes("'notes'"), 'a note is text; Number() would turn it into 0')
  assert.ok(numeric.includes("'retention'"))
})

test('the Monthly Claims page no longer writes to the workbook', () => {
  const claims = readFileSync('src/components/MonthlyClaims.jsx', 'utf8')
  assert.ok(claims.includes('saveClaimField('))
  assert.ok(!/await saveEdit\(/.test(claims), 'no claim figure should still stage an Excel edit')
})

// ---- Upcoming Work planned hours ----

const upcomingStore = readFileSync('src/lib/upcomingWorkStore.js', 'utf8')

test('the upcoming-work key is one the deployed Worker allows', () => {
  const key = upcomingStore.match(/UPCOMING_WORK_KEY = '([^']+)'/)[1]
  assert.equal(key, 'planning:upcoming-work')
  const re = eval(worker.match(/const APP_DATA_KEY_RE =\s*(\/.+\/)/)[1])
  assert.ok(re.test(key), `${key} must match the Worker's allowlist`)
})

// The page passes the month name straight through as the field id, and
// loadWorkbook writes it back into job.months by the same name. A mismatch
// puts planned hours into a month nobody looks at.
test('the month keys are the ones the page and the loader use', () => {
  const keys = upcomingStore.match(/MONTH_KEYS = \[([^\]]+)\]/)[1]
  for (const m of ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']) {
    assert.ok(keys.includes(`'${m}'`), `${m} must be a stored month`)
  }
  const tab = readFileSync('src/components/UpcomingWorkTab.jsx', 'utf8')
  for (const m of ['Jan', 'Dec']) assert.ok(tab.includes(`key: '${m}'`), `${m} must still be the page's key`)
})

// ---- the whole point of the exercise ----

test('nothing on the site writes to the workbook any more', () => {
  const dir = 'src/components'
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsx'))
  const offenders = files.filter((f) => /await saveEdit\(/.test(readFileSync(`${dir}/${f}`, 'utf8')))
  assert.deepEqual(
    offenders,
    [],
    `these still stage an Excel edit: ${offenders.join(', ')} — every hand-typed field should go to KV`,
  )
})
