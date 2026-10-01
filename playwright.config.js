import { defineConfig, devices } from '@playwright/test'

// Screenshot tests: every page, dark and light, laptop and phone, against
// stored baselines — so a sticky column, a header or a table width can't
// slip without the diff showing up. See tests/screenshots/README.md.
const PORT = 4173
const BASE = '/excel-dashboard/'

export default defineConfig({
  testDir: 'tests/screenshots',
  outputDir: 'test-results',
  // Fonts render differently on macOS and Linux, so each platform keeps its
  // own baselines: darwin/ from a Mac, linux/ written by the CI workflow.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      // Font hinting differs slightly run to run; a layout slip is far bigger.
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'retain-on-failure',
    // Freeze the clock so "last updated 1 hour ago", the top-strip time and
    // "this month" are the same every run.
    timezoneId: 'Pacific/Auckland',
    locale: 'en-NZ',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'laptop-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
    { name: 'laptop-light', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'light' } },
    // A Chromium phone (Pixel 7, 412×915) — the iPhone profiles need WebKit.
    { name: 'phone-dark', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
    { name: 'phone-light', use: { ...devices['Pixel 7'], colorScheme: 'light' } },
  ],
})
