// Runs the completed-jobs loader on the files chosen on the Update data page,
// in the browser, before anything is uploaded — the same code the GitHub
// workflow runs on the bundle, so what the preview says is what will load.
import { explainProblem, explainSkip } from './uploadWords.js'

const SUMMARY_RE = /^Profit\s*&\s*Loss Summary/i
const PL_RE = /^ProfitAndLoss/i
const TS_RE = /^Timesheets/i
const JOBS_RE = /^Jobs/i

// What the batch should contain, from the file names alone — shown as a
// checklist before the files are even read.
export function checklist(names) {
  const n = (re) => names.filter((x) => re.test(x)).length
  const summary = n(SUMMARY_RE) > 0, manifest = names.some((x) => x.toLowerCase() === 'manifest.csv')
  const renamed = names.some((x) => /^(CU|Q)-\d+/i.test(x))
  const other = names.filter((x) => !/\.xlsx$/i.test(x) && x.toLowerCase() !== 'manifest.csv')
  return {
    summary, manifest, renamed, other,
    pl: n(PL_RE) + names.filter((x) => /^(CU-\d+|Q-\d+-pl)\.xlsx$/i.test(x)).length,
    ts: n(TS_RE) + names.filter((x) => /^Q-\d+-ts\.xlsx$/i.test(x)).length,
    jobsList: n(JOBS_RE) > 0,
    items: [
      { key: 'summary', label: 'Profit & Loss Summary report', ok: summary, need: true,
        note: summary ? 'Gives every job its figures and matches charge-up files to their jobs.' : 'Without it, charge-up files can’t be matched to jobs and the figures won’t match Katipolt’s screens.' },
      { key: 'pl', label: `Profit & Loss exports — ${n(PL_RE)}`, ok: n(PL_RE) > 0 || renamed, need: true,
        note: 'One per completed job (ProfitAndLoss-….xlsx).' },
      { key: 'ts', label: `Timesheets exports — ${n(TS_RE)}`, ok: true, need: false,
        note: 'One per quoted job, so the hours can be split by person. Optional.' },
      { key: 'jobs', label: 'Jobs list', ok: true, need: false,
        note: n(JOBS_RE) ? 'Gives charge-up jobs their names.' : 'Optional — without it a charge-up job is shown by its number.' },
      ...(manifest ? [{ key: 'manifest', label: 'manifest.csv', ok: true, need: false,
        note: summary ? 'Not needed when the Summary report is included — it will be checked against the files, and a mismatch stops the load.' : 'Used to match files to jobs because there is no Summary report. It must list exactly these files, in download order.' }] : []),
      ...(other.length ? [{ key: 'other', label: `Not accepted: ${other.join(', ')}`, ok: false, need: true, note: 'Only Katipolt .xlsx downloads and manifest.csv can be uploaded.' }] : []),
    ],
  }
}

// files: [{ name, bytes: Uint8Array }]. known: job numbers already loaded.
export async function previewCompletedJobs(files, known = new Set()) {
  const core = await import('../../scripts/lib/completed-job-core.mjs')
  const byName = new Map(files.map((f) => [f.name, f.bytes]))
  const source = core.makeSource([...byName.keys()], (name) => byName.get(name))
  const { records, skipped, problems, notes } = core.loadCompletedFiles(source, { known })
  const looks = skipped.map(explainSkip)
  // Katipolt downloads that ended up with no job at all: nothing matched them,
  // and the loader has nothing to say about a file it never claimed.
  const claimed = new Set([...records.flatMap((r) => [r.sourceFile, r.timesheetFile]), ...skipped.map((s) => s.file)].filter(Boolean))
  const summary = source.names.some((n) => SUMMARY_RE.test(n)), manifest = source.names.some((n) => n.toLowerCase() === 'manifest.csv')
  const unmatched = source.names.filter((n) => (PL_RE.test(n) || TS_RE.test(n)) && !claimed.has(n))
  if (unmatched.length && !problems.length) {
    const pl = unmatched.filter((n) => PL_RE.test(n)).length, ts = unmatched.length - pl
    looks.push({
      kind: 'warn',
      what: `${[pl && `${pl} Profit & Loss export${pl === 1 ? '' : 's'}`, ts && `${ts} Timesheets export${ts === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} couldn’t be matched to any job${summary ? '' : ' — there is no Profit & Loss Summary report to match them with'}${!summary && manifest ? ' (manifest.csv didn’t name them either)' : ''}.`,
      fix: summary ? 'These jobs aren’t in the Summary report. Check they are completed in Katipolt and the report is this month’s.' : 'Add this month’s Profit & Loss Summary report to the selection (Katipolt → Reports → Profit & Loss Summary, Completed: This Month).',
    })
  }
  return {
    records,
    problems: problems.map(explainProblem),
    needsLook: looks.filter((l) => l.kind === 'warn'),
    info: looks.filter((l) => l.kind !== 'warn'),
    notes,
    noHours: records.filter((r) => (r.flags ?? []).includes('no-sold-hours')).length,
    replacing: records.filter((r) => known.has(r.jobNumber)).length,
  }
}
