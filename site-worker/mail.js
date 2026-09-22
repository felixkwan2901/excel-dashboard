// Sending the sign-in code.
//
// Two providers, because they ask for different things and the difference is
// the whole reason this file has a choice in it:
//
//   Mailjet  verifies a single sender ADDRESS. You click a link in your own
//            inbox and you are done — no domain, no DNS. Free: 200 a day.
//   Resend   verifies a DOMAIN. Three DNS records, and in exchange the mail is
//            signed with DKIM. Free: 100 a day, 3,000 a month.
//
// Whichever has credentials set is the one used; Resend wins if both do. With
// neither set, emailEnabled() is false and the login page does not offer the
// email route at all — which is what makes this safe to deploy before any of
// it is configured.
//
// Cloudflare's own Email Sending is not an option here: it is on the Workers
// Paid plan except when sending to addresses already verified in the account.
//
// Wiring, all on the Worker:
//   MAIL_FROM            var     "Cassidy-Davies Dashboard <you@example.com>"
//   MAILJET_API_KEY      secret  } both needed for Mailjet
//   MAILJET_SECRET_KEY   secret  }
//   RESEND_API_KEY       secret  for Resend instead
//
// A NOTE ON THE MAILJET ROUTE, because it will eventually explain a support
// call: a sender address with no domain behind it has no SPF and no DKIM, so
// the receiving server has nothing to check. Microsoft 365 — which is what
// @cdelectrical.co.nz is — treats that unfavourably, and a code in the Junk
// folder is indistinguishable from a code that never came. The password login
// is the fallback for exactly that morning, and it is why it was kept.

const hasMailjet = (env) => Boolean(env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY)

export const emailEnabled = (env) =>
  Boolean(env.MAIL_FROM) && (Boolean(env.RESEND_API_KEY) || hasMailjet(env))

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Resend takes the whole "Name <addr>" string; Mailjet wants the two halves
// separately. One MAIL_FROM either way, split here rather than asking whoever
// configures this to know which provider wants which shape.
export function parseFrom(from) {
  const s = String(from ?? '').trim()
  const m = s.match(/^\s*(.*?)\s*<\s*([^<>\s]+)\s*>\s*$/)
  if (m) return { name: m[1].replace(/^"|"$/g, ''), email: m[2] }
  return { name: '', email: s }
}

function body(code, minutes) {
  return {
    subject: `${code} is your dashboard sign-in code`,
    text: [
      `Your sign-in code is ${code}`,
      '',
      `It works for the next ${minutes} minutes.`,
      '',
      'If you did not try to sign in, you can ignore this — the code is',
      'useless without the page that asked for it.',
    ].join('\n'),
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f8;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0c1712">
<div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:32px 28px">
  <p style="margin:0 0 4px;font-size:13px;color:#6b7c73">Cassidy-Davies Electrical</p>
  <h1 style="margin:0 0 20px;font-size:20px;letter-spacing:-0.02em">Your sign-in code</h1>
  <p style="margin:0 0 20px;font-size:34px;font-weight:700;letter-spacing:0.14em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escape(code)}</p>
  <p style="margin:0 0 16px;color:#44554c;font-size:14px">It works for the next ${minutes} minutes.</p>
  <p style="margin:0;color:#6b7c73;font-size:13px">If you did not try to sign in, you can ignore this &mdash; the code is useless without the page that asked for it.</p>
</div></body></html>`,
  }
}

// The code goes in the subject line as well as the body. Most phones show
// enough of the subject in the notification to read it without opening
// anything, which removes the slowest step of the whole flow.
export async function sendLoginCode(env, { to, code, minutes = 10 }) {
  const { subject, text, html } = body(code, minutes)
  const from = parseFrom(env.MAIL_FROM)

  const res = env.RESEND_API_KEY
    ? await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html }),
      })
    : await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Messages: [{
            From: { Email: from.email, ...(from.name ? { Name: from.name } : {}) },
            To: [{ Email: to }],
            Subject: subject,
            TextPart: text,
            HTMLPart: html,
          }],
        }),
      })

  // Mailjet answers 200 with a per-message status inside, so an HTTP 200 is
  // not on its own proof that anything was sent. An unverified sender comes
  // back exactly this way.
  if (res.ok && !env.RESEND_API_KEY) {
    const payload = await res.json().catch(() => null)
    const status = payload?.Messages?.[0]?.Status
    if (status !== 'success') {
      console.error('mailjet send rejected', JSON.stringify(payload)?.slice(0, 500))
      return { ok: false, status: 200 }
    }
    return { ok: true }
  }

  if (res.ok) return { ok: true }

  // The failures worth reading: an unverified sender, a revoked key, a daily
  // cap. None of that should reach the person signing in, all of it should
  // reach the log.
  const detail = await res.text().catch(() => '')
  console.error('mail send failed', res.status, detail.slice(0, 500))
  return { ok: false, status: res.status }
}
