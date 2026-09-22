# Moving the dashboard behind real auth

**Status:** prepared, not executed. Nothing has been pushed.
**Prepared:** 1 Sep 2026

---

## Why

Three separate public exposures of Cassidy-Davies data, all live right now:

| # | What | Where |
|---|------|-------|
| 1 | 137 committed spreadsheets, incl. ~130 Profit & Loss exports | `github.com/felixkwan2901/excel-dashboard` (public repo) |
| 2 | The raw job workbook, downloadable with no auth | `www.kwanfelix.me/excel-dashboard/Cassidy_Davies_Electrical_BPMN_Data.xlsx` — returns 200, 145 KB |
| 3 | 30 built copies of the same workbook | `gh-pages` branch |
| 4 | **Unauthenticated write API** — see below | `cde-data-upload.fkw24.workers.dev` |

### #4 is the serious one

`upload-worker/src/index.js` dispatches straight to its route handlers with
no auth check of any kind, and sends `Access-Control-Allow-Origin: *`. The
open endpoints include `/upload`, `/upload-from-url`, `/replace`,
`/new-job`, `/archive-job`, `/main-sheet`, `/claim-calculator`,
`/upcoming-work`, `/command`, `/app-data` (GET and POST) and `/download`.
`GET /download` returns 200 to an anonymous request — verified.

The worker holds a `GITHUB_TOKEN` and commits with it. So anyone who has the
URL can write to the repo and change what the dashboard shows, not merely
read it. Read exposure leaks CDE's numbers; this one lets a stranger alter
them.

**Cloudflare Access on the dashboard does not cover this** — the worker is a
separate origin on `workers.dev`. It needs its own fix (step 3b).

A login screen in front of the app fixes none of these. The app reads the
workbook client-side, so the data ships with the page; and the repo is public
regardless of how the page is served.

**Root cause of #1:** `.gitignore` covered `/imports` and `/imports-archive`,
but the upload worker stages files under `pending-updates/imports-archive/`,
which no rule matched. Fixed in this branch.

---

## Options considered

| Option | Real auth? | Cost | Verdict |
|---|---|---|---|
| **Cloudflare Pages + Access** | Yes — email one-time PIN, per-user allowlist | Free (50 users) | **Recommended** |
| GitHub Pages + private repo | No — Pages goes offline entirely on free plans | — | Not viable |
| GitHub Pages + Cloudflare proxy + Access | Leaky — origin still reachable at `felixkwan2901.github.io/excel-dashboard/` | Free | Not viable |
| Netlify / Vercel password protection | Yes | Paid tier required | Works, costs money |
| Don't host it — hand CDE a local build | Yes, trivially | Free | Viable if only 1–2 people use it |
| Client-side password in the React app | **No** — the workbook is in the bundle, downloadable directly | Free | Security theatre |

Cloudflare Access wins because it gates *every* asset, including the `.xlsx`,
before anything reaches the browser.

---

## Steps

### 0. Make the repo private
```bash
gh repo edit felixkwan2901/excel-dashboard --visibility private --accept-visibility-change-consequences
```
Kills exposures #1 and #2 immediately. Also takes the dashboard offline —
GitHub Pages does not serve private repos on free plans. **Give CDE notice
first if anyone is relying on it.** Reversible.

### 1. Set up Cloudflare Pages
1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git
2. Pick `excel-dashboard`, branch `main`
3. Build command `npm run build`, output directory `dist`
4. Deploy once to confirm it builds

### 2. Serve from its own subdomain
- In `vite.config.js`, change `base: '/excel-dashboard/'` to `base: '/'`
  (it is no longer served from a subpath)
- Cloudflare Pages → project → Custom domains → add `dashboard.kwanfelix.me`
- At Namecheap, add the CNAME Cloudflare shows you

### 3. Turn on Access
1. Cloudflare → Zero Trust → Access → Applications → Add → Self-hosted
2. Domain: `dashboard.kwanfelix.me`
3. Policy: **Allow**, include → Emails → your address plus whoever at CDE needs it
4. Identity provider: One-time PIN (no accounts to create — they get a code by email)
5. Load the URL in a private window to confirm you are challenged

### 3b. Close the worker (do not skip)

> Status: the code half of this is done and tested. Steps 1-4 and 6 below are
> Cloudflare dashboard and DNS work; nothing in the worker enforces anything
> until `ACCESS_TEAM` and `ACCESS_AUD` are set (step 5).

Put the worker behind the same Access application instead of leaving it on a
public `workers.dev` URL:

1. In `upload-worker/wrangler.toml`, add `workers_dev = false` and a route on
   the protected host:
   ```toml
   workers_dev = false
   routes = [{ pattern = "dashboard.kwanfelix.me/api/*", zone_name = "kwanfelix.me" }]
   ```
   This requires `kwanfelix.me` to be a zone in your Cloudflare account —
   moving the nameservers from Namecheap to Cloudflare. Do that as part of
   step 2.
2. Point the front end at the new path: in `src/lib/pollStagedStatus.js`
   (and anywhere else `UPLOAD_WORKER_URL` appears), change the constant to
   `/api`. Same origin, so the Access cookie rides along automatically.
3. Narrow CORS: replace `'Access-Control-Allow-Origin': '*'` in
   `upload-worker/src/index.js` with the dashboard origin.
4. Redeploy the worker, then confirm the old URL is dead:
   ```bash
   curl -i https://cde-data-upload.fkw24.workers.dev/download
   ```
5. Turn on the worker's own Access check. `verifyAccessJwt()` in
   `upload-worker/src/index.js` is already written and tested
   (`scripts/__tests__/access-jwt.test.mjs`, 12 cases), and is a no-op until
   both of these are set:
   ```bash
   cd upload-worker
   npx wrangler secret put ACCESS_TEAM   # your team name, e.g. cassidydavies
   npx wrangler secret put ACCESS_AUD    # the application's Audience tag
   npx wrangler deploy
   ```
   Find the Audience tag under Zero Trust → Access → Applications → your app →
   Overview. This matters even after step 1: Access guards a hostname, and it
   cannot guard `*.workers.dev`, because that is not on a zone. Without this
   check the worker would still answer anyone who kept the old URL. With it,
   a request arriving there carries no Access JWT and is refused.

6. Set up a **service token** for the weekly upload, which is the reason the
   old shared-key gate was switched off — it runs unattended and cannot be
   prompted for anything:
   1. Zero Trust → Access → Service Auth → Create Service Token. Copy the
      Client ID and Client Secret; the secret is shown once.
   2. On the application's policy, add a second rule: **Service Auth**,
      include → Service Token → the one you just made.
   3. Have the upload send both headers:
      ```
      CF-Access-Client-Id: <id>.access
      CF-Access-Client-Secret: <secret>
      ```
      Access then mints a JWT whose `common_name` is the token's name, so
      `verifyAccessJwt()` accepts it and the audit log shows which token did
      what. Keep the secret out of the repo — environment variable or
      keychain on the office machine.
   4. Never put a service token in the dashboard or CDE Field bundle. Both are
      public static files; a secret shipped in one is not a secret. Those two
      use the human login from step 3.

7. Consider rotating the worker's `GITHUB_TOKEN`. To be accurate: the open
   endpoint did **not** expose the token itself — Workers secrets are not
   readable over HTTP, and no route echoes `env`. Rotation is hygiene after a
   long-running open write path, not incident response.

### 4. Switch the deploy over
- `git rm .github/workflows/deploy.yml`
- `mv .github/workflows/deploy-cloudflare.yml.disabled .github/workflows/deploy-cloudflare.yml`
- Add repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- Push and confirm the run succeeds

### 5. Clean up
```bash
./scripts/purge-client-data.sh    # read it first — it rewrites history
git push origin --delete gh-pages
```
Then confirm the old URL is gone:
```bash
curl -I https://www.kwanfelix.me/excel-dashboard/
```

---

## Prepared in this branch

- `.gitignore` — closes the `pending-updates/` gap that leaked the P&L files
- `scripts/purge-client-data.sh` — untracks the data and strips it from history
  (backs up first; does not push)
- `.github/workflows/deploy-cloudflare.yml.disabled` — the replacement workflow

## The pipeline commits client data by design

The weekly flow is: someone uploads a P&L export on the site -> the worker
commits it under `pending-updates/` -> `process-pending-updates.yml` merges it
into `public/Cassidy_Davies_Electrical_BPMN_Data.xlsx` and syncs that to
`gh-pages`. Client data landing in git is not an accident; it is how the
system works.

That means **the repo cannot stay public**. There is no `.gitignore` tuning
that fixes it, because the merged workbook must be committed for the site to
read it. Step 0 is mandatory, not optional.

What the `.gitignore` change *does* fix is the incidental stuff: the dated
`imports-archive/` and the `results/` records. Both are write-only —
`update-jobs.mjs` moves processed files into the archive and writes a result
record, and nothing reads either back (upload status polling checks for
presence in `pending-updates/` and `pending-updates/failed/`, not
`results/`). Safe to stop committing, safe to purge.

`pending-updates/exports/` is deliberately left tracked — the worker stages
there and the workflow must see it.

## Still to decide

- Timing of step 0 against CDE's use of the dashboard
- ~~Who goes on the Access allowlist~~ — the manager and a few staff; addresses to be collected at setup time
- ~~Whether the archived P&L exports are needed~~ — confirmed disposable:
  write-only scratch from the weekly upload. Now gitignored and included in
  the purge.
- Whether to move `kwanfelix.me` DNS to Cloudflare (needed for step 3b)
