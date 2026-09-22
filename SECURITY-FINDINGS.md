# Cloudflare Worker — security findings

**Scope:** `upload-worker/src/index.js`, deployed at `cde-data-upload.fkw24.workers.dev`.
**Method:** source review, not a live test. Nothing was sent to the production Worker to
produce this; every finding below is read off the code.
**Date:** 15 September 2026

---

## Summary

Every route on the Worker is unauthenticated. The access-key check is written, correct and
switched off at `src/index.js:912-917`, with a comment saying so. CORS is `Access-Control-Allow-Origin: *`
(`src/index.js:186`), so any web page on any domain can call it from a visitor's browser.

That was a deliberate decision, and a defensible one while the address was known only to one
person. Two things have changed it:

- The field app's URL is now generated into **printable QR codes intended for switchboard
  doors on client sites**, so the address is published at the point of work.
- Both URLs appear on the cover page of the internship report.

## What is exposed

All fourteen routes are open. Ranked by what they let a stranger do:

| Route | Effect |
|---|---|
| `GET /download` | Returns the current workbook. Every job's quoted price, cost, hours and margin, in one request. |
| `POST /replace` | Replaces the entire workbook. The dashboard then shows whatever was uploaded. |
| `POST /upload`, `/new-job`, `/archive-job`, `/main-sheet`, `/claim-calculator`, `/upcoming-work` | Write into the workbook: add, archive, or alter jobs and figures. |
| `POST /upload-from-url` | Makes the Worker fetch an arbitrary `http(s)` URL and merge the result. The only validation is that the URL starts with `http` and the filename ends `.xlsx` (`src/index.js:361-368`). Server-side request forgery, and an unauthenticated write path. |
| `POST /command` | Accepts a free-text instruction that drives edits. |
| `GET`/`POST /app-data` | Read and write every key on the allowlist: checklists, field progress, handover notes, staff roster, planning figures. |

The key-allowlist regex on `/app-data` limits *which* keys, not *who*.

## Impact in plain terms

1. **Disclosure.** One HTTP request returns the company's complete financial position per job.
   This is client-identifying: job names include client and site names.
2. **Integrity.** A single `POST /replace` silently changes every figure the office sees. The
   dashboard has no way to tell a legitimate upload from a hostile one, and the weekly process
   would carry the bad data forward.
3. **Attribution.** Field progress records carry `by: "<name>"` exactly as the phone sent it.
   Useful as a convenience; not evidence, and it should never become the basis of a payroll or
   dispute conversation.

## Recommended fix

Do **not** simply re-enable `UPLOAD_SECRET`. The field app would have to carry the key, and a
secret shipped inside a public web page is not a secret.

1. **Cloudflare Access in front of the Worker.** Free to 50 users, already anticipated in the
   code's own header comment and in `MIGRATION.md`. Gives per-person sign-in with no key in
   any page.
2. **Tighten CORS** from `*` to the two known origins.
3. **Remove or allowlist `/upload-from-url`.** It is the one route that is a problem even with
   authentication, because it turns the Worker into a fetch proxy.
4. Once Access is on, server-stamp the identity on field writes instead of trusting `by`.

Steps 2 and 3 are code changes I can make in about twenty minutes. Step 1 needs someone with
the Cloudflare account to click through the Access setup; it cannot be scripted from here.
