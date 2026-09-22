% Moving the dashboard to Cassidy-Davies
% Cloudflare, Mailjet and GitHub — a step-by-step handover
% 22 September 2026

# What is in this guide

1. **Before anything else** — the two facts that shape the whole move
2. **Step 0** — take a backup
3. **Part A — Cloudflare** — the KV namespace, the Workers, the secrets, the data
4. **Part B — Mailjet** — verifying a sender and sending the first code
5. **Part C — GitHub** — transferring both repositories
6. **Part D** — adding the other five people
7. **Part E** — retiring the old setup
8. **After the move** — the checklist to work through
9. **Things that will break if forgotten**
10. **Quick reference** — every command in one place

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# Before anything else

**Read this page first.** Two facts shape everything below.

**1. Cloudflare Workers and KV namespaces cannot be transferred between
accounts.** There is no "transfer ownership" button. The move is: stand the
same thing up fresh on the company account, copy the data across, then retire
the old one. That is why this guide is longer than it looks like it should be.

**2. Secrets cannot be read back, only replaced.** Cloudflare will show you
that a secret exists but never what it contains. Every secret has to be set
again by hand on the new account, so have the values ready before you start.

## What you are moving

| Thing | Where it is now | Moves by |
|---|---|---|
| Dashboard site + login | Worker `cd-dashboard` | Recreating it |
| The data | KV namespace `APP_DATA`, 28 keys | Backup and restore |
| Upload/automation API | Worker `cde-data-upload` | Recreating it |
| Sign-in emails | Mailjet account | New account, new keys |
| Dashboard code | `github.com/felixkwan2901/excel-dashboard` | Repo transfer |
| Field app code | `github.com/felixkwan2901/cde-field` | Repo transfer |
| Old public copy | `kwanfelix.me/excel-dashboard` | Turned off at the end |

The Cloudflare account it all sits in today is **fkw24@uclive.ac.nz**
(account ID `dc836f801a754ca49cb4ea1290935614`). It is a personal student
account with nothing else in it.

## What the company needs before you start

- A **Cloudflare account** of their own. The free plan is enough.
- A **GitHub account or organisation** to receive both repositories.
- A **Mailjet account** of their own, on the free plan.
- An **email address they can open** to verify as the Mailjet sender.
- About **two hours**, and nobody urgently needing the dashboard.

Do the whole move in one sitting if you can. Half-moved is the one state with
real failure modes in it.

---

# Step 0 — Take a backup

Do this first, every time, before touching anything.

```
cd ~/excel-dashboard
node scripts/backup-kv.mjs ~/Desktop/kv-backup-before-move
```

It writes one JSON file per key. Check you got roughly 28 files:

```
ls ~/Desktop/kv-backup-before-move | wc -l
```

KV has no version history and no undo. This backup is the only way back from
a mistake, so do not skip it and do not overwrite it later.

---

# Part A — Cloudflare

## A1. Create the KV namespace

Log in to `wrangler` as the **company** account:

```
cd ~/excel-dashboard
npx wrangler logout
npx wrangler login
```

Confirm it took, before going further:

```
npx wrangler whoami
```

It must show the company account, not `fkw24@uclive.ac.nz`. Then:

```
npx wrangler kv namespace create APP_DATA
```

It prints a new namespace ID. **Copy it.**

## A2. Point the config at it

Open `wrangler.jsonc` and replace the old ID with the new one:

```
"kv_namespaces": [
  { "binding": "APP_DATA", "id": "<the new id>" }
]
```

The same ID is also hard-coded near the top of `scripts/manage-users.mjs`
(the `NS` constant). Change it there too, or user management will keep
writing to the old account's store and logins will not behave.

## A3. Deploy the Worker

```
APP_BASE=/ VITE_API_BASE=/api PWA_SELF_DESTROY=1 npm run build
npx wrangler deploy
```

All three environment variables matter:

- `APP_BASE=/` — the site is served from the root here, not a repo subpath.
- `VITE_API_BASE=/api` — the browser talks to this Worker, not the old one.
- `PWA_SELF_DESTROY=1` — ships a service worker that removes itself. Without
  it, the cached app shell is served to signed-out browsers instead of the
  login page and the page sits in a reload loop. This is not optional.

Note the new URL it prints — something like
`https://cd-dashboard.<company>.workers.dev`.

## A4. Set the secrets

Four of them. Each command prompts for the value; the input is hidden, which
is normal.

```
npx wrangler secret put SESSION_SECRET
npx wrangler secret put MAILJET_API_KEY
npx wrangler secret put MAILJET_SECRET_KEY
npx wrangler secret put MAIL_FROM
```

**`SESSION_SECRET`** signs the login cookies. Generate a fresh one — do not
reuse the old:

```
openssl rand -base64 32
```

Changing it signs everyone out, which on a move is exactly what you want.

The three `MAIL*` values come from Part B. If you have not done Mailjet yet,
set `SESSION_SECRET` now and come back for the others — the site works on
passwords alone in the meantime.

## A5. Restore the data

```
./scripts/restore-kv.sh ~/Desktop/kv-backup-before-move \
    https://cde-data-upload.<company>.workers.dev --dry-run
```

Read what the dry run says it will write. Then run it again **without**
`--dry-run`.

This restores through the upload Worker, so A6 has to be done first if you
want the data in before anyone signs in. Doing A6 first is usually easier.

## A6. Recreate the upload Worker

The second Worker handles the weekly spreadsheet upload and the automation.

```
cd upload-worker
```

Put the new KV namespace ID in its `wrangler.toml`, then:

```
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GEMINI_API_KEY
```

**The `GITHUB_TOKEN` currently in use belongs to a personal GitHub account.**
It is what the weekly pipeline commits with. When that account lapses the
updates stop, and the symptom will look like "the site stopped updating"
rather than "a token expired". Issue a company token, set it here, and revoke
the old one.

## A7. Repoint the dashboard

`UPLOAD_WORKER` near the top of `site-worker/index.js` still names the old
upload Worker. Change it to the new URL and deploy again.

Do the same for `WORKER` in `cde-field/src/lib/workerClient.js`, and
`VITE_DASHBOARD_URL` if the field app's "Open the dashboard" link should point
at the new address.

---

# Part B — Mailjet

Sign-in codes are sent through Mailjet. It has nothing to do with Cloudflare,
so it can be done before, during or after Part A.

## B1. Verify a sender address

Create the company's own Mailjet account, then:

**My Account → Add a Sender Domain or Address → Add a Sender Address**

Enter an address someone can open, and click the link Mailjet sends. That is
the whole verification. No DNS records, no domain required.

**Do not verify an `@cdelectrical.co.nz` address as the sender.** Mail
claiming to come from `cdelectrical.co.nz` without an SPF record authorising
Mailjet looks exactly like spoofing, and Microsoft 365 will treat it far more
harshly than an ordinary outside address. Sending *to* company addresses is
fine. Sending *as* one is the trap.

## B2. Get both keys

**Account Settings → API Key Management.** You need two values:

- **API Key** — the public one
- **Secret Key** — shown once only, so copy it immediately

## B3. Give them to the Worker

```
npx wrangler secret put MAILJET_API_KEY
npx wrangler secret put MAILJET_SECRET_KEY
npx wrangler secret put MAIL_FROM
```

`MAIL_FROM` is the address codes are sent *from*, written like this:

```
Cassidy-Davies Dashboard <the.verified.address@example.com>
```

The address inside the angle brackets must match what Mailjet verified
**exactly**, or every send is rejected.

## B4. Check it worked

Open the site signed out, enter an address that is on an account, and ask for
a code. Then watch the Worker's own log:

```
npx wrangler tail --format pretty
```

A successful request logs `POST /auth/code - Ok` and nothing else. If Mailjet
refused the message, the reason is logged in full — an unverified sender, a
`MAIL_FROM` that does not match, or an account not yet cleared to send.

## B5. If codes land in Junk

This is the known cost of verifying an address instead of a domain: there is
no DKIM signature, so the receiving server has nothing to check. Microsoft 365
is strict about that.

If it becomes a nuisance, the fix is to verify a real domain. The Worker
already supports Resend, which is domain-based: add `RESEND_API_KEY` instead
of the two Mailjet keys, point `MAIL_FROM` at the verified domain, and
redeploy. No code changes.

---

# Part C — GitHub

## C1. Transfer both repositories

For **`excel-dashboard`** and **`cde-field`**:

**Settings → General → Danger Zone → Transfer ownership**

Transfers keep the history and leave redirects behind.

## C2. Check what did not come with them

After each transfer, confirm:

- **Pages** is still enabled, if that copy is still wanted
- **Actions secrets** are present — they do not always survive a transfer
- The **`gh-pages` branch** still exists

## C3. Consider making them private

The repositories are public today. That matters because the old public site
and its data are served from them. Note that **GitHub Pages will not serve a
private repository on a free plan** — so private and Pages together needs a
paid plan. Decide which you want before flipping it.

---

# Part D — Adding the other five people

There are two ways to add someone, and the first is almost always the one you
want.

## With an email address — no password at all

```
cd ~/excel-dashboard
node scripts/manage-users.mjs invite jane jane@cdelectrical.co.nz "Jane Smith"
```

That account has no password. The only way in is a code sent to that address,
which means there is nothing to invent, nothing to send them, and nothing for
them to forget. Tell them to go to the dashboard, enter their address, and
type the six digits.

A password you have to text or email someone is a worse secret than no
password, which is the whole reason this option exists.

## With a password

For anyone without a usable email address:

```
node scripts/manage-users.mjs add jane "Jane Smith"
```

It prompts twice, hidden. Minimum twelve characters. You then have to get that
password to them somehow, which is the part with no good answer — so prefer
`invite` when you can.

Either kind can be changed later: `passwd` adds or replaces a password,
`email` adds or removes an address.

Other commands:

| Command | What it does |
|---|---|
| `list` | Everyone, their address, and their session version |
| `invite <user> <address>` | Add someone with an address and no password |
| `passwd <user>` | Change a password and sign them out everywhere |
| `email <user> <address>` | Set or change the address; `""` removes it |
| `revoke <user>` | Sign them out everywhere; password still works |
| `remove <user>` | Delete the account entirely |

Two things worth knowing:

- **One address per account.** Two accounts cannot share an address.
- **Changes take up to a minute** to take effect, because the user list is
  cached at the edge. Signing in uses the live list, so a new account works
  immediately even though a revoke takes a moment.

---

# Part E — Retiring the old setup

Only once the new one is confirmed working.

1. Turn off **GitHub Pages** on the personal repository
2. Delete the **`cd-dashboard`** and **`cde-data-upload`** Workers on the
   personal Cloudflare account
3. Revoke the personal **GitHub token** and any personal **Mailjet** keys
4. Repoint whatever runs the **weekly upload** on the office computer — it
   still names the old Worker URL and will fail silently once that Worker is
   gone

Confirm they are actually dead:

```
curl -I https://www.kwanfelix.me/excel-dashboard/
curl -I https://cde-data-upload.fkw24.workers.dev/
```

---

# After the move — the checklist

Work through all of these before calling it done.

- [ ] `npx wrangler whoami` shows the company account
- [ ] The new dashboard URL shows the **login page**, not the dashboard
- [ ] Signing in with a password works
- [ ] Signing in with an emailed code works, and the code reaches the inbox
- [ ] The workbook and `/api/whoami` both return **401** when signed out
- [ ] The dashboard shows the real data — the restore worked
- [ ] The field app opens and can record progress
- [ ] The weekly upload runs and the dashboard updates
- [ ] A fresh backup has been taken **from the new account**

## Order matters

New host up → data restored → sign-in tested → uploader repointed → old host
retired.

Retiring the old one first breaks the tool with nothing ready to replace it.

---

# Things that will break if forgotten

**The `GITHUB_TOKEN` belongs to a personal account.** When it lapses, the
weekly update stops and it will look like a website fault.

**`PWA_SELF_DESTROY=1` must stay set** in the build and in
`.github/workflows/deploy.yml`. Without it the login page never renders for a
signed-out browser and the page sits in a reload loop.

**The KV namespace ID appears in two places** — `wrangler.jsonc` and
`scripts/manage-users.mjs`. Changing only one is a confusing failure: the site
works, but user management writes to the wrong store.

**`MAIL_FROM` must match the verified sender exactly.** A trailing space or a
different capitalisation is enough for Mailjet to refuse every message.

**Nobody can read a secret back.** Write the values down somewhere the company
controls before you start, because Cloudflare will not tell you them later.

---

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# Quick reference

```
# who am I logged in as
npx wrangler whoami

# back up the data
node scripts/backup-kv.mjs ~/Desktop/kv-backup-$(date +%Y%m%d)

# restore it
./scripts/restore-kv.sh <dir> <upload-worker-url> --dry-run
./scripts/restore-kv.sh <dir> <upload-worker-url>

# build and deploy the dashboard
APP_BASE=/ VITE_API_BASE=/api PWA_SELF_DESTROY=1 npm run build
npx wrangler deploy

# secrets
npx wrangler secret list
npx wrangler secret put <NAME>

# users
node scripts/manage-users.mjs list
node scripts/manage-users.mjs add <user> "Full Name"
node scripts/manage-users.mjs email <user> <address>
node scripts/manage-users.mjs revoke <user>

# watch what the Worker is doing
npx wrangler tail --format pretty
```
