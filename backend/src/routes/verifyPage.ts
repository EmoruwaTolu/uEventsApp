/**
 * verifyPage.ts — web fallback for email verification.
 * ─────────────────────────────────────────────────────────────────────────────
 * The verification email links here (instead of straight to the uevents:// deep
 * link), so it works whether opened on a phone or a desktop:
 *   • Phone  → "Open in the uEvents app" button fires the deep link.
 *   • Anywhere → a "Verify my email" button posts the token to the existing
 *     POST /users/verify-email endpoint (same origin, so no CORS/config).
 *
 * Verification runs on a button click (not on GET), so link-scanners that fetch
 * the URL without executing JavaScript can't silently burn the token.
 *
 * Mounted at /verify-email. The token comes in as ?token=... (hex).
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
<title>Verify your email · uEvents</title>
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
  button { width:100%; padding:14px; font-size:15px; font-weight:800; letter-spacing:0.5px;
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
    <h1>Verify your email</h1>
    ${bodyHtml}
    <div class="foot">Didn't create a uEvents account? You can safely ignore the email.</div>
  </div>
</body>
</html>`;
}

const INVALID_PAGE = shell(`
  <p class="muted">This verification link is missing or malformed. Request a new one from the app:
  open uEvents, go to <strong>Settings</strong> (or the verify-email screen) and tap
  <strong>Resend email</strong>.</p>
`);

router.get("/", (req, res) => {
    const token = String(req.query.token ?? "");
    // Verification tokens are hex (crypto.randomBytes). Reject anything else so
    // nothing untrusted reaches the page markup.
    if (!/^[a-f0-9]{16,200}$/i.test(token)) {
        return res.status(400).type("html").send(INVALID_PAGE);
    }

    const tokenJson = JSON.stringify(token); // safe embedding into the inline script
    const deepLink = `uevents://verify-email?token=${encodeURIComponent(token)}`;

    res.type("html").send(shell(`
      <a class="appbtn" href="${deepLink}">Open in the uEvents app</a>
      <p class="muted" style="text-align:center;margin-top:0">On your phone with the app installed? Tap above.</p>

      <div class="divider">or verify here</div>

      <div class="card">
        <p class="muted" style="margin-top:0">Confirm this is your email address to finish setting up your account.</p>
        <button id="verify" type="button">Verify my email</button>
        <div id="msg" class="msg"></div>
      </div>

      <script>
        (function () {
          var token = ${tokenJson};
          var btn = document.getElementById('verify');
          var msg = document.getElementById('msg');
          function show(kind, text) { msg.className = 'msg ' + kind; msg.textContent = text; }
          btn.addEventListener('click', function () {
            btn.disabled = true; msg.className = 'msg';
            fetch('/users/verify-email', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token: token }),
            }).then(function (r) {
              return r.json().catch(function () { return {}; }).then(function (data) {
                if (r.ok) {
                  btn.style.display = 'none';
                  show('ok', 'Your email is verified. You can now head back to the uEvents app and sign in.');
                } else {
                  btn.disabled = false;
                  show('err', (data && data.error) || 'Could not verify your email. Please try again.');
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
