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

async function makeEnv({ email = 'felix@cdelectrical.co.nz', mail = true } = {}) {
  const APP_DATA = kv()
  const users = {
    felix: { ...(await hashPassword('a-long-enough-password')), name: 'Felix', email, v: 3 },
    noemail: { ...(await hashPassword('another-long-password')), name: 'Sam', v: 1 },
  }
  await APP_DATA.put('auth:users', JSON.stringify(users))
  return {
    APP_DATA,
    SESSION_SECRET: 'test-session-secret',
    ...(mail ? { RESEND_API_KEY: 'test-key', MAIL_FROM: 'CDE <no-reply@example.com>' } : {}),
    ASSETS: { fetch: async () => new Response('THE DASHBOARD', { status: 200 }) },
  }
}

// Captures outbound Resend calls and answers them 200.
function captureMail() {
  const sent = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) })
    return new Response('{"id":"stub"}', { status: 200 })
  }
  return { sent, restore: () => { globalThis.fetch = real } }
}

const post = (path, fields) => {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  return new Request(`${ORIGIN}${path}`, { method: 'POST', body })
}

const codeFrom = (mail) => mail.body.subject.match(/(\d{6})/)[1]
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
