// Syncs the SPA's in-memory navigation state to the URL query string via
// the History API (no router dependency). Forward navigation (opening a
// job) pushes a new entry; refining the current view (a filter tab, a
// search term) replaces the current entry in place, so pressing back later
// lands on the current-view entry with its latest filter state intact
// rather than stepping through every tab click.
const DEFAULTS = {
  view: 'dashboard',
  selectedJobId: null,
  dashboardQuery: '',
  dashboardFilter: 'all',
}

// Every view App.jsx can render. A `v=` it doesn't recognise falls back to
// the default rather than rendering an empty page — which is what a
// bookmark or a shared link to a view that has since been removed would
// otherwise do (the "Hours by month" tab was one; its figures now live in
// the Monthly claims table and the Tableau export).
const KNOWN_VIEWS = new Set([
  'dashboard',
  'project',
  'review',
  'update',
  'monthly-claims',
  'main-sheet',
  'upcoming-work',
  'charts',
  'weekly-check-sheet',
  'job-completion-checklist',
])

export function parseUrlState() {
  const params = new URLSearchParams(window.location.search)
  const view = params.get('v')
  return {
    view: view && KNOWN_VIEWS.has(view) ? view : DEFAULTS.view,
    selectedJobId: params.get('j') || DEFAULTS.selectedJobId,
    dashboardQuery: params.get('dq') || DEFAULTS.dashboardQuery,
    dashboardFilter: params.get('df') || DEFAULTS.dashboardFilter,
  }
}

export function buildUrlSearch(navState) {
  const params = new URLSearchParams()
  if (navState.view && navState.view !== DEFAULTS.view) params.set('v', navState.view)
  if (navState.selectedJobId) params.set('j', navState.selectedJobId)
  if (navState.dashboardQuery) params.set('dq', navState.dashboardQuery)
  if (navState.dashboardFilter && navState.dashboardFilter !== DEFAULTS.dashboardFilter) {
    params.set('df', navState.dashboardFilter)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : window.location.pathname
}

export function pushUrlState(navState) {
  window.history.pushState(navState, '', buildUrlSearch(navState))
}

export function replaceUrlState(navState) {
  window.history.replaceState(navState, '', buildUrlSearch(navState))
}
