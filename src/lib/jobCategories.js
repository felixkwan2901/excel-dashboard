// What kind of work a job is — the list and where the answer is stored.
//
// Constants only, and deliberately free of imports: scripts/__tests__ runs
// under plain node, which cannot resolve this project's extensionless Vite
// imports. The reading and writing lives in jobCategoryStore.js.

// A fixed list rather than free text, for the same reason the owner list is
// fixed: "Commercial service" and "commercial services" are two categories to
// every filter and count in the app, and nobody notices until a total is
// wrong.
//
// In the order Cassidy-Davies gave them, not alphabetical — the order is
// theirs and reads as a grouping they already think in.
export const JOB_CATEGORIES = [
  'Warranty',
  'Sundry',
  'Design',
  'Lighter',
  'Rest Homes',
  'Smart Vent',
  'E4M',
  'Contract Labour',
  'Residential Renovation',
  'Residential Service',
  'Commercial New Build',
  'Commercial Renovation',
  'Commercial Service',
  'Solar',
]

// Nothing in the workbook records this, so KV is the only home for it — there
// is no column to fall back to, unlike the owner.
//
// This exact string has to be in the Worker's APP_DATA_KEY_RE allowlist
// (upload-worker/src/index.js AND site-worker/index.js) or every save is
// rejected with a 400.
export const CATEGORIES_KEY = 'planning:job-categories'

// Which field-app checklist a category implies. The field app needs
// commercial or residential and the workbook says neither, so this is the one
// place that mapping is written down.
//
// Only the categories that genuinely are one or the other appear here. A
// warranty call or a design job is not a new build with a twenty-step
// rough-in checklist, and guessing one for it would put the wrong tasks in
// front of somebody — so those map to nothing and the field app keeps saying
// "not broken down yet", which is true.
export const CATEGORY_SITE_TYPE = {
  'Residential Renovation': 'residential',
  'Residential Service': 'residential',
  'Commercial New Build': 'commercial',
  'Commercial Renovation': 'commercial',
  'Commercial Service': 'commercial',
  'Rest Homes': 'commercial',
}
