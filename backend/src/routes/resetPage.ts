/**
 * resetPage.ts — web fallback for password reset.
 * ─────────────────────────────────────────────────────────────────────────────
 * The reset email links here (instead of straight to the uevents:// deep link),
 * so it works whether opened on a phone or a desktop:
 *   • Phone  → "Open in the uEvents app" button fires the deep link.
 *   • Anywhere → a plain web form posts the new password to the existing
 *     POST /users/reset-password endpoint (same origin, so no CORS/config).
 *
 * Mounted at /reset-password. The token comes in as ?token=... (hex).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Router } from "express";

const router = Router();

// Allow the inline <style> and <script> this page uses.
router.use((_req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
    );
    next();
});

function shell(bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Reset your password · uEvents</title>
<style>
  :root { --ink:#1C1917; --muted:#57534E; --line:#E7E2DA; --accent:#8C0327; --bg:#FBF9F6; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.6; }
  .wrap { max-width:460px; margin:0 auto; padding:48px 22px 80px; }
  .brand { font-size:13px; font-weight:800; letter-spacing:2px; color:var(--accent); text-transform:uppercase; }
  h1 { font-size:26px; letter-spacing:-0.5px; margin:8px 0 6px; }
  p { color:#292524; font-size:15px; }
  .muted { color:var(--muted); font-size:14px; }
  .card { background:#FFF; border:1px solid var(--line); border-radius:12px; padding:22px; margin-top:22px; }
  label { display:block; font-size:12px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:var(--muted); margin:14px 0 6px; }
  input { width:100%; padding:12px 14px; font-size:16px; border:1px solid var(--line); border-radius:8px; background:#FBF9F6; }
  input:focus { outline:none; border-color:var(--accent); }
  button { width:100%; margin-top:20px; padding:14px; font-size:15px; font-weight:800; letter-spacing:0.5px;
    color:#FFF; background:var(--accent); border:0; border-radius:8px; cursor:pointer; }
  button:disabled { opacity:0.6; cursor:default; }
  .appbtn { display:block; text-align:center; text-decoration:none; margin-bottom:6px;
    padding:14px; font-size:15px; font-weight:800; color:#FFF; background:var(--accent); border-radius:8px; }
  .divider { display:flex; align-items:center; gap:12px; color:var(--muted); font-size:12px; margin:20px 0; }
  .divider::before, .divider::after { content:""; flex:1; height:1px; background:var(--line); }
  .msg { margin-top:16px; padding:12px 14px; border-radius:8px; font-size:14px; display:none; }
  .msg.err { display:block; background:#FEE2E2; color:#8C0327; }
  .msg.ok { display:block; background:#DCFCE7; color:#166534; }
  .foot { color:var(--muted); font-size:13px; margin-top:28px; }
  a { color:var(--accent); }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">uEvents</div>
    <h1>Reset your password</h1>
    ${bodyHtml}
    <div class="foot">Didn't request this? You can safely ignore the email — your password won't change.</div>
  </div>
</body>
</html>`;
}

const INVALID_PAGE = shell(`
  <p class="muted">This reset link is missing or malformed. Request a new one from the app:
  open uEvents, tap <strong>Forgot password</strong> on the sign-in screen, and we'll email you a fresh link.</p>
`);

router.get("/", (req, res) => {
    const token = String(req.query.token ?? "");
    // Reset tokens are hex (crypto.randomBytes). Reject anything else so nothing
    // untrusted reaches the page markup.
    if (!/^[a-f0-9]{16,200}$/i.test(token)) {
        return res.status(400).type("html").send(INVALID_PAGE);
    }

    const tokenJson = JSON.stringify(token); // safe embedding into the inline script
    const deepLink = `uevents://reset-password?token=${encodeURIComponent(token)}`;

    res.type("html").send(shell(`
      <a class="appbtn" href="${deepLink}">Open in the uEvents app</a>
      <p class="muted" style="text-align:center;margin-top:0">On your phone with the app installed? Tap above.</p>

      <div class="divider">or reset here</div>

      <div class="card">
        <form id="f" autocomplete="off">
          <label for="pw">New password</label>
          <input id="pw" type="password" minlength="8" placeholder="At least 8 characters" required />
          <label for="pw2">Confirm new password</label>
          <input id="pw2" type="password" minlength="8" placeholder="Re-enter your password" required />
          <button id="submit" type="submit">Update password</button>
        </form>
        <div id="msg" class="msg"></div>
      </div>

      <script>
        (function () {
          var token = ${tokenJson};
          var form = document.getElementById('f');
          var msg = document.getElementById('msg');
          var btn = document.getElementById('submit');
          function show(kind, text) { msg.className = 'msg ' + kind; msg.textContent = text; }
          form.addEventListener('submit', function (e) {
            e.preventDefault();
            var pw = document.getElementById('pw').value;
            var pw2 = document.getElementById('pw2').value;
            if (pw.length < 8) { show('err', 'Password must be at least 8 characters.'); return; }
            if (pw !== pw2) { show('err', "Passwords don't match."); return; }
            btn.disabled = true; show('', ''); msg.className = 'msg';
            fetch('/users/reset-password', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token: token, password: pw }),
            }).then(function (r) {
              return r.json().catch(function () { return {}; }).then(function (data) {
                if (r.ok) {
                  form.style.display = 'none';
                  show('ok', 'Password updated. You can now sign in to the uEvents app with your new password.');
                } else {
                  btn.disabled = false;
                  show('err', (data && data.error) || 'Could not reset your password. Please try again.');
                }
              });
            }).catch(function () {
              btn.disabled = false;
              show('err', 'Network error. Please check your connection and try again.');
            });
          });
        })();
      </script>
    `));
});

export default router;
