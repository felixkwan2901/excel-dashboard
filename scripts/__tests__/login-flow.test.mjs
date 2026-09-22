// The whole email sign-in flow, driven through the Worker's own fetch handler.
//
// No wrangler and no network: KV is a Map, ASSETS is a stub, and global fetch
// is replaced by one that captures what would have gone to Resend — which is
// how the test learns the code, the same way the recipient would.
import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../../site-worker/index.js'
import { hashPassword, SESSION_COOKIE } from '../../site-worker/auth.js'

const ORIGIN = 'https://dash.example.com'

function kv() {
  const store = new Map()
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null },
    async put(k, v) { store.set(k, v) },
    async delete(k) { store.delete(k) },
  }
}

const PROVIDERS = {
  resend: { RESEND_API_KEY: 'test-key' },
  mailjet: { MAILJET_API_KEY: 'test-key', MAILJET_SECRET_KEY: 'test-secret' },
}

async function makeEnv({ email = 'felix@cdelectrical.co.nz', mail = true, provider = 'resend' } = {}) {
  const APP_DATA = kv()
  const users = {
    felix: { ...(await hashPassword('a-long-enough-password')), name: 'Felix', email, v: 3 },
    noemail: { ...(await hashPassword('another-long-password')), name: 'Sam', v: 1 },
  }
  await APP_DATA.put('auth:users', JSON.stringify(users))
  return {
    APP_DATA,
    SESSION_SECRET: 'test-session-secret',
    ...(mail ? { ...PROVIDERS[provider], MAIL_FROM: 'CDE <no-reply@example.com>' } : {}),
    ASSETS: { fetch: async () => new Response('THE DASHBOARD', { status: 200 }) },
  }
}

// Captures outbound Resend calls and answers them 200.
function captureMail() {
  const sent = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) })
    // Mailjet reports per-message success inside a 200; Resend just 200s.
    return String(url).includes('mailjet')
      ? new Response('{"Messages":[{"Status":"success"}]}', { status: 200 })
      : new Response('{"id":"stub"}', { status: 200 })
  }
  return { sent, restore: () => { globalThis.fetch = real } }
}

const post = (path, fields) => {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  return new Request(`${ORIGIN}${path}`, { method: 'POST', body })
}

const codeFrom = (mail) =>
  (mail.body.subject ?? mail.body.Messages[0].Subject).match(/(\d{6})/)[1]
const cookieFrom = (res) => res.headers.get('Set-Cookie') ?? ''

test('the gate offers the email form when Resend is configured', async () => {
  const env = await makeEnv()
  const res = await worker.fetch(new Request(`${ORIGIN}/`), env)
  assert.equal(res.status, 401)
  const html = await res.text()
  assert.match(html, /Email me a code/)
  assert.match(html, /Use a password instead/)
})

test('and only the password form when it is not', async () => {
  const env = await makeEnv({ mail: false })
  const html = await (await worker.fetch(new Request(`${ORIGIN}/`), env)).text()
  assert.match(html, /Your name/)
  assert.doesNotMatch(html, /Email me a code/)
})

test('a code signs you in', async () => {
  const env = await makeEnv()
  const mail = captureMail()
  try {
    const step1 = await worker.fetch(post('/auth/code', { email: 'felix@cdelectrical.co.nz', next: '/' }), env)
    assert.equal(step1.status, 200)
    const page = await step1.text()
    assert.match(page, /Check your email/)

    assert.equal(mail.sent.length, 1)
    assert.match(mail.sent[0].url, /api\.resend\.com/)
    assert.deepEqual(mail.sent[0].body.to, ['felix@cdelectrical.co.nz'])
    assert.equal(mail.sent[0].body.from, 'CDE <no-reply@example.com>')
    const code = codeFrom(mail.sent[0])

    const challenge = page.match(/name="challenge" value="([^"]+)"/)[1]
    const step2 = await worker.fetch(
      post('/auth/verify', { email: 'felix@cdelectrical.co.nz', challenge, code, next: '/' }), env,
    )
    assert.equal(step2.status, 303)
    assert.match(cookieFrom(step2), new RegExp(`^${SESSION_COOKIE}=.+HttpOnly`))

    // And that cookie actually opens the dashboard.
    const signedIn = await worker.fetch(new Request(`${ORIGIN}/`, {
      headers: { Cookie: cookieFrom(step2).split(';')[0] },
    }), env)
    assert.equal(signedIn.status, 200)
    assert.equal(await signedIn.text(), 'THE DASHBOARD')
  } finally { mail.restore() }
})

test('the code is bound to the address it was sent to', async () => {
  const env = await makeEnv()
  const mail = captureMail()
  try {
    const page = await (await worker.fetch(post('/auth/code', { email: 'felix@cdelectrical.co.nz' }), env)).text()
    const challenge = page.match(/name="challenge" value="([^"]+)"/)[1]
    const code = codeFrom(mail.sent[0])
    // Same valid code and challenge, but the email on the account has since
    // changed — the challenge must not outlive it.
    const users = JSON.parse(await env.APP_DATA.get('auth:users'))
    users.felix.email = 'someone-else@example.com'
    await env.APP_DATA.put('auth:users', JSON.stringify(users))

    const res = await worker.fetch(post('/auth/verify', { email: 'felix@cdelectrical.co.nz', challenge, code }), env)
    assert.equal(res.status, 401)
    assert.match(await res.text(), /no longer valid/)
  } finally { mail.restore() }
})

test('a wrong code does not sign you in', async () => {
  const env = await makeEnv()
  const mail = captureMail()
  try {
    const page = await (await worker.fetch(post('/auth/code', { email: 'felix@cdelectrical.co.nz' }), env)).text()
    const challenge = page.match(/name="challenge" value="([^"]+)"/)[1]
    const wrong = String((Number(codeFrom(mail.sent[0])) + 1) % 1_000_000).padStart(6, '0')
    const res = await worker.fetch(post('/auth/verify', { email: 'felix@cdelectrical.co.nz', challenge, code: wrong }), env)
    assert.equal(res.status, 401)
    assert.equal(cookieFrom(res), '')
    assert.match(await res.text(), /wrong or has expired/)
  } finally { mail.restore() }
})

// The form must not become a way to find out which company addresses have
// dashboard accounts.
test('an unknown address looks exactly like a known one, and sends nothing', async () => {
  const env = await makeEnv()
  const mail = captureMail()
  try {
    const res = await worker.fetch(post('/auth/code', { email: 'stranger@example.com' }), env)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /Check your email/)
    assert.equal(mail.sent.length, 0)
  } finally { mail.restore() }
})

test('asking repeatedly is capped', async () => {
  const env = await makeEnv()
  const mail = captureMail()
  try {
    let last
    for (let i = 0; i < 6; i += 1) {
      last = await worker.fetch(post('/auth/code', { email: 'felix@cdelectrical.co.nz' }), env)
    }
    assert.equal(last.status, 429)
    assert.equal(mail.sent.length, 5)
  } finally { mail.restore() }
})

test('a send failure says so rather than pretending', async () => {
  const env = await makeEnv()
  const real = globalThis.fetch
  globalThis.fetch = async () => new Response('{"message":"domain not verified"}', { status: 403 })
  try {
    const res = await worker.fetch(post('/auth/code', { email: 'felix@cdelectrical.co.nz' }), env)
    assert.equal(res.status, 502)
    assert.match(await res.text(), /could not be sent/)
  } finally { globalThis.fetch = real }
})

test('the password route still works, and still respects next', async () => {
  const env = await makeEnv()
  const res = await worker.fetch(
    post('/auth/login', { username: 'felix', password: 'a-long-enough-password', next: '/planning' }), env,
  )
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('Location'), '/planning')
})

test('next cannot be pointed off-site', async () => {
  const env = await makeEnv()
  for (const bad of ['//evil.example.com', 'https://evil.example.com', 'javascript:alert(1)']) {
    const res = await worker.fetch(
      post('/auth/login', { username: 'felix', password: 'a-long-enough-password', next: bad }), env,
    )
    assert.equal(res.headers.get('Location'), '/')
  }
})

test('an account with no address cannot be reached by email', async () => {
  const env = await makeEnv()
  const mail = captureMail()
  try {
    await worker.fetch(post('/auth/code', { email: '' }), env)
    assert.equal(mail.sent.length, 0)
  } finally { mail.restore() }
})

test('a signed-out API call still answers JSON, not a login page', async () => {
  const env = await makeEnv()
  const res = await worker.fetch(new Request(`${ORIGIN}/api/whoami`), env)
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { ok: false, error: 'not_signed_in' })
})

// ---------------------------------------------------------------------------
// The Mailjet route — the one that needs no domain, and so the one actually in
// use. Same flow, different envelope on the wire.
// ---------------------------------------------------------------------------

test('mailjet: a code signs you in', async () => {
  const env = await makeEnv({ provider: 'mailjet' })
  const mail = captureMail()
  try {
    const page = await (await worker.fetch(post('/auth/code', { email: 'felix@cdelectrical.co.nz' }), env)).text()
    assert.match(page, /Check your email/)

    assert.equal(mail.sent.length, 1)
    assert.match(mail.sent[0].url, /api\.mailjet\.com\/v3\.1\/send/)
    const msg = mail.sent[0].body.Messages[0]
    assert.deepEqual(msg.To, [{ Email: 'felix@cdelectrical.co.nz' }])
    assert.deepEqual(msg.From, { Email: 'no-reply@example.com', Name: 'CDE' })
    assert.ok(msg.TextPart.includes(codeFrom(mail.sent[0])))

    const challenge = page.match(/name="challenge" value="([^"]+)"/)[1]
    const res = await worker.fetch(
      post('/auth/verify', { email: 'felix@cdelectrical.co.nz', challenge, code: codeFrom(mail.sent[0]) }), env,
    )
    assert.equal(res.status, 303)
    assert.match(cookieFrom(res), new RegExp(`^${SESSION_COOKIE}=.+HttpOnly`))
  } finally { mail.restore() }
})

// Mailjet answers 200 and puts the real verdict inside the body, so treating
// HTTP 200 as success would have silently swallowed an unverified sender —
// the single most likely thing to go wrong on this setup.
test('mailjet: a 200 that rejected the message is still a failure', async () => {
  const env = await makeEnv({ provider: 'mailjet' })
  const real = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    Messages: [{ Status: 'error', Errors: [{ ErrorMessage: 'sender not verified' }] }],
  }), { status: 200 })
  try {
    const res = await worker.fetch(post('/auth/code', { email: 'felix@cdelectrical.co.nz' }), env)
    assert.equal(res.status, 502)
    assert.match(await res.text(), /could not be sent/)
  } finally { globalThis.fetch = real }
})

test('mailjet: bad credentials surface as a failure, not a blank page', async () => {
  const env = await makeEnv({ provider: 'mailjet' })
  const real = globalThis.fetch
  globalThis.fetch = async () => new Response('{"ErrorMessage":"unauthorized"}', { status: 401 })
  try {
    const res = await worker.fetch(post('/auth/code', { email: 'felix@cdelectrical.co.nz' }), env)
    assert.equal(res.status, 502)
  } finally { globalThis.fetch = real }
})

test('mailjet needs both halves of the key before the route appears', async () => {
  const half = await makeEnv({ mail: false })
  half.MAILJET_API_KEY = 'only-one'
  half.MAIL_FROM = 'CDE <no-reply@example.com>'
  const html = await (await worker.fetch(new Request(`${ORIGIN}/`), half)).text()
  assert.doesNotMatch(html, /Email me a code/)
})

test('MAIL_FROM is split for Mailjet and passed whole to Resend', async () => {
  const { parseFrom } = await import('../../site-worker/mail.js')
  assert.deepEqual(parseFrom('CDE Dashboard <a@b.com>'), { name: 'CDE Dashboard', email: 'a@b.com' })
  assert.deepEqual(parseFrom('"CDE" <a@b.com>'), { name: 'CDE', email: 'a@b.com' })
  assert.deepEqual(parseFrom('a@b.com'), { name: '', email: 'a@b.com' })
  assert.deepEqual(parseFrom('  a@b.com  '), { name: '', email: 'a@b.com' })
})
