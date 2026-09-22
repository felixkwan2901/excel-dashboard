# Moving the dashboard onto Cassidy-Davies infrastructure

Companion to MIGRATION.md. That one was "put it behind a login"; this one is
"make it theirs". The security fix and the ownership fix are the same move,
so do them together rather than twice.

## Why both at once

Today every layer belongs to a personal account:

| Layer | Owner now | Should be |
|---|---|---|
| Domain | `kwanfelix.me` | `cdelectrical.co.nz` |
| Code | personal GitHub, **public** | company GitHub, private |
| Hosting | personal GitHub Pages | company Cloudflare Pages |
| Upload API | personal Cloudflare Worker | company Cloudflare Worker |
| Data | personal repo | company repo |
| Access control | none | company Cloudflare Access |

Fixing only the security leaves the company's operations tool dependent on a
student's accounts. Fixing only the ownership leaves the data public. One
move settles both.

## Blocked on the company — cannot be done without them

1. **A decision from the manager** (see HANDOVER-MESSAGE.md)
2. **A Cloudflare account owned by Cassidy-Davies** — free tier is enough
3. **Access to `cdelectrical.co.nz` DNS** — one CNAME record. DNS is at
   **1st Domains** (`ns1/ns2.1stdomains.net.nz`), not in WordPress and not at
   the web host. See "The DNS record" below before anyone touches it.
4. **A company GitHub account or organisation** to receive **both** repos —
   `excel-dashboard` and `cde-field`
5. **Email addresses** for the Access allowlist

None of these are things a contractor should create on the company's behalf
using their own identity. They must own the accounts, or the same problem
recurs one layer down.

## Ready now — done, no decision required

- **The app is host-portable.** `vite.config.js` reads its base path from
  `APP_BASE`; everything in `src/` already resolved assets through
  `import.meta.env.BASE_URL`. Verified both ways:
  - `npm run build` -> `/excel-dashboard/...` (unchanged, current host)
  - `APP_BASE=/ npm run build` -> `/assets/...` (a domain of its own)
- ~~The upload API requires a key~~ — **no longer true.** The gate is
  switched off (the weekly upload runs unattended and cannot be prompted).
  `verifyAccessJwt()` in the Worker replaces it and is written and tested,
  but inert until `ACCESS_TEAM` and `ACCESS_AUD` are set. See MIGRATION.md.
- `.gitignore` no longer lets client data be committed by accident
- `scripts/purge-client-data.sh` is written and ready to run
- `.github/workflows/deploy-cloudflare.yml.disabled` is written and ready

## The DNS record

DNS for `cdelectrical.co.nz` is answered by **1st Domains**
(`ns1/ns2.1stdomains.net.nz`). It is not managed in WordPress — WordPress is
just the CMS on the web host (`s1.fweb.co.nz`). Logging into wp-admin will
not show you a DNS panel, because there isn't one there.

Whoever holds the 1st Domains account adds **one record**:

```
Type    CNAME
Name    ops
Value   felixkwan2901.github.io.     (or the company GitHub user, after transfer)
TTL     default
```

Then in the repo: Settings -> Pages -> Custom domain -> `ops.cdelectrical.co.nz`
-> Enforce HTTPS. GitHub issues the certificate. Build with `APP_BASE=/`.

`cde-field` gets its own, because it is a separate repo: `field` -> the same
CNAME target, same repo setting, same `APP_BASE=/`.

### Do not move the nameservers

This domain carries the company's **Microsoft 365 email** and Simpro:

```
MX     cdelectrical-co-nz.mail.protection.outlook.com
SPF    include:spf.protection.outlook.com, include:hosting.fweb.co.nz,
       a:chi-web-01.simprocloud.com
DKIM   selector1._domainkey -> ...cdelectricalnz.onmicrosoft.com
       autodiscover -> autodiscover.outlook.com
```

Adding a subdomain touches none of that and is reversible by deleting one
record. Moving the zone to Cloudflare re-hosts all of it, and a missed
`autodiscover` or DKIM selector means company email breaks. That trade is
only worth making if they want Cloudflare Access, and it is an IT decision,
not an intern decision.

**Consequence worth stating plainly:** the GitHub Pages route below gets the
dashboard onto a company address, but it does **not** put Access in front of
anything. The Worker stays open either way until the zone question is
settled.

## Handing over the accounts

### Cloudflare — recreate, do not transfer

Workers and KV namespaces cannot be moved between Cloudflare accounts. The
current ones live in a personal account (`fkw24@uclive.ac.nz`, account
`dc836f801a754ca49cb4ea1290935614`) which has no zones and nothing else in
it. On a company account:

```bash
# 1. new KV namespace, then put its id in upload-worker/wrangler.toml
npx wrangler kv namespace create APP_DATA

# 2. deploy the Worker there
cd upload-worker && npx wrangler deploy

# 3. take a fresh snapshot from the old Worker, then push it into the new one
node scripts/backup-kv.mjs kv-handover
./scripts/restore-kv.sh kv-handover https://cde-data-upload.<new>.workers.dev --dry-run
./scripts/restore-kv.sh kv-handover https://cde-data-upload.<new>.workers.dev
```

Then update `UPLOAD_WORKER_URL` in `excel-dashboard/src/lib/workerClient.js`
and `WORKER` in `cde-field/src/lib/workerClient.js`, and redeploy both.

**The Worker holds a GitHub token that belongs to the intern.** It is what
the pipeline commits with. When that account lapses the weekly update stops,
and the failure will look like "the site stopped updating" rather than
"a token expired". Issue a company token, set it with
`npx wrangler secret put GITHUB_TOKEN`, and revoke the old one.

### GitHub — transfer, then re-check

Settings -> General -> Transfer ownership, for **both** `excel-dashboard`
and `cde-field`. Transfers keep history and leave redirects behind.

After each transfer, check: Pages is still enabled and the custom domain
survived; Actions secrets are present (they do not always come across);
and the `gh-pages` branch still exists.

Going private closes the public exposure of the Worker URL — but GitHub
Pages will not serve a private repo on a free plan, so private plus Pages
needs a paid plan. Decide which matters more before flipping it.

### The list of things to hand over

| Thing | Where it is now | Goes to |
|---|---|---|
| `excel-dashboard` repo | github.com/felixkwan2901 | company GitHub |
| `cde-field` repo | github.com/felixkwan2901 | company GitHub |
| Worker + KV | personal Cloudflare account | company Cloudflare account |
| `GITHUB_TOKEN` in the Worker | intern's PAT | company PAT, old one revoked |
| Hosting address | `kwanfelix.me` (intern's domain) | `ops.cdelectrical.co.nz` |
| Weekly upload script | office machine, points at old Worker URL | repoint |
| KV backups | `~/Desktop/Cassidy-Davies Electrical/kv-backup-*` | company file store |

## The move, once they have said yes

### 1. Repo
Transfer `excel-dashboard` to the company account (GitHub Settings ->
Transfer ownership) and **set it private in the same sitting**. Transferring
leaves redirects behind; going private is what actually closes the exposure.

Then strip the committed client data from history:
```bash
./scripts/purge-client-data.sh     # read it first; it rewrites history
git push origin --delete gh-pages  # 30 built copies of the workbook live here
```

### 2. Hosting
On the company Cloudflare account: Workers & Pages -> Create -> Pages ->
connect the repo.
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `APP_BASE` = `/`
- Custom domain: `ops.cdelectrical.co.nz`

Add the CNAME Cloudflare shows you at the company's DNS provider.

### 3. Access
Zero Trust -> Access -> Applications -> Add -> Self-hosted
- Domain: `ops.cdelectrical.co.nz`
- Policy: Allow -> Emails -> the manager and nominated staff
- Identity provider: One-time PIN (a code by email; no accounts to create)

Confirm in a private window that it challenges you.

### 4. Upload API
Redeploy the worker on the company account, then in
`upload-worker/wrangler.toml`:
```toml
workers_dev = false
routes = [{ pattern = "ops.cdelectrical.co.nz/api/*", zone_name = "cdelectrical.co.nz" }]
```
Point `UPLOAD_WORKER_URL` in `src/lib/workerClient.js` at `/api`. Same origin
means the Access session covers it and the typed key can go away entirely —
Access becomes the login, which is the better end state.

Set the secrets fresh on the company account: `GITHUB_TOKEN`,
`GEMINI_API_KEY`. Do not copy the personal ones across; issue new ones and
revoke the old.

### 5. Retire the old
- Turn off GitHub Pages on the personal repo
- Delete the personal `cde-data-upload` worker
- Confirm dead:
  ```bash
  curl -I https://www.kwanfelix.me/excel-dashboard/
  curl -I https://cde-data-upload.fkw24.workers.dev/
  ```

### 6. The weekly updater
Whatever runs on the office computer points at the old worker URL. Update it
to the new `/api` address. If it stays pointed at the old one it will fail
silently once that worker is deleted.

### 7. Hand over
Whoever maintains this next needs: the Cloudflare login, the GitHub repo, how
the weekly upload works, and where the data lives. Worth an hour and a page
of notes before the internship ends.

## Order matters

Repo private -> new host up -> Access on -> updater repointed -> old host
retired. Retiring the old host first breaks the tool with no replacement
ready; going private last leaves the data public through the whole move.
