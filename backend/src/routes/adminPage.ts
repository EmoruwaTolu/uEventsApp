/**
 * adminPage.ts — a browser dashboard for reviewing user reports.
 * ─────────────────────────────────────────────────────────────────────────────
 * Served at /admin. It's a thin client over the existing admin API:
 *   • POST /users/validate-user  → sign in (must be an ADMIN account)
 *   • GET  /reports?status=...   → list reports (enriched with target previews)
 *   • PATCH /reports/:id         → hide / delete / dismiss
 *
 * The page is public but useless without admin credentials — every data call is
 * gated by requireAdmin on the server. Create an admin with `npm run db:make-admin`.
 *
 * Meets the App Store UGC requirement (Guideline 1.2) to review and act on reports
 * (remove content / eject users) within 24 hours.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Router } from "express";

const router = Router();

router.use((_req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
    );
    res.setHeader("X-Robots-Tag", "noindex");
    next();
});

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>uEvents · Moderation</title>
<style>
  :root { --ink:#1C1917; --muted:#57534E; --line:#E7E2DA; --accent:#8C0327; --bg:#FBF9F6; --card:#FFF; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; line-height:1.5; }
  .wrap { max-width:720px; margin:0 auto; padding:28px 18px 80px; }
  .brand { font-size:12px; font-weight:800; letter-spacing:2px; color:var(--accent); text-transform:uppercase; }
  h1 { font-size:22px; margin:6px 0 18px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:14px; }
  label { display:block; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted); margin:12px 0 5px; }
  input { width:100%; padding:11px 13px; font-size:15px; border:1px solid var(--line); border-radius:8px; background:#FBF9F6; }
  button { font: inherit; cursor:pointer; border:0; border-radius:8px; }
  .primary { width:100%; margin-top:18px; padding:13px; font-weight:800; color:#fff; background:var(--accent); }
  .primary:disabled { opacity:0.6; cursor:default; }
  .row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .spacer { flex:1; }
  .pill { padding:6px 11px; border:1px solid var(--line); background:#fff; border-radius:999px; font-size:13px; font-weight:600; color:var(--muted); }
  .pill.active { border-color:var(--accent); color:var(--accent); background:#FEE2E2; }
  .link { background:none; color:var(--muted); font-size:13px; text-decoration:underline; padding:6px; }
  .badge { display:inline-block; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 7px; border-radius:5px; text-transform:uppercase; }
  .b-post { background:#DBEAFE; color:#1D4ED8; }
  .b-comment { background:#DCFCE7; color:#166534; }
  .b-user { background:#FEE2E2; color:#8C0327; }
  .meta { color:var(--muted); font-size:12px; }
  .reason { margin:8px 0; padding:9px 11px; background:#FBF9F6; border-left:3px solid var(--accent); border-radius:4px; font-size:14px; }
  .target { font-size:14px; margin:6px 0; }
  .gone { color:var(--muted); font-style:italic; }
  .actions { display:flex; gap:8px; margin-top:12px; }
  .act { padding:8px 12px; font-size:13px; font-weight:700; color:#fff; }
  .a-hide { background:#B45309; }
  .a-delete { background:#8C0327; }
  .a-dismiss { background:#57534E; }
  .act:disabled { opacity:0.5; cursor:default; }
  .msg { padding:11px 13px; border-radius:8px; font-size:14px; margin-top:12px; display:none; }
  .msg.err { display:block; background:#FEE2E2; color:#8C0327; }
  .empty { text-align:center; color:var(--muted); padding:40px 0; }
  .hidden { display:none; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">uEvents</div>
    <h1>Moderation</h1>

    <div id="loginView">
      <div class="card">
        <p class="meta" style="margin-top:0">Sign in with an admin account to review reported content.</p>
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="username" />
        <label for="pw">Password</label>
        <input id="pw" type="password" autocomplete="current-password" />
        <button id="loginBtn" class="primary">Sign in</button>
        <div id="loginMsg" class="msg"></div>
      </div>
    </div>

    <div id="dashView" class="hidden">
      <div class="row" style="margin-bottom:14px">
        <button class="pill active" data-status="open">Open</button>
        <button class="pill" data-status="resolved">Resolved</button>
        <button class="pill" data-status="all">All</button>
        <span class="spacer"></span>
        <button id="refreshBtn" class="link">Refresh</button>
        <button id="logoutBtn" class="link">Sign out</button>
      </div>
      <div id="list"></div>
    </div>
  </div>

  <script>
    (function () {
      var token = sessionStorage.getItem('admin_token') || '';
      var statusFilter = 'open';
      var loginView = document.getElementById('loginView');
      var dashView = document.getElementById('dashView');
      var list = document.getElementById('list');
      var loginMsg = document.getElementById('loginMsg');
      var loginBtn = document.getElementById('loginBtn');

      function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
      function authHeaders() { return { 'Authorization': 'Bearer ' + token }; }

      function showDash(on) {
        loginView.className = on ? 'hidden' : '';
        dashView.className = on ? '' : 'hidden';
      }

      function fmtWhen(iso) {
        try { return new Date(iso).toLocaleString(); } catch (e) { return ''; }
      }

      function reporterName(r) {
        if (!r) return 'Someone';
        if (r.type === 'CLUB') return r.clubName || 'A club';
        return ((r.firstName || '') + ' ' + (r.lastName || '')).trim() || 'A student';
      }

      function targetLine(rep) {
        if (!rep.targetExists) return '<div class="target gone">[content no longer exists — likely already removed]</div>';
        var t = rep.target || {};
        if (rep.targetType === 'POST') {
          return '<div class="target"><strong>' + esc(t.title) + '</strong>' +
            (t.clubName ? ' <span class="meta">· by ' + esc(t.clubName) + '</span>' : '') +
            (t.hidden ? ' <span class="meta">(currently hidden)</span>' : '') + '</div>';
        }
        if (rep.targetType === 'COMMENT') {
          return '<div class="target">"' + esc(t.content) + '"' +
            (t.author ? ' <span class="meta">· ' + esc(t.author) + '</span>' : '') +
            (t.hidden ? ' <span class="meta">(currently hidden)</span>' : '') + '</div>';
        }
        return '<div class="target"><strong>' + esc(t.name) + '</strong> <span class="meta">· ' + esc(t.type) + '</span></div>';
      }

      function render(reports) {
        if (!reports.length) { list.innerHTML = '<div class="empty">Nothing here. 🎉</div>'; return; }
        var html = '';
        for (var i = 0; i < reports.length; i++) {
          var rep = reports[i];
          var cls = rep.targetType === 'POST' ? 'b-post' : rep.targetType === 'COMMENT' ? 'b-comment' : 'b-user';
          html += '<div class="card">';
          html += '<div class="row"><span class="badge ' + cls + '">' + esc(rep.targetType) + '</span>';
          html += '<span class="spacer"></span><span class="meta">' + fmtWhen(rep.createdAt) + '</span></div>';
          html += targetLine(rep);
          html += '<div class="reason">' + esc(rep.reason) + '</div>';
          html += '<div class="meta">Reported by ' + esc(reporterName(rep.reporter)) + '</div>';
          if (!rep.resolvedAt) {
            html += '<div class="actions">';
            if (rep.targetType !== 'USER' && rep.targetExists) {
              html += '<button class="act a-hide" data-id="' + rep.id + '" data-action="hide">Hide</button>';
              html += '<button class="act a-delete" data-id="' + rep.id + '" data-action="delete">Delete</button>';
            }
            html += '<button class="act a-dismiss" data-id="' + rep.id + '" data-action="dismiss">Dismiss</button>';
            html += '</div>';
          } else {
            html += '<div class="meta" style="margin-top:8px">Resolved: ' + esc(rep.resolution || 'closed') + '</div>';
          }
          html += '</div>';
        }
        list.innerHTML = html;
      }

      function load() {
        list.innerHTML = '<div class="empty">Loading…</div>';
        fetch('/reports?status=' + statusFilter, { headers: authHeaders() })
          .then(function (r) {
            if (r.status === 401 || r.status === 403) { signOut('That account is not an admin, or the session expired.'); return null; }
            return r.json();
          })
          .then(function (data) { if (data) render(data); })
          .catch(function () { list.innerHTML = '<div class="empty">Network error. Try Refresh.</div>'; });
      }

      function act(id, action, btn) {
        var buttons = btn.parentNode.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
        fetch('/reports/' + id, {
          method: 'PATCH',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ action: action }),
        }).then(function (r) {
          if (r.ok) { load(); }
          else { for (var i = 0; i < buttons.length; i++) buttons[i].disabled = false; }
        }).catch(function () { for (var i = 0; i < buttons.length; i++) buttons[i].disabled = false; });
      }

      function signOut(message) {
        token = '';
        sessionStorage.removeItem('admin_token');
        showDash(false);
        if (message) { loginMsg.className = 'msg err'; loginMsg.textContent = message; }
      }

      loginBtn.addEventListener('click', function () {
        var email = document.getElementById('email').value.trim();
        var pw = document.getElementById('pw').value;
        if (!email || !pw) { loginMsg.className = 'msg err'; loginMsg.textContent = 'Enter your email and password.'; return; }
        loginBtn.disabled = true; loginMsg.className = 'msg';
        fetch('/users/validate-user', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email, password: pw }),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            loginBtn.disabled = false;
            if (!r.ok) { loginMsg.className = 'msg err'; loginMsg.textContent = (data && data.error) || 'Sign in failed.'; return; }
            if (!data.user || data.user.type !== 'ADMIN') { loginMsg.className = 'msg err'; loginMsg.textContent = 'This account is not an admin.'; return; }
            token = data.token;
            sessionStorage.setItem('admin_token', token);
            showDash(true); load();
          });
        }).catch(function () { loginBtn.disabled = false; loginMsg.className = 'msg err'; loginMsg.textContent = 'Network error.'; });
      });

      document.getElementById('refreshBtn').addEventListener('click', load);
      document.getElementById('logoutBtn').addEventListener('click', function () { signOut(''); });

      var pills = document.querySelectorAll('.pill');
      for (var i = 0; i < pills.length; i++) {
        pills[i].addEventListener('click', function (e) {
          for (var j = 0; j < pills.length; j++) pills[j].className = 'pill';
          e.target.className = 'pill active';
          statusFilter = e.target.getAttribute('data-status');
          load();
        });
      }

      list.addEventListener('click', function (e) {
        var el = e.target;
        if (el && el.getAttribute && el.getAttribute('data-action')) {
          act(el.getAttribute('data-id'), el.getAttribute('data-action'), el);
        }
      });

      // Resume an existing session if the admin already signed in.
      if (token) { showDash(true); load(); }
    })();
  </script>
</body>
</html>`;

router.get("/", (_req, res) => res.type("html").send(PAGE));

export default router;
