import { test } from 'node:test'
import assert from 'node:assert/strict'
import { explainFailure, explainProblem, explainSkip } from '../../src/lib/uploadWords.js'

test('manifest count mismatch is explained with the fix', () => {
  const e = explainProblem('22 ProfitAndLoss file(s) but the manifest lists 0 — move any older Katipolt downloads out of the folder')
  assert.match(e.what, /lists 0 Profit & Loss files, but 22 were selected/)
  assert.match(e.fix, /Leave manifest\.csv out/)
})

test('wrong download order names the row, the file and the real job', () => {
  const e = explainProblem('#3 job 9814: ProfitAndLoss-2026-10-01-08_22.xlsx is for job 9570')
  assert.match(e.what, /row 3 says job 9814, but ProfitAndLoss-2026-10-01-08_22\.xlsx is job 9570's export/)
})

test('a charge-up file with no job is a warning that asks for the Summary report', () => {
  const e = explainSkip({ job: 'Charge-up', file: 'ProfitAndLoss-1.xlsx', reason: 'ProfitAndLoss-1.xlsx: profit $177.87, 2 sold h (Ethan van Tuinen, Sean Baines) — put its job number in manifest.csv and upload again' })
  assert.equal(e.kind, 'warn')
  assert.match(e.what, /couldn't be matched to a job \(profit \$177\.87, 2 sold h by Ethan van Tuinen, Sean Baines\)/)
  assert.match(e.fix, /Profit & Loss Summary report/)
})

test('no timesheet is information, not a warning', () => {
  const e = explainSkip({ job: '9814', file: 'Q-9814-pl.xlsx', reason: 'loaded, but no timesheet export — used the Budgeted labour total instead' })
  assert.equal(e.kind, 'info')
  assert.match(e.what, /Job 9814 loaded without a Timesheets export/)
})

test('a workflow failure message becomes a headline and items', () => {
  const e = explainFailure('The files and manifest.csv do not line up, so nothing was loaded: 3 Timesheets file(s) but the manifest lists 19')
  assert.match(e.headline, /manifest\.csv doesn’t match/)
  assert.equal(e.items.length, 1)
  const p = explainFailure('Processing failed: Found no worker hours on the Timesheet export.')
  assert.match(p.items[0].what, /Timesheets export has no hours/)
})
