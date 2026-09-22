// The email sign-in code path. These are the parts with no I/O in them: the
// code generator, the signed challenge, and the address lookup.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateCode, signChallenge, readChallenge, normaliseEmail, userByEmail,
} from '../../site-worker/auth.js'

const SECRET = 'a-test-signing-secret'

test('a code is always six digits', () => {
  for (let i = 0; i < 200; i += 1) {
    assert.match(generateCode(), /^\d{6}$/)
  }
})

test('codes are not all the same', () => {
  const seen = new Set()
  for (let i = 0; i < 50; i += 1) seen.add(generateCode())
  assert.ok(seen.size > 40, `only ${seen.size} distinct codes in 50 draws`)
})

test('the right code opens the challenge', async () => {
  const code = generateCode()
  const c = await signChallenge('felix', 'felix@example.com', code, SECRET)
  assert.deepEqual(await readChallenge(c, code, SECRET), {
    user: 'felix', email: 'felix@example.com',
  })
})

test('a wrong code does not', async () => {
  const c = await signChallenge('felix', 'felix@example.com', '123456', SECRET)
  assert.equal(await readChallenge(c, '123457', SECRET), null)
  assert.equal(await readChallenge(c, '', SECRET), null)
  assert.equal(await readChallenge(c, '12345', SECRET), null)
})

test('another secret does not', async () => {
  const c = await signChallenge('felix', 'felix@example.com', '123456', SECRET)
  assert.equal(await readChallenge(c, '123456', 'a-different-secret'), null)
})

// The whole point of signing the payload rather than storing it: the browser
// holds the challenge, so it must not be able to edit who it is for.
test('the username cannot be swapped out', async () => {
  const c = await signChallenge('felix', 'felix@example.com', '123456', SECRET)
  const [body, sig] = c.split('.')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  payload.u = 'someone-else'
  const forged = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`
  assert.equal(await readChallenge(forged, '123456', SECRET), null)
})

test('an expired challenge is refused', async () => {
  const c = await signChallenge('felix', 'felix@example.com', '123456', SECRET, -1)
  assert.equal(await readChallenge(c, '123456', SECRET), null)
})

test('a malformed challenge is refused rather than thrown', async () => {
  for (const bad of ['', 'x', 'x.y', 'not.base64!!', null, undefined]) {
    assert.equal(await readChallenge(bad, '123456', SECRET), null)
  }
})

test('addresses are matched without case or spacing', () => {
  const users = { felix: { email: 'Felix@Example.com ' } }
  assert.equal(userByEmail(users, '  FELIX@example.COM ')?.username, 'felix')
  assert.equal(normaliseEmail('  A@B.C '), 'a@b.c')
})

test('an unknown address matches nobody', () => {
  const users = { felix: { email: 'felix@example.com' }, sam: {} }
  assert.equal(userByEmail(users, 'nobody@example.com'), null)
  // An account with no address must not be matched by an empty one.
  assert.equal(userByEmail(users, ''), null)
  assert.equal(userByEmail(users, undefined), null)
})

// Regression: a corrupted session cookie used to throw out of atob() rather
// than read as "not signed in", and because that happens before any route is
// chosen it made every page a 500 — including the login page that would have
// replaced the bad cookie. The only way out was clearing cookies by hand.
test('a corrupted session cookie reads as signed out, not as an error', async () => {
  const { readSession, signSession } = await import('../../site-worker/auth.js')
  for (const bad of ['', 'x', 'x.y', 'not base64.at all!!', '@@@.@@@', 'a'.repeat(400)]) {
    assert.equal(await readSession(bad, SECRET), null)
  }
  const good = await signSession('felix', SECRET, 1)
  assert.equal((await readSession(good, SECRET)).user, 'felix')
  // Truncated in transit — the shape survives, the signature does not.
  assert.equal(await readSession(good.slice(0, -4), SECRET), null)
})
