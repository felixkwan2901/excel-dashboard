// The completed-job loader for scripts: everything in completed-job-core.mjs
// (which has no Node imports, so the browser can preview a batch with the
// same code) plus the parts that touch the disk.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadCompletedFiles, makeSource, workbookFromBytes } from './completed-job-core.mjs'

export * from './completed-job-core.mjs'

// XLSX.readFile relies on the package detecting Node's `fs` itself, which its ESM
// build doesn't do — it fails with an opaque "Cannot access file". Reading the
// buffer ourselves sidesteps that.
export function readWorkbook(path) {
  return workbookFromBytes(readFileSync(path))
}

export function folderSource(folder) {
  const names = readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.xlsx') || f.toLowerCase() === 'manifest.csv')
  return makeSource(names, (name) => new Uint8Array(readFileSync(join(folder, name))), (name) => readFileSync(join(folder, name), 'utf8'))
}

// Reads a folder of completed-job exports — see loadCompletedFiles.
export function loadCompletedFolder(folder, opts) {
  return loadCompletedFiles(folderSource(folder), opts)
}

// Replace-by-job-number, so re-running a month is safe.
export function upsertCompletedJobs(outPath, records) {
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : []
  const incoming = new Set(records.map((r) => r.jobNumber))
  const merged = [...existing.filter((j) => !incoming.has(j.jobNumber)), ...records]
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n')
  return merged.length
}
