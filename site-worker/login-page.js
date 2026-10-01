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

// One real photo of Cassidy-Davies' own work, from their public site
// (cdelectrical.co.nz/projects/), as the left half of the page on a laptop and
// a short band across the top on a phone. One photo, not a tiled wall: a wall
// of six dimmed thumbnails read as wallpaper, and the seams between them were
// the first thing the eye found.
//
// Set as a CSS background-image on a div, not an <img>: if cdelectrical.co.nz
// is slow or down, a background that fails to load shows nothing and the
// panel's own dark fill takes over — an <img> in the same spot is a
// broken-image icon in the middle of the sign-in screen. This page has one
// job, and it cannot depend on the marketing site being up to do it.
const HERO_PHOTO = 'https://www.cdelectrical.co.nz/wp-content/uploads/2025/08/Koawa-Studio-Long.png'

// The company's own wordmark, hotlinked for the same reason as the photo:
// one file to keep in sync, and it degrades to the plain text mark beside it
// (in the markup, revealed by the inline onerror) rather than a broken box.
const LOGO_URL = 'https://www.cdelectrical.co.nz/wp-content/uploads/2023/06/header-logo-cd.png'

const STYLE = `
  :root { --ink:#0b1510; --panel:#f7f9f7; --field:#ffffff; --line:#dfe6e0; --line-strong:#b9c6bc;
          --brand:#1f8f3a; --brand-ink:#ffffff; --text:#14201a; --muted:#5b6b61; --bad:#b4471a;
          --hero-text:#ffffff; --hero-muted:#d9e2dc; }
  * { box-sizing: border-box; }
  html, body { height:100%; }
  body { margin:0; min-height:100dvh; background:var(--panel); color:var(--text);
         font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
         -webkit-font-smoothing:antialiased; }

  /* Two halves on a laptop: the work on the left, the form on the right. */
  .page { min-height:100dvh; display:grid; grid-template-columns: minmax(0, 1.15fr) minmax(400px, 0.85fr); }

  .hero { position:relative; overflow:hidden; background:#13211a center/cover no-repeat;
          background-image:url('${HERO_PHOTO}'); display:flex; flex-direction:column; justify-content:space-between;
          padding:36px 40px; color:var(--hero-text); }
  /* Darken only where the words sit; the photo itself stays bright. */
  .hero::before { content:""; position:absolute; inset:0;
                  background: linear-gradient(180deg, rgba(11,21,16,0.55) 0%, rgba(11,21,16,0) 30%, rgba(11,21,16,0) 55%, rgba(11,21,16,0.78) 100%); }
  .hero > * { position:relative; }
  .brand { display:flex; align-items:center; gap:12px; }
  .brand img { display:block; height:38px; width:auto; }
  .brand .fallback { display:none; align-items:center; gap:10px; }
  .brand .fallback .dot { width:28px; height:28px; border-radius:8px; background:var(--brand); flex:none; }
  .brand .fallback b { font-size:17px; font-weight:700; letter-spacing:-0.01em; }
  .brand .fallback span { display:block; font-size:12px; color:var(--hero-muted); font-weight:400; letter-spacing:0.12em; text-transform:uppercase; }
  .pitch { max-width:520px; }
  .pitch .eyebrow { margin:0 0 10px; font-size:12px; font-weight:600; letter-spacing:0.16em; text-transform:uppercase; color:#7ee08a; }
  .pitch h2 { margin:0 0 10px; font-size:30px; line-height:1.15; letter-spacing:-0.02em; font-weight:650; }
  .pitch p { margin:0; font-size:15px; color:var(--hero-muted); max-width:440px; }

  .panel { background:var(--panel); border-left:1px solid var(--line); color:var(--text);
           display:flex; flex-direction:column; justify-content:center; padding:48px 40px; }
  .form { width:100%; max-width:400px; margin:0 auto; }
  h1 { margin:0 0 6px; font-size:28px; letter-spacing:-0.02em; font-weight:650; }
  p.sub { margin:0 0 26px; color:var(--muted); font-size:15px; }
  p.sub b { color:var(--text); font-weight:600; }
  label { display:block; font-size:13px; font-weight:600; color:var(--muted); margin:0 0 8px; letter-spacing:0.01em; }
  input { width:100%; padding:14px 16px; margin-bottom:18px; font-size:17px; color:var(--text);
          background:var(--field); border:1px solid var(--line-strong); border-radius:12px;
          transition: border-color 120ms ease, box-shadow 120ms ease; }
  input::placeholder { color:#9aa8a0; }
  input:focus { outline:none; border-color:var(--brand); box-shadow:0 0 0 3px rgba(31,143,58,0.22); }
  input.code { font-size:34px; font-weight:600; letter-spacing:0.4em; text-align:center; text-indent:0.4em;
               font-family:ui-monospace, SFMono-Regular, Menlo, monospace; padding:16px 8px; }
  button { width:100%; min-height:52px; padding:14px; font-size:17px; font-weight:700; cursor:pointer;
           color:var(--brand-ink); background:var(--brand); border:0; border-radius:12px;
           transition: filter 120ms ease, transform 120ms ease; }
  button:hover { filter:brightness(1.08); }
  button:active { transform:translateY(1px); }
  button:focus-visible { outline:3px solid var(--text); outline-offset:2px; }
  .err { margin:0 0 18px; padding:12px 14px; border-radius:12px; font-size:14px; line-height:1.4;
         color:#7a2e0e; background:#fff1e8; border:1px solid #f2b893; }
  .err::before { content:"\\26A0\\FE0F"; margin-right:8px; }
  .alt { margin:20px 0 0; text-align:center; font-size:14px; }
  .alt a { color:var(--text); text-decoration:underline; text-underline-offset:3px; text-decoration-color:var(--line-strong); font-weight:500; }
  .alt a:hover { color:var(--brand); text-decoration-color:var(--brand); }
  .foot { margin:26px 0 0; padding-top:18px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); line-height:1.5; }
  .legal { margin:40px auto 0; max-width:400px; width:100%; font-size:12px; color:#8a978f; }

  /* A phone: the photo becomes a band across the top with the wordmark on
     it, the form sits on the solid panel underneath. */
  @media (max-width: 879px) {
    .page { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    .hero { min-height:200px; padding:22px 20px; background-position:center 40%; }
    .pitch h2 { font-size:22px; }
    .pitch p { display:none; }
    .panel { border-left:0; border-top:1px solid var(--line); padding:28px 20px 32px; justify-content:flex-start; }
    h1 { font-size:24px; }
    .legal { margin-top:28px; }
  }
  @media (prefers-reduced-motion: reduce) { input, button { transition:none; } }
`

const shell = (title, inner) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta name="theme-color" content="#f7f9f7" />
<title>${escape(title)} — Cassidy-Davies Electrical</title>
<style>${STYLE}</style>
</head>
<body>
  <div class="page">
    <aside class="hero" aria-hidden="true">
      <div class="brand">
        <!-- onerror is the one inline script on this page. It runs with no
             network access of its own — swap to the plain text mark, nothing
             else — so it cannot become a way for a slow or unreachable
             marketing site to hold up the sign-in flow. -->
        <img src="${LOGO_URL}" alt="Cassidy-Davies Electrical" height="38"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
        <div class="fallback">
          <div class="dot"></div>
          <div><b>Cassidy-Davies</b><span>Electrical</span></div>
        </div>
      </div>
      <div class="pitch">
        <p class="eyebrow">Operations dashboard</p>
        <h2>Every job, claim and finished-job profit, in one place.</h2>
        <p>For the Cassidy-Davies office and crew. Sign in to see where every job stands today.</p>
      </div>
    </aside>
    <main class="panel">
      <div class="form">
${inner}
      </div>
      <p class="legal">Cassidy-Davies Electrical &middot; Christchurch &middot; Private &mdash; for staff only.</p>
    </main>
  </div>
</body>
</html>`

// The "use the other way instead" links have to carry `next` themselves. They
// are ordinary GETs, so the hidden field in the form they are leaving does not
// come with them, and without this a signed-out click on a deep link would
// always land back on the dashboard home after signing in.
//
// `email` carries the address back to the form so it arrives filled in. Going
// back to an empty box to correct one typo is the kind of small cruelty that
// makes people give up and use the password.
const altLink = (signin, label, next, email = '') => {
  const q = `signin=${signin}&next=${encodeURIComponent(next || '/')}`
    + (email ? `&email=${encodeURIComponent(email)}` : '')
  return `<p class="alt"><a href="/?${q}">${escape(label)}</a></p>`
}

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
      <label for="code">Six-digit code</label>
      <input id="code" name="code" type="text" class="code" inputmode="numeric"
             pattern="[0-9]*" maxlength="6" autocomplete="one-time-code"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             required autofocus />
      <button type="submit">Sign in</button>
    </form>
    ${altLink('email', '\u2190 Change the address, or send a new code', next, email)}
    <p class="foot">Nothing arrived? Check your junk folder first. If that address is not set up for the dashboard no code is sent, so check it with the office \u2014 or sign in with your password instead.</p>`)
  }

  if (mode === 'email') {
    return shell('Sign in', `
    <h1>Sign in</h1>
    <p class="sub">We'll email a six-digit code to your work address. No password to remember.</p>
    ${err}
    ${notice ? `<p class="sub">${escape(notice)}</p>` : ''}
    <form method="POST" action="/auth/code" autocomplete="on">
      ${hiddenNext}
      <label for="email">Your work email</label>
      <input id="email" name="email" type="email" value="${escape(email)}" placeholder="name@cdelectrical.co.nz"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             autocomplete="email" required autofocus />
      <button type="submit">Email me a code</button>
    </form>
    ${altLink('password', 'Use a password instead', next)}
    <p class="foot">Ask the office if you need an account.</p>`)
  }

  return shell('Sign in', `
    <h1>Sign in</h1>
    <p class="sub">Your name and the password the office gave you.</p>
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
