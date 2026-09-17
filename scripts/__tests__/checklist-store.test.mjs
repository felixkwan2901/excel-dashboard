import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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

import { nextChecklist } from '../../src/lib/checklistMerge.js'

// The workbook is still the fallback for anything not in this blob. Deleting
// an unticked item therefore hands it back to the spreadsheet, and for the
// 187 ticks already recorded there an untick undoes itself on the next
// reload. Confirmed against job 9259 before this was fixed.
test('an untick is stored, not deleted', () => {
  const after = nextChecklist({}, '9259', 'create-whatsapp-group', '')
  assert.deepEqual(after, { '9259': { 'create-whatsapp-group': '' } })
  assert.ok('create-whatsapp-group' in after['9259'], 'the key must survive an untick')
})

test('ticking and unticking round-trips without touching other items', () => {
  let s = nextChecklist({}, '9259', 'sssp-paperwork', 'Yes')
  s = nextChecklist(s, '9259', 'create-whatsapp-group', 'Yes')
  s = nextChecklist(s, '9259', 'create-whatsapp-group', '')
  assert.deepEqual(s['9259'], { 'sssp-paperwork': 'Yes', 'create-whatsapp-group': '' })
})

test('other jobs are left alone', () => {
  const s = nextChecklist({ '8824': { 'sssp-paperwork': 'Yes' } }, '9259', 'sssp-paperwork', 'Yes')
  assert.deepEqual(s['8824'], { 'sssp-paperwork': 'Yes' })
})

test('a job number is keyed as a string either way', () => {
  assert.deepEqual(nextChecklist({}, 9259, 'sssp-paperwork', 'Yes'), { '9259': { 'sssp-paperwork': 'Yes' } })
})

test('a legacy N/A is kept as-is, not coerced to a tick', () => {
  assert.equal(nextChecklist({}, '1', 'sssp-paperwork', 'N/A')['1']['sssp-paperwork'], 'N/A')
})
