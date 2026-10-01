import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// One screenshot per page. The data is a frozen copy (fixtures/), the
// clock is pinned, the worker and weather are mocked — so a diff means the
// code changed how something looks, not that a week went by.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const FROZEN_NOW = new Date('2026-10-01T12:00:00+13:00')
const DATA_FILES = ['Cassidy_Davies_Electrical_BPMN_Data.xlsx', 'archived-jobs.json', 'completed-jobs.json', 'monthly-claims-log.json', 'monthly-hours-log.json', 'sync-meta.json', 'geocode-cache.json']

// A job that exists in the fixture workbook, for the project page.
const SAMPLE_JOB = JSON.parse(readFileSync(join(FIXTURES, 'monthly-claims-log.json'), 'utf8')).jobs?.[0]?.jobNumber ?? '8142'

const PAGES = [
  { name: 'overview', url: '' },
  { name: 'project', url: `?v=project&j=${SAMPLE_JOB}` },
  { name: 'job-checklist', url: '?v=main-sheet' },
  { name: 'monthly-claims', url: '?v=monthly-claims' },
  { name: 'upcoming-work', url: '?v=upcoming-work' },
  { name: 'completed-jobs', url: '?v=completed-jobs' },
  { name: 'completed-insights', url: '?v=completed-insights' },
  { name: 'month-report', url: '?v=month-report' },
  { name: 'month-end', url: '?v=month-end' },
  { name: 'charts', url: '?v=charts' },
  { name: 'update-data', url: '?v=update' },
]

test.beforeEach(async ({ page, colorScheme }) => {
  await page.clock.setFixedTime(FROZEN_NOW)
  // Frozen data files instead of whatever public/ holds this week.
  for (const f of DATA_FILES) {
    await page.route(`**/${f}`, (route) => route.fulfill({
      body: readFileSync(join(FIXTURES, f)),
      contentType: f.endsWith('.json') ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }))
  }
  // The upload worker: not signed in, and every KV key empty.
  await page.route('**/whoami', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }))
  await page.route('**/app-data**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: null }) }))
  // No live weather.
  await page.route('https://api.open-meteo.com/**', (route) => route.abort())
  // Theme comes from the URL on this app; the project's colorScheme picks it.
  page.__theme = colorScheme
})

for (const p of PAGES) {
  test(p.name, async ({ page }) => {
    const sep = p.url.includes('?') ? '&' : '?'
    await page.goto(`${p.url}${sep}theme=${page.__theme}`)
    await page.waitForLoadState('networkidle')
    // The page is up once the data has loaded (the load shows a status line
    // first) and something has rendered in main.
    await expect(page.locator('main')).not.toContainText(/loading/i, { timeout: 30_000 })
    await expect(page.locator('main')).not.toBeEmpty()
    await page.waitForTimeout(500) // Reveal transitions settle
    await expect(page).toHaveScreenshot(`${p.name}.png`, {
      fullPage: true,
      mask: [page.locator('[data-screenshot="mask"]')],
    })
  })
}
