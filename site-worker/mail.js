// Sending the sign-in code.
//
// Resend, because its free tier (3,000 a month, 100 a day) is far more than a
// handful of people signing in, and because it is a single HTTPS call with no
// SDK — which matters in a Worker. Cloudflare's own Email Sending was the
// obvious first choice and is not free for this: it is on the Workers Paid
// plan except when sending to addresses already verified in the account.
//
// Wiring, all on the Worker rather than in this file:
//   RESEND_API_KEY  secret  — wrangler secret put RESEND_API_KEY
//   MAIL_FROM       var     — e.g. "Cassidy-Davies Dashboard <dashboard@example.com>"
//
// Whatever domain MAIL_FROM uses has to be verified in Resend. That is the one
// hard requirement of email sign-in, and it is about the sending address only:
// the site itself can stay on a workers.dev URL, because a typed six-digit code
// does not care where it is typed.
//
// With RESEND_API_KEY unset, emailEnabled() is false and the login page simply
// does not offer the email route. That is deliberate — it means this can ship
// before the domain is verified without anyone being locked out.

export const emailEnabled = (env) => Boolean(env.RESEND_API_KEY && env.MAIL_FROM)

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// The code goes in the subject line as well as the body. Most phones show
// enough of the subject in the notification to read it without opening
// anything, which removes the slowest step of the whole flow.
export async function sendLoginCode(env, { to, code, minutes = 10 }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
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
    }),
  })

  if (res.ok) return { ok: true }

  // Resend's failures are the ones worth reading: an unverified domain, a
  // revoked key, a daily cap. None of that should reach the person signing in,
  // but all of it should reach the log.
  const detail = await res.text().catch(() => '')
  console.error('resend send failed', res.status, detail.slice(0, 500))
  return { ok: false, status: res.status }
}
