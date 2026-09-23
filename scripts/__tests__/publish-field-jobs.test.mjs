// publish-field-jobs.mjs itself is not imported here — it runs wrangler and
// the network at module load, which plain node has no business doing in a
// test. What is pinned instead is the one line in it a future edit could
// break silently: which fields of `site` survive a re-publish.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(new URL('../publish-field-jobs.mjs', import.meta.url), 'utf8')

// lat/lng are written by geocode-field-jobs.mjs, not by this script — but
// this script still has to carry them through on every weekly run, or the
// map's pins vanish the next time anyone edits the workbook. Dropping
// 'lat'/'lng' from this list would not error, would not fail a lint, and
// would not show up until the next publish quietly emptied the Map tab.
test('the weekly publish keeps the coordinates a previous run set', () => {
  const match = SOURCE.match(/pick\(before\?\.site,\s*\[([^\]]+)\]\)/)
  assert.ok(match, 'could not find the site-fields pick() call in publish-field-jobs.mjs')
  const kept = match[1]
  assert.ok(kept.includes("'lat'"), 'lat is no longer carried through — map pins would be wiped weekly')
  assert.ok(kept.includes("'lng'"), 'lng is no longer carried through — map pins would be wiped weekly')
  assert.ok(kept.includes("'address'"), 'address is no longer carried through')
})
