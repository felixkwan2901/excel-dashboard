// The category list and the checklist mapping it implies. Constants only —
// jobCategories.js is import-free so plain node can load it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { JOB_CATEGORIES, CATEGORIES_KEY, CATEGORY_SITE_TYPE } from '../../src/lib/jobCategories.js'

test('every category Cassidy-Davies asked for is there', () => {
  for (const wanted of [
    'Warranty', 'Sundry', 'Design', 'Lighter', 'Rest Homes', 'Smart Vent', 'E4M',
    'Contract Labour', 'Residential Renovation', 'Residential Service',
    'Commercial New Build', 'Commercial Renovation', 'Commercial Service', 'Solar',
  ]) {
    assert.ok(JOB_CATEGORIES.includes(wanted), `missing: ${wanted}`)
  }
  assert.equal(JOB_CATEGORIES.length, 14)
})

// Two spellings of one category are two categories to every filter and count,
// and nobody notices until a total is wrong.
test('no duplicates, and none differing only by case or spacing', () => {
  const seen = new Set(JOB_CATEGORIES.map((c) => c.toLowerCase().replace(/\s+/g, ' ').trim()))
  assert.equal(seen.size, JOB_CATEGORIES.length)
})

test('none has stray whitespace, which would not match what is stored', () => {
  for (const c of JOB_CATEGORIES) assert.equal(c, c.trim())
})

// The key has to match the Workers' allowlists exactly or every save is a 400.
test('the storage key is the one the Workers allow', () => {
  assert.equal(CATEGORIES_KEY, 'planning:job-categories')
})

test('every mapped category is a real category', () => {
  for (const category of Object.keys(CATEGORY_SITE_TYPE)) {
    assert.ok(JOB_CATEGORIES.includes(category), `${category} is not in the list`)
  }
})

test('the mapping only ever says commercial or residential', () => {
  for (const type of Object.values(CATEGORY_SITE_TYPE)) {
    assert.ok(type === 'commercial' || type === 'residential', `bad type: ${type}`)
  }
})

// A warranty call or a design job is not a new build with a twenty-step
// rough-in checklist. Mapping those would put the wrong tasks in front of
// somebody, so they are deliberately absent.
test('categories that are not a site build map to nothing', () => {
  for (const category of ['Warranty', 'Sundry', 'Design', 'Contract Labour', 'Solar']) {
    assert.equal(CATEGORY_SITE_TYPE[category], undefined, `${category} should not imply a checklist`)
  }
})
