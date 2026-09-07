import { test } from 'node:test'
import assert from 'node:assert/strict'
import { businessNow, businessDateString } from '../lib/business-time.mjs'

const week = (d) => Math.min(5, Math.ceil(d.getDate() / 7))

// The bug this exists to prevent: GitHub's runners are UTC, the business is
// UTC+12/+13, so a morning upload in NZ is the previous day on the runner.
// When those two dates straddle a week boundary the figures land in the wrong
// week slot and every job immediately reads as a week behind.

test('a morning NZ upload keeps its own calendar day, not the runner\'s', () => {
  // 08:55 Tue 8 Sep NZ === 20:55 Mon 7 Sep UTC — the real case that broke.
  const instant = new Date('2026-09-07T20:55:00Z')
  assert.equal(instant.getUTCDate(), 7, 'runner would see the 7th')
  assert.equal(businessDateString(businessNow(instant)), '2026-09-08')
  assert.equal(week(businessNow(instant)), 2, 'must be Week 2, as the browser sees it')
})

test('the week boundaries that actually shift: 8th, 15th, 22nd, 29th', () => {
  for (const [utc, nzDay, expectedWeek] of [
    ['2026-09-07T20:00:00Z', 8, 2],
    ['2026-09-14T20:00:00Z', 15, 3],
    ['2026-09-21T20:00:00Z', 22, 4],
    ['2026-09-28T20:00:00Z', 29, 5],
  ]) {
    const b = businessNow(new Date(utc))
    assert.equal(b.getDate(), nzDay, `${utc} should be the ${nzDay}th in NZ`)
    assert.equal(week(b), expectedWeek)
  }
})

test('an afternoon NZ upload shares the runner\'s date, and still agrees', () => {
  // 15:00 Tue 8 Sep NZ === 03:00 Tue 8 Sep UTC — both see the 8th.
  const instant = new Date('2026-09-08T03:00:00Z')
  assert.equal(instant.getUTCDate(), 8)
  assert.equal(businessNow(instant).getDate(), 8)
})

test('month is taken from the NZ calendar, so rollover fires on the right day', () => {
  // 11:00 Tue 1 Sep NZ === 23:00 Mon 31 Aug UTC. Filing this under August
  // would close September before it began.
  const b = businessNow(new Date('2026-08-31T23:00:00Z'))
  assert.equal(b.getMonth(), 8, 'September (0-indexed)')
  assert.equal(b.getDate(), 1)
  assert.equal(businessDateString(b), '2026-09-01')
})

test('handles daylight saving — NZDT is UTC+13', () => {
  // NZ moves to UTC+13 in late September. 10:00 on 1 Jan NZDT is 21:00 on
  // 31 Dec UTC — a year boundary, not just a day one.
  const b = businessNow(new Date('2026-12-31T21:00:00Z'))
  assert.equal(businessDateString(b), '2027-01-01')
})

test('businessDateString never round-trips through UTC', () => {
  // Formatting via toISOString() would undo the conversion and reintroduce
  // the original bug, so pin the behaviour.
  const b = businessNow(new Date('2026-09-07T20:55:00Z'))
  assert.equal(businessDateString(b), '2026-09-08')
  assert.notEqual(businessDateString(b), b.toISOString().slice(0, 10))
})
