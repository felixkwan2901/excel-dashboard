// Tidy CSV exports of everything the dashboard has parsed, for Tableau (or
// Excel, or anything else that reads a table).
//
// Built from the app's already-parsed data rather than from a script that
// re-reads the workbook. The Deliverables Sheet parse is block-based and
// full of hard-won rules — which week row counts as current, what makes a
// block a real job, how a "#DIV/0!" becomes null — and a second
// implementation of that would drift from this one within a month. This has
// exactly one source of truth by construction.
//
// Everything except jobs.csv is LONG, not wide: one row per job per month,
// rather than a column per month. Tableau wants a date to be a field it can
// put on an axis; twelve month columns force a pivot on every connection and
// break the moment a thirteenth appears.

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// RFC 4180: quote anything containing a comma, quote or newline, and double
// up embedded quotes. Job names here include commas and apostrophes, and one
// wrong row shifts every column after it.
function cell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n')
}

// Tableau reads YYYY-MM-DD as a date without being asked; YYYY-MM it treats
// as a string, which puts the months in alphabetical order — Apr, Aug, Dec.
function monthKeyToDate(monthKey) {
  return `${monthKey}-01`
}

function labelToDate(label, year) {
  return `${year}-${String(MONTH_LABELS.indexOf(label) + 1).padStart(2, '0')}-01`
}

export function jobsCsv(jobs) {
  const fields = [
    'jobNumber', 'jobName', 'quotedPrice', 'claimToDate', 'remainingToClaim', 'pctClaimRemaining',
    'totalQuotedCost', 'totalActualCost', 'quotedMaterialCost', 'actualMaterialCost',
    'materialCostRemaining', 'materialPctRemaining', 'estimatedPctMaterialsReceived',
    'quotedLabourCost', 'actualLabourCost', 'labourCostRemaining', 'labourCostPctRemaining',
    'quotedLabourHours', 'actualLabourHours', 'labourHoursRemaining', 'labourHourPctRemaining',
    'estimatedPctJobComplete', 'gpPerHour', 'quotedGpPerHour', 'marginToDate', 'quotedMargin',
    'projectedTotalCost', 'projectedOverrun', 'overBudget', 'losingMargin', 'flagged',
    'lastUpdatedLabel', 'weeksBehind',
  ]
  return toCsv(fields, jobs.map((j) => fields.map((f) => j[f])))
}

export function claimsByMonthCsv(monthlyClaimsHistory) {
  const rows = []
  for (const job of monthlyClaimsHistory.jobs ?? []) {
    for (const month of monthlyClaimsHistory.months ?? []) {
      if (job.claimByMonth[month] === undefined) continue
      rows.push([
        job.jobNumber,
        job.jobName,
        monthKeyToDate(month),
        job.claimByMonth[month],
        job.costsByMonth[month],
        job.profitByMonth[month],
      ])
    }
  }
  return toCsv(['jobNumber', 'jobName', 'month', 'claim', 'costs', 'profit'], rows)
}

export function hoursByMonthCsv(monthlyHours) {
  const rows = []
  for (const job of monthlyHours.jobs ?? []) {
    for (const month of monthlyHours.months ?? []) {
      const hours = job.hoursByMonth?.[month]
      if (hours === undefined) continue
      rows.push([job.jobNumber, job.jobName, monthKeyToDate(month), hours])
    }
  }
  return toCsv(['jobNumber', 'jobName', 'month', 'hours'], rows)
}

// One row per month per measure rather than a column each, so a Tableau
// filter on "measure" swaps what the chart plots without rebuilding it.
export function capacityByMonthCsv(upcomingWork, year = new Date().getFullYear()) {
  const capacity = upcomingWork?.capacity
  if (!capacity) return toCsv(['month', 'measure', 'value'], [])
  const measures = {
    'Servicing hours': capacity.servicingHours,
    'Residential hours': capacity.residentialHours,
    'Commercial hours': capacity.commercialHours,
    'Total hours planned': capacity.totalHours,
    'Hours available': capacity.hoursAvailable,
    'Balance hours': capacity.balanceHours,
    'Working days': capacity.workingDays,
    'Staff on tools': capacity.staffOnTools,
  }
  const rows = []
  for (const [measure, byMonth] of Object.entries(measures)) {
    for (const label of MONTH_LABELS) {
      const value = byMonth?.[label]
      if (value === null || value === undefined) continue
      rows.push([labelToDate(label, year), measure, value])
    }
  }
  return toCsv(['month', 'measure', 'value'], rows)
}

export function plannedHoursCsv(upcomingWork, year = new Date().getFullYear()) {
  const rows = []
  for (const job of upcomingWork?.jobs ?? []) {
    for (const label of MONTH_LABELS) {
      const hours = job.months?.[label]
      if (!hours) continue
      rows.push([job.jobNumber, job.jobName, labelToDate(label, year), hours])
    }
  }
  return toCsv(['jobNumber', 'jobName', 'month', 'plannedHours'], rows)
}

// A BOM so Excel on Windows opens the file as UTF-8 rather than mangling the
// en-dashes and macrons in job and street names.
export function downloadCsv(filename, csv) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in Safari; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
