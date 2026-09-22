// The login page. Self-contained — it is served before any asset is allowed
// through, so it cannot reference the built site's CSS or fonts.
//
// Three states, one page:
//   'email'    ask for the work address           (the default, when email is set up)
//   'code'     ask for the six digits just sent
//   'password' the name-and-password form         (the fallback, and the only
//              form at all when RESEND_API_KEY is unset)
//
// No client-side JavaScript. Each step is a form post that renders the next
// one, which means the flow works on a phone with a dying connection, in a
// locked-down browser, and in the one place that matters most — the browser
// that opens a link out of an email client.

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const STYLE = `
  :root { --ink:#0c1712; --card:#16261e; --line:#24382d; --brand:#41b44a;
          --text:#ffffff; --muted:#8fa398; --bad:#ef6c1f; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center;
         background:var(--ink); color:var(--text); padding:24px;
         font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  .card { width:100%; max-width:380px; background:var(--card);
          border:1px solid var(--line); border-radius:16px; padding:32px 28px; }
  .mark { display:flex; align-items:center; gap:10px; margin-bottom:26px; }
  .dot { width:26px; height:26px; border-radius:8px; background:var(--brand); flex:none; }
  .mark b { font-size:15px; font-weight:600; letter-spacing:-0.01em; }
  .mark span { display:block; font-size:12px; color:var(--muted); font-weight:400; }
  h1 { margin:0 0 4px; font-size:22px; letter-spacing:-0.02em; }
  p.sub { margin:0 0 22px; color:var(--muted); font-size:14px; }
  p.sub b { color:var(--text); font-weight:600; }
  label { display:block; font-size:13px; color:var(--muted); margin:0 0 6px; }
  input { width:100%; padding:12px 14px; margin-bottom:16px; font-size:16px;
          color:var(--text); background:#0e1a15; border:1px solid var(--line);
          border-radius:10px; }
  input:focus { outline:2px solid var(--brand); outline-offset:1px; border-color:transparent; }
  input.code { font-size:28px; font-weight:600; letter-spacing:0.34em; text-align:center;
               font-family:ui-monospace, SFMono-Regular, Menlo, monospace; padding:14px 8px; }
  button { width:100%; padding:13px; font-size:16px; font-weight:600; cursor:pointer;
           color:#04170c; background:var(--brand); border:0; border-radius:10px; }
  button:hover { filter:brightness(1.07); }
  .err { margin:0 0 18px; padding:11px 13px; border-radius:10px; font-size:14px;
         color:#ffd9c2; background:rgba(239,108,31,0.14); border:1px solid rgba(239,108,31,0.4); }
  .foot { margin:22px 0 0; font-size:12px; color:var(--muted); }
  .alt { margin:18px 0 0; text-align:center; font-size:13px; }
  .alt a { color:var(--muted); }
  .alt a:hover { color:var(--brand); }
`

const shell = (title, inner) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escape(title)} — Cassidy-Davies Electrical</title>
<style>${STYLE}</style>
</head>
<body>
  <main class="card">
    <div class="mark">
      <div class="dot"></div>
      <div><b>Cassidy-Davies</b><span>Electrical</span></div>
    </div>
${inner}
  </main>
</body>
</html>`

// The "use the other way instead" links have to carry `next` themselves. They
// are ordinary GETs, so the hidden field in the form they are leaving does not
// come with them, and without this a signed-out click on a deep link would
// always land back on the dashboard home after signing in.
const altLink = (signin, label, next) =>
  `<p class="alt"><a href="/?signin=${signin}&amp;next=${encodeURIComponent(next || '/')}">${escape(label)}</a></p>`

export function renderLogin({
  mode = 'password',
  error = '',
  notice = '',
  username = '',
  email = '',
  challenge = '',
  next = '/',
  emailEnabled = false,
} = {}) {
  const err = error ? `<p class="err">${escape(error)}</p>` : ''
  const hiddenNext = `<input type="hidden" name="next" value="${escape(next)}" />`

  if (mode === 'code') {
    return shell('Check your email', `
    <h1>Check your email</h1>
    <p class="sub">We sent a six-digit code to <b>${escape(email)}</b>. It works for ten minutes.</p>
    ${err}
    <form method="POST" action="/auth/verify" autocomplete="off">
      ${hiddenNext}
      <input type="hidden" name="challenge" value="${escape(challenge)}" />
      <input type="hidden" name="email" value="${escape(email)}" />
      <label for="code">Sign-in code</label>
      <input id="code" name="code" type="text" class="code" inputmode="numeric"
             pattern="[0-9]*" maxlength="6" autocomplete="one-time-code"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             required autofocus />
      <button type="submit">Sign in</button>
    </form>
    ${altLink('email', 'Send a new code', next)}
    <p class="foot">Nothing arrived? Check the junk folder, then ask the office that the address on your account is right.</p>`)
  }

  if (mode === 'email') {
    return shell('Sign in', `
    <h1>Sign in</h1>
    <p class="sub">The operations dashboard is not public. We'll email you a code.</p>
    ${err}
    ${notice ? `<p class="sub">${escape(notice)}</p>` : ''}
    <form method="POST" action="/auth/code" autocomplete="on">
      ${hiddenNext}
      <label for="email">Your work email</label>
      <input id="email" name="email" type="email" value="${escape(email)}"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             autocomplete="email" required autofocus />
      <button type="submit">Email me a code</button>
    </form>
    ${altLink('password', 'Use a password instead', next)}
    <p class="foot">Ask the office if you need an account.</p>`)
  }

  return shell('Sign in', `
    <h1>Sign in</h1>
    <p class="sub">The operations dashboard is not public.</p>
    ${err}
    <form method="POST" action="/auth/login" autocomplete="on">
      ${hiddenNext}
      <label for="username">Your name</label>
      <input id="username" name="username" type="text" value="${escape(username)}"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             autocomplete="username" required autofocus />
      <label for="password">Password</label>
      <input id="password" name="password" type="password"
             autocomplete="current-password" required />
      <button type="submit">Sign in</button>
    </form>
    ${emailEnabled ? altLink('email', 'Email me a code instead', next) : ''}
    <p class="foot">Ask the office if you need an account or a reset.</p>`)
}
