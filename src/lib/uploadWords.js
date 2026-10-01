// Plain words for what the completed-jobs loader says. The loader's messages
// are written for the person reading a log; these are for the person at the
// Update data page, each with what to do about it.
//
// Every rule: { test: RegExp, say(match, ctx) → { what, fix } }.

const MANIFEST_FIX = 'Leave manifest.csv out of the selection. With the Profit & Loss Summary report included, every file finds its own job by its figures.'
const $ = (v) => `$${Number(v).toFixed(2)}`

const PROBLEMS = [
  { test: /^(\d+) ProfitAndLoss file\(s\) but the manifest lists (\d+)/,
    say: ([, have, want]) => ({ what: `manifest.csv lists ${want} Profit & Loss file${want === '1' ? '' : 's'}, but ${have} ${have === '1' ? 'was' : 'were'} selected.`, fix: MANIFEST_FIX }) },
  { test: /^(\d+) Timesheets file\(s\) but the manifest lists (\d+)/,
    say: ([, have, want]) => ({ what: `manifest.csv lists ${want} Timesheets file${want === '1' ? '' : 's'}, but ${have} ${have === '1' ? 'was' : 'were'} selected.`, fix: MANIFEST_FIX }) },
  { test: /^#(\d+) job (\d*): (.+?) is for job (\d+)$/,
    say: ([, row, job, file, real]) => ({ what: `manifest.csv row ${row} says job ${job || '(blank)'}, but ${file} is job ${real}'s export — the downloads aren't in the order the manifest expects.`, fix: MANIFEST_FIX }) },
  { test: /^#(\d+) job (\d*): (.+?) is a (\w+) export, manifest says (\w+)$/,
    say: ([, row, job, file, kind, said]) => ({ what: `${file} is a ${kind === 'chargeup' ? 'charge-up' : kind} job, but manifest.csv row ${row}${job ? ` (job ${job})` : ''} says ${said === 'chargeup' ? 'charge-up' : said}.`, fix: MANIFEST_FIX }) },
  { test: /^#(\d+) job (\d*): (.+?) has profit ([-\d.]+), screen showed ([-\d.]+)$/,
    say: ([, row, , file, has, saw]) => ({ what: `${file} has a profit of ${$(has)}, but manifest.csv row ${row} expected ${$(saw)}.`, fix: MANIFEST_FIX }) },
  { test: /^#(\d+) job (\d*): (.+?) has ([\d.]+) h, screen showed ([\d.]+) h$/,
    say: ([, row, job, file, has, saw]) => ({ what: `${file} has ${has} hours, but manifest.csv row ${row}${job ? ` (job ${job})` : ''} expected ${saw}.`, fix: MANIFEST_FIX }) },
]

const SKIPS = [
  { test: /loaded, but no timesheet export/, kind: 'info',
    say: (m, s) => ({ what: `Job ${s.job} loaded without a Timesheets export, so its hours are the Budgeted total and nobody is listed as working on it.`, fix: 'Include its Timesheets export to see who worked on it.' }) },
  { test: /in the Profit & Loss Summary \((quoted|charge-up), (.*?)\) but no P&L file was uploaded/, kind: 'warn',
    say: ([, type, customer], s) => ({ what: `Job ${s.job} (${type}${customer ? `, ${customer}` : ''}) is in the Summary report, but its Profit & Loss export isn't in this selection.`, fix: 'Export it from Katipolt and add it — or carry on if it isn’t really finished.' }) },
  { test: /^(.+?): profit \$([-\d.]+)(?:, ([\d.]+) sold h \((.*?)\)|, no sold hours) — put its job number in manifest\.csv/, kind: 'warn',
    say: ([, file, profit, hours, who]) => ({ what: `${file} is a charge-up export that couldn't be matched to a job (profit ${$(profit)}${hours ? `, ${hours} sold h${who ? ` by ${who}` : ''}` : ', no sold hours'}).`, fix: 'Include this month’s Profit & Loss Summary report so it can be matched by its figures, or add its job number to manifest.csv.' }) },
  { test: /Found no worker hours on the Timesheet export/, kind: 'warn',
    say: (m, s) => ({ what: `${s.file}: this Timesheets export has no hours in it.`, fix: 'Re-export it from Katipolt with the right date range, or leave it out — the job still loads with its Budgeted hours.' }) },
  { test: /not a (charge-up|quoted) P&L export/, kind: 'warn',
    say: ([, kind], s) => ({ what: `${s.file} isn't a ${kind} Profit & Loss export, but it was matched as one.`, fix: MANIFEST_FIX }) },
  { test: /file says job (\d+) but the export is for (\d+)/, kind: 'warn',
    say: ([, said, real], s) => ({ what: `${s.file} was taken as job ${said}, but the export inside is job ${real}'s.`, fix: MANIFEST_FIX }) },
  { test: /missing its (.+?) sheet/, kind: 'warn',
    say: ([, sheets], s) => ({ what: `${s.file} isn't a Katipolt Profit & Loss export — it has no ${sheets} sheet.`, fix: 'Check it’s the right download, and leave it out if not.' }) },
  { test: /No billed labour on the Sold sheet|Could not read/, kind: 'warn',
    say: (m, s) => ({ what: `${s.file} couldn't be read: ${s.reason}`, fix: 'Export it again from Katipolt.' }) },
]

export function explainProblem(text) {
  for (const r of PROBLEMS) { const m = text.match(r.test); if (m) return r.say(m) }
  return { what: text, fix: MANIFEST_FIX }
}

export function explainSkip(s) {
  const reason = s.reason ?? ''
  for (const r of SKIPS) { const m = reason.match(r.test); if (m) return { job: s.job, file: s.file, kind: r.kind, ...r.say(m, s) } }
  return { job: s.job, file: s.file, kind: 'warn', what: `${s.job && s.job !== '?' ? `Job ${s.job}` : s.file}: ${reason}`, fix: '' }
}

// A failure message from the workflow (pending-updates/failed/*.error.json).
export function explainFailure(message = '') {
  let m
  if ((m = message.match(/^The files and manifest\.csv do not line up, so nothing was loaded: (.*)$/s))) {
    return { headline: 'Nothing was loaded — manifest.csv doesn’t match the files.', items: m[1].split(' · ').map(explainProblem) }
  }
  if ((m = message.match(/^No completed jobs could be read from these files\.\s*(.*)$/s))) {
    const items = m[1] ? m[1].split(' · ').map((t) => { const [job, ...rest] = t.split(': '); return explainSkip({ job, file: '', reason: rest.join(': ') }) }) : []
    return { headline: 'Nothing was loaded — no job could be read from these files.', items, fix: 'Check the Profit & Loss Summary report is in the selection, then try again.' }
  }
  if ((m = message.match(/^Processing failed: (.*)$/s))) {
    return { headline: 'Nothing was loaded — something went wrong reading the files.', items: [explainSkip({ job: '?', file: 'A file', reason: m[1] })] }
  }
  return { headline: message || 'The upload failed.', items: [] }
}
