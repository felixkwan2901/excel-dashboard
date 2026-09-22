// The login page. Self-contained — it is served before any asset is allowed
// through, so it cannot reference the built site's CSS or fonts.

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function renderLogin({ error = '', username = '', next = '/' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Sign in — Cassidy-Davies Electrical</title>
<style>
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
  label { display:block; font-size:13px; color:var(--muted); margin:0 0 6px; }
  input { width:100%; padding:12px 14px; margin-bottom:16px; font-size:16px;
          color:var(--text); background:#0e1a15; border:1px solid var(--line);
          border-radius:10px; }
  input:focus { outline:2px solid var(--brand); outline-offset:1px; border-color:transparent; }
  button { width:100%; padding:13px; font-size:16px; font-weight:600; cursor:pointer;
           color:#04170c; background:var(--brand); border:0; border-radius:10px; }
  button:hover { filter:brightness(1.07); }
  .err { margin:0 0 18px; padding:11px 13px; border-radius:10px; font-size:14px;
         color:#ffd9c2; background:rgba(239,108,31,0.14); border:1px solid rgba(239,108,31,0.4); }
  .foot { margin:22px 0 0; font-size:12px; color:var(--muted); }
</style>
</head>
<body>
  <main class="card">
    <div class="mark">
      <div class="dot"></div>
      <div><b>Cassidy-Davies</b><span>Electrical</span></div>
    </div>
    <h1>Sign in</h1>
    <p class="sub">The operations dashboard is not public.</p>
    ${error ? `<p class="err">${escape(error)}</p>` : ''}
    <form method="POST" action="/auth/login" autocomplete="on">
      <input type="hidden" name="next" value="${escape(next)}" />
      <label for="username">Your name</label>
      <input id="username" name="username" type="text" value="${escape(username)}"
             autocapitalize="none" autocorrect="off" spellcheck="false"
             autocomplete="username" required autofocus />
      <label for="password">Password</label>
      <input id="password" name="password" type="password"
             autocomplete="current-password" required />
      <button type="submit">Sign in</button>
    </form>
    <p class="foot">Ask the office if you need an account or a reset.</p>
  </main>
</body>
</html>`
}
