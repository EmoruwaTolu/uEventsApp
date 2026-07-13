import { Router } from "express";

const router = Router();

// Public HTML pages (privacy policy + terms). Relax the strict global CSP so the
// inline styles render, matching the share router's approach.
router.use((_req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'",
    );
    next();
});

const UPDATED = "July 4, 2026";
const CONTACT = process.env.LEGAL_CONTACT_EMAIL ?? "support.uevents@gmail.com";

function page(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="index,follow" />
<title>${title} · uEvents</title>
<style>
  :root { --ink:#1C1917; --muted:#57534E; --line:#E7E2DA; --accent:#8C0327; --bg:#FBF9F6; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.6; }
  .wrap { max-width:720px; margin:0 auto; padding:40px 22px 80px; }
  .brand { font-size:13px; font-weight:800; letter-spacing:2px; color:var(--accent); text-transform:uppercase; }
  h1 { font-size:30px; letter-spacing:-0.5px; margin:8px 0 4px; }
  .updated { color:var(--muted); font-size:13px; margin-bottom:28px; }
  h2 { font-size:18px; margin:32px 0 8px; }
  p, li { color:#292524; font-size:15px; }
  ul { padding-left:20px; }
  a { color:var(--accent); }
  .divider { height:1px; background:var(--line); margin:28px 0; border:0; }
  .foot { color:var(--muted); font-size:13px; margin-top:40px; }
  .note { background:#FFF; border:1px solid var(--line); border-radius:10px; padding:14px 16px; font-size:14px; color:var(--muted); }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">uEvents</div>
    <h1>${title}</h1>
    <div class="updated">Last updated: ${UPDATED}</div>
    ${bodyHtml}
    <div class="foot">
      Questions? Contact us at <a href="mailto:${CONTACT}">${CONTACT}</a>.
    </div>
  </div>
</body>
</html>`;
}

const PRIVACY = page("Privacy Policy", `
  <p>uEvents ("we", "us") is a student-events platform for the University of Ottawa
  community. This policy explains what information we collect, how we use it, and the
  choices you have. By using the app you agree to this policy.</p>

  <h2>Information you provide</h2>
  <ul>
    <li><strong>Account details:</strong> your email address and a password (stored only
    as a secure hash). Students may add a name, program, and year; clubs may add a name,
    category, description, logo, contact email, and social handles.</li>
    <li><strong>Content you create:</strong> events, announcements, polls, comments,
    photos you upload to event recaps, ratings, and RSVPs.</li>
    <li><strong>Feedback</strong> you send us, including optional screenshots.</li>
  </ul>

  <h2>Information collected automatically</h2>
  <ul>
    <li><strong>Activity:</strong> the clubs and topics you follow, events you RSVP to or
    check in at, posts you like, bookmark, or vote on. We use this to build your feed and
    "For You" recommendations.</li>
    <li><strong>Push token:</strong> if you enable notifications, a device push token so we
    can send event reminders and updates.</li>
    <li><strong>Basic technical data</strong> needed to operate and secure the service.</li>
  </ul>

  <h2>Device permissions</h2>
  <ul>
    <li><strong>Camera &amp; photo library:</strong> only used when you choose to attach an
    image to a post, profile, or recap.</li>
    <li><strong>Calendar:</strong> only used when you choose to add an event to your device
    calendar or subscribe to your events feed.</li>
    <li><strong>Notifications:</strong> only used to deliver reminders and updates you opt
    into.</li>
  </ul>
  <p>You can grant or revoke these permissions at any time in your device settings.</p>

  <h2>How we use your information</h2>
  <ul>
    <li>To provide and personalize the app (feeds, RSVPs, recaps, recommendations).</li>
    <li>To send reminders, digests, and account emails such as verification and password
    reset.</li>
    <li>To keep the platform safe (moderation, abuse prevention, and enforcing our terms).</li>
  </ul>

  <h2>Sharing</h2>
  <p>We do <strong>not</strong> sell your personal information, and we do not show ads or let
  advertisers target you. We share data only with service providers that help us run the app
  (for example, image hosting via Cloudinary and email delivery via Resend), and only as needed
  to provide the service. Content you post publicly (events, comments, recap photos) is visible
  to other users as intended.</p>

  <h2>Data retention &amp; deletion</h2>
  <p>We keep your information while your account is active. You can delete your account at any
  time in <strong>Settings → Delete Account</strong>, which permanently removes your account and
  associated data. You may also contact us to request deletion.</p>

  <h2>Children</h2>
  <p>uEvents is intended for university students and others 17 and older. It is not directed to
  children under 13, and we do not knowingly collect their information.</p>

  <h2>Changes</h2>
  <p>We may update this policy; we will revise the "last updated" date above and, for material
  changes, provide notice in the app.</p>

  <hr class="divider" />
  <div class="note">This document is provided for transparency and is not legal advice.
  Please have it reviewed by a qualified professional before relying on it for compliance.</div>
`);

const TERMS = page("Terms of Service", `
  <p>These Terms govern your use of the uEvents app. By creating an account or using the app,
  you agree to them.</p>

  <h2>Accounts</h2>
  <ul>
    <li>You are responsible for the activity under your account and for keeping your password
    secure.</li>
    <li>Provide accurate information. Club accounts must represent a real student organization
    and may require approval before posting.</li>
  </ul>

  <h2>Acceptable use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Post content that is unlawful, harassing, hateful, misleading, or that infringes others'
    rights.</li>
    <li>Impersonate a person or organization, or misrepresent your affiliation.</li>
    <li>Attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to the
    service.</li>
    <li>Upload photos of people without appropriate consent, or content you don't have the right
    to share.</li>
  </ul>

  <h2>Your content</h2>
  <p>You keep ownership of what you post. You grant uEvents a limited licence to host, display,
  and distribute your content within the app so we can operate the service. You are responsible
  for the content you post.</p>

  <h2>Moderation</h2>
  <p>We may hide, remove, or restrict content, and suspend or terminate accounts, that violate
  these Terms or harm the community. Reporting tools are provided in the app.</p>

  <h2>Events &amp; third parties</h2>
  <p>Events are organized by clubs and users, not by uEvents. We are not responsible for events
  themselves, their accuracy, or what happens at them. Links and services from third parties are
  governed by their own terms.</p>

  <h2>Disclaimers &amp; liability</h2>
  <p>The service is provided "as is" without warranties of any kind. To the extent permitted by
  law, uEvents is not liable for indirect or incidental damages arising from your use of the app.</p>

  <h2>Changes &amp; termination</h2>
  <p>We may update these Terms and will update the "last updated" date above. You may stop using
  the app at any time and delete your account in Settings.</p>

  <hr class="divider" />
  <div class="note">This document is provided as a starting template and is not legal advice.
  Please have it reviewed by a qualified professional before launch.</div>
`);

const SUPPORT = page("Support", `
  <p>Need a hand with uEvents? We're happy to help. The fastest way to reach us is by email —
  we read every message and reply as quickly as we can (usually within a few days during the
  beta).</p>

  <div class="note">Email us at <a href="mailto:${CONTACT}">${CONTACT}</a></div>

  <h2>Common things we can help with</h2>
  <ul>
    <li><strong>Account help</strong> — trouble signing in, verifying your email, or resetting
    your password.</li>
    <li><strong>Clubs</strong> — getting a club account approved, or questions about posting
    events, announcements, and polls.</li>
    <li><strong>Reporting content or users</strong> — you can report posts, comments, and users
    right in the app (use the ⋯ / flag on any item, or "Block user"); email us if something
    needs urgent attention.</li>
    <li><strong>Deleting your account</strong> — you can remove your account and its data at any
    time in <strong>Settings → Delete Account</strong>.</li>
    <li><strong>Feedback &amp; bugs</strong> — send suggestions from <strong>Settings → Send
    Feedback</strong>, or just email us.</li>
  </ul>

  <h2>When you email us</h2>
  <p>To help us respond faster, please include the email address on your account and a short
  description of what happened (a screenshot helps too, if it's a bug).</p>

  <hr class="divider" />
  <p>See also our <a href="/legal/privacy">Privacy Policy</a> and
  <a href="/legal/terms">Terms of Service</a>.</p>
`);

router.get(["/privacy", "/privacy.html"], (_req, res) => res.type("html").send(PRIVACY));
router.get(["/terms", "/terms.html"], (_req, res) => res.type("html").send(TERMS));
router.get(["/support", "/support.html"], (_req, res) => res.type("html").send(SUPPORT));

// A tiny index so /legal resolves to something useful.
router.get("/", (_req, res) =>
    res.type("html").send(page("Legal", `
      <ul>
        <li><a href="/legal/support">Support</a></li>
        <li><a href="/legal/privacy">Privacy Policy</a></li>
        <li><a href="/legal/terms">Terms of Service</a></li>
      </ul>`)),
);

export default router;
