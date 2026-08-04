// Syncs the SPA's in-memory navigation state to the URL query string via
// the History API (no router dependency). Forward navigation (opening a
// category/company/project) pushes a new entry; refining the current view
// (a filter tab, a search term) replaces the current entry in place, so
// pressing back later lands on the current-view entry with its latest
// filter state intact rather than stepping through every tab click.
const DEFAULTS = {
  view: 'home',
  selectedCategory: null,
  selectedClient: null,
  selectedJobId: null,
  companyFilter: 'all',
  dashboardQuery: '',
  dashboardFilter: 'all',
}

export function parseUrlState() {
  const params = new URLSearchParams(window.location.search)
  return {
    view: params.get('v') || DEFAULTS.view,
    selectedCategory: params.get('c') || DEFAULTS.selectedCategory,
    selectedClient: params.get('cl') || DEFAULTS.selectedClient,
    selectedJobId: params.get('j') || DEFAULTS.selectedJobId,
    companyFilter: params.get('f') || DEFAULTS.companyFilter,
    dashboardQuery: params.get('dq') || DEFAULTS.dashboardQuery,
    dashboardFilter: params.get('df') || DEFAULTS.dashboardFilter,
  }
}

export function buildUrlSearch(navState) {
  const params = new URLSearchParams()
  if (navState.view && navState.view !== DEFAULTS.view) params.set('v', navState.view)
  if (navState.selectedCategory) params.set('c', navState.selectedCategory)
  if (navState.selectedClient) params.set('cl', navState.selectedClient)
  if (navState.selectedJobId) params.set('j', navState.selectedJobId)
  if (navState.companyFilter && navState.companyFilter !== DEFAULTS.companyFilter) {
    params.set('f', navState.companyFilter)
  }
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
