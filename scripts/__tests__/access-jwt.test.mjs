// Proves the Cloudflare Access gate actually refuses things, rather than
// merely existing. Every case here is a way a request could get through if
// one of the checks in verifyAccessJwt were dropped.
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { webcrypto } from 'node:crypto'

const { verifyAccessJwt } = await import('../../upload-worker/src/index.js')

const TEAM = 'cassidydavies'
const AUD = 'a'.repeat(64)
const ISS = `https://${TEAM}.cloudflareaccess.com`
const KID = 'test-key-1'

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const pair = await webcrypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
)
const pubJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey)
const jwks = { keys: [{ kid: KID, kty: pubJwk.kty, n: pubJwk.n, e: pubJwk.e, alg: 'RS256', use: 'sig' }] }

// Stub the JWKS endpoint. Anything else being fetched is a bug.
globalThis.fetch = async (url) => {
  assert.equal(String(url), `${ISS}/cdn-cgi/access/certs`)
  return new Response(JSON.stringify(jwks), { headers: { 'Content-Type': 'application/json' } })
}

const now = () => Math.floor(Date.now() / 1000)

async function mint(payloadOverrides = {}, headerOverrides = {}) {
  const header = { alg: 'RS256', kid: KID, typ: 'JWT', ...headerOverrides }
  const payload = { aud: [AUD], iss: ISS, exp: now() + 600, iat: now(), email: 'tim@cdelectrical.co.nz', ...payloadOverrides }
  const signing = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(signing))
  return `${signing}.${b64url(sig)}`
}

const req = (token) =>
  new Request('https://api.example.com/app-data?key=field:9412', {
    headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
  })

const ENV = { ACCESS_TEAM: TEAM, ACCESS_AUD: AUD }

test('unconfigured: the gate is a no-op, so deploying it changes nothing', async () => {
  const r = await verifyAccessJwt(req(await mint()), {})
  assert.equal(r.enforced, false)
  const partial = await verifyAccessJwt(req(await mint()), { ACCESS_TEAM: TEAM })
  assert.equal(partial.enforced, false, 'one half of the config must not half-enable it')
})

test('a valid token passes and names the person', async () => {
  const r = await verifyAccessJwt(req(await mint()), ENV)
  assert.equal(r.ok, true)
  assert.equal(r.identity, 'tim@cdelectrical.co.nz')
})

test('a service token passes, named by common_name', async () => {
  const token = await mint({ email: undefined, common_name: 'weekly-upload' })
  const r = await verifyAccessJwt(req(token), ENV)
  assert.equal(r.ok, true)
  assert.equal(r.identity, 'weekly-upload')
})

test('no session is refused — this is the workers.dev back door', async () => {
  const r = await verifyAccessJwt(req(null), ENV)
  assert.deepEqual([r.ok, r.reason], [false, 'no_session'])
})

test('a token for another Access application is refused', async () => {
  const r = await verifyAccessJwt(req(await mint({ aud: ['b'.repeat(64)] })), ENV)
  assert.deepEqual([r.ok, r.reason], [false, 'wrong_audience'])
})

test('a token from another team is refused', async () => {
  const r = await verifyAccessJwt(req(await mint({ iss: 'https://someoneelse.cloudflareaccess.com' })), ENV)
  assert.deepEqual([r.ok, r.reason], [false, 'wrong_issuer'])
})

test('an expired token is refused', async () => {
  const r = await verifyAccessJwt(req(await mint({ exp: now() - 1 })), ENV)
  assert.deepEqual([r.ok, r.reason], [false, 'expired'])
})

test('a token with no exp is refused rather than treated as eternal', async () => {
  const r = await verifyAccessJwt(req(await mint({ exp: undefined })), ENV)
  assert.deepEqual([r.ok, r.reason], [false, 'expired'])
})

test('a tampered payload is refused', async () => {
  const token = await mint()
  const [h, , sig] = token.split('.')
  const forged = b64url(JSON.stringify({ aud: [AUD], iss: ISS, exp: now() + 600, email: 'attacker@example.com' }))
  const r = await verifyAccessJwt(req(`${h}.${forged}.${sig}`), ENV)
  assert.deepEqual([r.ok, r.reason], [false, 'bad_signature'])
})

test('alg is pinned, so an unsigned token is refused', async () => {
  const header = b64url(JSON.stringify({ alg: 'none', kid: KID, typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ aud: [AUD], iss: ISS, exp: now() + 600 }))
  const r = await verifyAccessJwt(req(`${header}.${payload}.`), ENV)
  assert.deepEqual([r.ok, r.reason], [false, 'bad_alg'])
})

test('a token signed by an unknown key is refused', async () => {
  const r = await verifyAccessJwt(req(await mint({}, { kid: 'not-our-key' })), ENV)
  assert.deepEqual([r.ok, r.reason], [false, 'unknown_key'])
})

test('rubbish in the header is refused, not thrown', async () => {
  const r = await verifyAccessJwt(req('not.a.jwt'), ENV)
  assert.equal(r.ok, false)
})
