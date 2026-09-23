#!/usr/bin/env node
// Put map coordinates onto the field app's jobs, so the Map tab has
// something to place a pin at.
//
//   node scripts/geocode-field-jobs.mjs [--dry-run]
//
// The addresses come from import-job-details.mjs, which gets them from the
// Jobs export. That export has no coordinates — a street address is not a
// map pin — and nothing else in the company has ever recorded any either.
//
// Geocoded with OpenStreetMap's Nominatim, which is free and needs no
// account or key. Its usage policy asks for max 1 request/second and a
// descriptive User-Agent, both of which this respects — 28 jobs is 28
// seconds, run occasionally, not something that comes anywhere near a rate
// a free public service would notice.
//
// Cached to public/geocode-cache.json, keyed by the exact address string, so
// re-running this after typing in one new address does not re-look-up the
// other 27. That file is committed — it costs nothing to keep and it is what
// makes a second run of this script nearly instant.
//
// Only fills addresses that do not already have a lat/lng. A coordinate
// somebody has corrected by hand (Nominatim gets a rural address's exact
// pin wrong sometimes) is never overwritten by this script — see
// scripts/__tests__ for that guarantee.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const KEY = 'planning:field-jobs'
const NS = '1bed6e14dbf047ac8616ae21ed09a9f6'
const CACHE_PATH = 'public/geocode-cache.json'
const USER_AGENT = 'cassidy-davies-field-app/1.0 (internal tool, not for redistribution)'

const dryRun = process.argv.includes('--dry-run')

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })

function readCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// One request, one address. Returns null on anything that is not a clean
// single match — a failed lookup with no coordinate is a job with no pin,
// same as today; a wrong pin somewhere a crew is standing is worse than that.
async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    countrycodes: 'nz',
  })}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) return null
  const [hit] = await res.json()
  if (!hit) return null
  const lat = Number(hit.lat)
  const lng = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

const list = JSON.parse(wrangler(['kv', 'key', 'get', KEY, '--namespace-id', NS, '--remote']))
if (!Array.isArray(list)) {
  console.error(`${KEY} is not a list. Nothing to do.`)
  process.exit(1)
}

const cache = readCache()
const needsLookup = list.filter(
  (j) => j.site?.address && typeof j.site.lat !== 'number',
)

console.log(`${list.length} job(s), ${needsLookup.length} with an address and no coordinates`)

let looked = 0
let failed = 0
const next = []
for (const job of list) {
  const address = job.site?.address
  if (!address || typeof job.site.lat === 'number') {
    next.push(job)
    continue
  }

  let hit = cache[address]
  if (hit === undefined) {
    hit = await geocode(address)
    cache[address] = hit // cache the miss too, as `null` — a bad address is
    // not going to start resolving on the next run, and this stops it being
    // looked up again every single time.
    looked += 1
    // Nominatim's usage policy: max 1 request/second.
    await sleep(1100)
  }

  if (hit) {
    next.push({ ...job, site: { ...job.site, lat: hit.lat, lng: hit.lng } })
  } else {
    failed += 1
    next.push(job)
  }
}

console.log(`  ${looked} looked up, ${failed} could not be matched`)
if (failed) {
  console.log('  (a job with no coordinate still shows everywhere except the map)')
}

writeCache(cache)
console.log(`Wrote ${CACHE_PATH}.`)

if (dryRun) {
  console.log('(dry run — planning:field-jobs not written)')
} else {
  wrangler(['kv', 'key', 'put', KEY, JSON.stringify(next), '--namespace-id', NS, '--remote'])
  console.log(`Wrote ${KEY}.`)
}
