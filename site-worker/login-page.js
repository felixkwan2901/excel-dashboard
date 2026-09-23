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

// Real photos of Cassidy-Davies' own work, from their public site
// (cdelectrical.co.nz/projects/) — a full-bleed collage behind the card, the
// way Netflix dims a title's own backdrop behind its sign-in form rather than
// showing a blank colour. Six is enough to tile a wide screen without an
// obvious repeat and few enough that a slow connection still has a usable
// page in a second or two.
//
// Set as CSS background-image on plain divs, not <img> tags: if
// cdelectrical.co.nz is ever slow or down, a background-image that fails to
// load simply shows nothing and the div's own dark fill takes over — an
// <img> in the same situation is a broken-image icon sitting in the middle
// of the sign-in screen. This page has one job, and it cannot depend on the
// marketing site being up to do it.
const PROJECT_PHOTOS = [
  'https://www.cdelectrical.co.nz/wp-content/uploads/2025/08/Koawa-Studio-Long.png',
  'https://www.cdelectrical.co.nz/wp-content/uploads/2024/12/IMG_6354-1536x1152.jpg',
  'https://www.cdelectrical.co.nz/wp-content/uploads/2024/12/AquaPro-1536x1104.jpg',
  'https://www.cdelectrical.co.nz/wp-content/uploads/2024/11/uploads1715202201060-6bgnn2aulol-c76a6241ef84e850120e165b75daabcb1-360-Montreal-Street-21-scaled-1-1536x1025.jpg',
  'https://www.cdelectrical.co.nz/wp-content/uploads/2024/12/IMG_5047-1536x1092.jpg',
  'https://www.cdelectrical.co.nz/wp-content/uploads/2025/04/Stairs.png',
]

// The company's own wordmark, top-left — same placement Netflix uses for its
// logo over the backdrop. Hotlinked for the same reason as the photos above:
// one file to keep in sync, and it degrades to the plain text mark below it
// (kept in the markup, hidden by CSS only once the image is confirmed
// present) rather than a broken-image box if it fails to load.
const LOGO_URL = 'https://www.cdelectrical.co.nz/wp-content/uploads/2023/06/header-logo-cd.png'

const STYLE = `
  :root { --ink:#0c1712; --card:#16261e; --line:#24382d; --brand:#41b44a;
          --text:#ffffff; --muted:#8fa398; --bad:#ef6c1f; }
  * { box-sizing: border-box; }
  html, body { height:100%; }
  body { margin:0; min-height:100dvh; position:relative; overflow-x:hidden;
         background:var(--ink); color:var(--text); padding:24px;
         font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }

  /* The backdrop: a tiled grid of real project photos, dimmed and vignetted
     so the card and the logo stay the thing your eye lands on rather than
     competing with a bright photo behind them. Fixed, so it does not scroll
     away on a tall page (the code-entry screen's helper text can push past
     one viewport on a small phone). */
  .backdrop { position:fixed; inset:0; z-index:0;
              display:grid; grid-template-columns:repeat(3, 1fr); gap:2px;
              filter:saturate(0.9) brightness(0.55); }
  .backdrop div { background-size:cover; background-position:center; }
  @media (max-width: 640px) { .backdrop { grid-template-columns:repeat(2, 1fr); } }
  /* Netflix's own trick: a dark gradient over the photos rather than the
     photos alone at low opacity — it darkens the edges where the eye should
     not linger while leaving enough of the centre visible to read as "real
     work", not wallpaper. */
  .scrim { position:fixed; inset:0; z-index:1;
           background:
             radial-gradient(ellipse at center, rgba(12,23,18,0.35) 0%, rgba(12,23,18,0.88) 75%),
             linear-gradient(180deg, rgba(12,23,18,0.75) 0%, rgba(12,23,18,0.55) 30%, rgba(12,23,18,0.85) 100%); }

  .page { position:relative; z-index:2; min-height:calc(100dvh - 48px);
          display:flex; flex-direction:column; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:auto;
           padding-bottom:32px; }
  .brand img { display:block; height:34px; width:auto; }
  /* Shown only if the logo image fails — see the inline onerror below, the
     one bit of "scripting" on a page that otherwise has none, and it runs
     with no network access and no effect on the sign-in flow either way. */
  .brand .fallback { display:none; align-items:center; gap:10px; }
  .brand .fallback .dot { width:26px; height:26px; border-radius:8px; background:var(--brand); flex:none; }
  .brand .fallback b { font-size:16px; font-weight:600; letter-spacing:-0.01em; }
  .brand .fallback span { display:block; font-size:12px; color:var(--muted); font-weight:400; }

  .center { flex:1; display:flex; align-items:center; justify-content:center; padding:24px 0; }
  /* Translucent black over the photos rather than a flat opaque card — this
     is the one deliberate borrow from Netflix's own login card, because it
     is what makes the backdrop read as behind the form instead of behind a
     wall in front of it. backdrop-filter is skipped: it is unsupported or
     slow on exactly the low-end/older phones this dashboard has to keep
     working on, and the gradient above already does most of the darkening
     work regardless. */
  .card { width:100%; max-width:380px; background:rgba(8,16,12,0.82);
          border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:32px 28px;
          box-shadow:0 24px 60px rgba(0,0,0,0.45); }
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
  <div class="backdrop">
${PROJECT_PHOTOS.map((url) => `    <div style="background-image:url('${url}')"></div>`).join('\n')}
  </div>
  <div class="scrim"></div>
  <div class="page">
    <div class="brand">
      <!-- onerror is the one inline script on this page. It runs with no
           network access of its own — swap to the plain text mark, nothing
           else — so it cannot become a way for a slow or unreachable
           marketing site to hold up the sign-in flow that depends on this
           page rendering. -->
      <img src="${LOGO_URL}" alt="Cassidy-Davies Electrical" height="34"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
      <div class="fallback">
        <div class="dot"></div>
        <div><b>Cassidy-Davies</b><span>Electrical</span></div>
      </div>
    </div>
    <div class="center">
      <main class="card">
${inner}
      </main>
    </div>
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
      <label for="code">Sign-in code</label>
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
