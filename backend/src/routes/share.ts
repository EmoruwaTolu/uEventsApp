import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// These are public HTML preview pages with inline styles/script. Relax the
// strict global CSP (set by helmet) just for this router so they render.
router.use((_req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
    );
    next();
});

// Store + deep-link config. Override in production via env; the defaults are
// safe placeholders that degrade to a generic store search.
const APP_STORE_URL = process.env.APP_STORE_URL ?? "https://apps.apple.com/app/uevents";
const PLAY_STORE_URL = process.env.PLAY_STORE_URL ?? "https://play.google.com/store/apps/details?id=com.cssa.uevents";
const APP_SCHEME = "uevents";

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function pickLocale(locales: unknown): any {
    const l = (locales as any) ?? {};
    return l.en ?? l.fr ?? Object.values(l)[0] ?? {};
}

function formatWhen(startAt: Date | null): string | null {
    if (!startAt) return null;
    try {
        return new Intl.DateTimeFormat("en-US", {
            weekday: "short", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit",
        }).format(startAt);
    } catch {
        return startAt.toISOString();
    }
}

// Renders a minimal, self-contained preview page: it tries to open the native
// app via its deep link, and always shows a poster/title/date card plus store
// buttons for anyone who doesn't have the app installed.
function renderPreview(opts: {
    kind: "event" | "post";
    id: string;
    title: string;
    clubName: string;
    when: string | null;
    location: string | null;
    imageUrl: string | null;
    description: string | null;
}): string {
    const deepLink = `${APP_SCHEME}://${opts.kind}/${opts.id}`;
    const title = escapeHtml(opts.title);
    const clubName = escapeHtml(opts.clubName);
    const when = opts.when ? escapeHtml(opts.when) : null;
    const location = opts.location ? escapeHtml(opts.location) : null;
    const desc = opts.description ? escapeHtml(opts.description).slice(0, 200) : `${clubName} on uEvents`;
    const ogImage = opts.imageUrl ? escapeHtml(opts.imageUrl) : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · uEvents</title>
<meta name="description" content="${desc}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
${ogImage ? `<meta property="og:image" content="${ogImage}" />` : ""}
<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #F5F4F0; color: #1A1A1A; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border-radius: 20px; max-width: 420px; width: 100%; overflow: hidden;
    box-shadow: 0 8px 30px rgba(0,0,0,0.08); }
  .poster { width: 100%; aspect-ratio: 16/9; object-fit: cover; background: #E7E4DC; display: block; }
  .body { padding: 20px 22px 24px; }
  .club { font-size: 13px; font-weight: 600; color: #8C0327; text-transform: uppercase; letter-spacing: 0.4px; }
  h1 { font-size: 22px; line-height: 1.25; margin: 6px 0 10px; }
  .meta { font-size: 14px; color: #555; margin: 2px 0; }
  .btns { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
  a.btn { display: block; text-align: center; text-decoration: none; padding: 13px 16px; border-radius: 12px; font-weight: 600; font-size: 15px; }
  .primary { background: #8C0327; color: #fff; }
  .store { background: #F0EEE9; color: #1A1A1A; }
  .footer { text-align: center; font-size: 12px; color: #999; margin-top: 16px; }
</style>
</head>
<body>
  <div class="card">
    ${ogImage ? `<img class="poster" src="${ogImage}" alt="" />` : ""}
    <div class="body">
      <div class="club">${clubName}</div>
      <h1>${title}</h1>
      ${when ? `<div class="meta">🗓️ ${when}</div>` : ""}
      ${location ? `<div class="meta">📍 ${location}</div>` : ""}
      <div class="btns">
        <a class="btn primary" id="open" href="${deepLink}">Open in uEvents</a>
        <a class="btn store" href="${escapeHtml(APP_STORE_URL)}">Download on the App Store</a>
        <a class="btn store" href="${escapeHtml(PLAY_STORE_URL)}">Get it on Google Play</a>
      </div>
      <div class="footer">Opened the app already? Tap “Open in uEvents”.</div>
    </div>
  </div>
<script>
  // Best-effort: try to hand off to the native app immediately. If the app
  // isn't installed the deep link is a no-op and the store buttons remain.
  (function () {
    try { window.location.href = ${JSON.stringify(deepLink)}; } catch (e) {}
  })();
</script>
</body>
</html>`;
}

// GET /share/event/:id — public web preview + app/store hand-off
router.get("/event/:id", async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            select: {
                id: true, type: true, hidden: true, isDraft: true, locales: true,
                startAt: true, locationName: true,
                club: { select: { clubName: true } },
            },
        });
        res.type("html");
        if (!post || post.type !== "EVENT" || post.isDraft || post.hidden) {
            return res.status(404).send(renderNotFound("Event not found"));
        }
        const loc = pickLocale(post.locales);
        res.send(renderPreview({
            kind: "event",
            id: post.id,
            title: loc.title ?? "Event",
            clubName: post.club.clubName ?? "uEvents",
            when: formatWhen(post.startAt),
            location: post.locationName ?? null,
            imageUrl: loc.posterUrl ?? null,
            description: loc.body ?? loc.description ?? null,
        }));
    } catch (err) {
        next(err);
    }
});

// GET /share/post/:id — public web preview for any post type
router.get("/post/:id", async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            select: {
                id: true, type: true, hidden: true, isDraft: true, locales: true,
                startAt: true, locationName: true,
                club: { select: { clubName: true } },
            },
        });
        res.type("html");
        if (!post || post.isDraft || post.hidden) {
            return res.status(404).send(renderNotFound("Post not found"));
        }
        const loc = pickLocale(post.locales);
        res.send(renderPreview({
            kind: "post",
            id: post.id,
            title: loc.title ?? "Post",
            clubName: post.club.clubName ?? "uEvents",
            when: post.type === "EVENT" ? formatWhen(post.startAt) : null,
            location: post.type === "EVENT" ? (post.locationName ?? null) : null,
            imageUrl: loc.posterUrl ?? null,
            description: loc.body ?? loc.description ?? null,
        }));
    } catch (err) {
        next(err);
    }
});

function renderNotFound(msg: string): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>uEvents</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F5F4F0;color:#1A1A1A;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center;}
.box{max-width:360px}h1{font-size:20px}a{color:#8C0327;font-weight:600;text-decoration:none}</style></head>
<body><div class="box"><h1>${escapeHtml(msg)}</h1><p>This content may have been removed or is no longer available.</p>
<p><a href="${escapeHtml(APP_STORE_URL)}">Get uEvents</a></p></div></body></html>`;
}

export default router;
