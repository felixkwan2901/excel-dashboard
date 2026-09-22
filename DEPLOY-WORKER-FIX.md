# Closing the open write API — deploy steps

**Status:** code written, linted and built locally. **Nothing deployed.**
Both deploys below need your Cloudflare and GitHub credentials, so they are
yours to run.

## What changed

**`upload-worker/src/index.js`**
- Every route now sits behind `isAuthorized()`, checked before dispatch.
  Only the CORS preflight answers without a key (it cannot carry one).
- The key arrives in an `X-Upload-Secret` header — never a query parameter,
  since those land in browser history, referrer headers and CF request logs.
- Constant-time comparison, so response timing does not leak the key.
- **Fails closed**: a worker with no `UPLOAD_SECRET` set refuses everything
  rather than silently allowing everything.
- `Access-Control-Allow-Headers` now includes `X-Upload-Secret`.

**Front end** — new `src/lib/workerClient.js`; all nine call sites now go
through it.
- The key is **not in the bundle** (the bundle is public, so anything in it
  is public). The operator types it once per browser session; it lives in
  `sessionStorage` and dies with the tab. Verified: the built JS contains
  only the storage key *name*, no secret value.
- A 401 clears the stored key and re-prompts once, so a typo is recoverable.
- Background calls on page load (`appData.js`) pass `promptIfMissing: false`
  — someone only reading the dashboard is never interrupted.
- The "Download the current workbook" link became a button: an `<a href>`
  cannot carry a header, so it fetches and hands over a blob.

## Deploy order — worker first

The dashboard *displays* fine either way: it reads the workbook as a static
asset and never touches the worker. Only edits, uploads and the check sheets
go through it. So closing the worker first leaves a short window where those
write features 401 until the front end ships — which is the right trade, and
the hole shuts immediately.

### 1. Pick a key and set it
```bash
cd upload-worker
openssl rand -base64 24          # generate one, save it in your password manager
npx wrangler secret put UPLOAD_SECRET
```

### 2. Deploy the worker
```bash
npx wrangler deploy
```

### 3. Confirm it is closed
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://cde-data-upload.fkw24.workers.dev/download
# expect 401

curl -s -o /dev/null -w '%{http_code}\n' \
  -H "X-Upload-Secret: <your key>" \
  https://cde-data-upload.fkw24.workers.dev/download
# expect 200
```

### 4. Ship the front end
```bash
cd ..
git add -A && git commit -m "Require an access key for all upload-worker routes"
git push
```
`deploy.yml` rebuilds and publishes to `gh-pages`.

### 5. Check it end to end
Open the dashboard, go to Update data, try an upload. You should be prompted
for the key once, then it should behave exactly as before.

### 6. Give the key to the manager and staff
Send it out of band — not in the same channel as the dashboard link.

## What this does and does not fix

**Fixed:** a stranger who knows the worker URL can no longer read CDE's
workbook or write to the repo.

**Not fixed:**
- The repo is still public, with ~130 P&L exports in history
- `www.kwanfelix.me/excel-dashboard/` still serves the workbook to anyone
- Anyone who watches an authorised person's browser session can read the key
  out of `sessionStorage`

Those need the full move in `MIGRATION.md`. This step buys time; it is not
the destination.
