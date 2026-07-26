# uEvents — Launch Legal & Privacy Prep

Practical prep for the App Store and Google Play submissions, plus a compliance
checklist. Based on what the app actually collects and does (from the data model
and features). **This is drafting help and factual prep, not legal advice** —
have a qualified professional (or your university's legal/clubs office) review
before launch.

_Last reviewed against store requirements: July 2026._

---

## 0. Action items (what still needs doing)

| # | Item | Status | Who |
|---|------|--------|-----|
| 1 | Web-accessible **account-deletion URL** (Google Play now requires one, in addition to in-app delete) | ❌ Missing | I can build a `/legal/delete-account` page |
| 2 | **iOS Privacy Manifest** (`ios.privacyManifests` in `app.json`) for required-reason APIs | ❌ Missing | I can add it |
| 3 | Set **Privacy Policy URL** + **Support URL** in both store listings | ⬜ To do | You (see §3) |
| 4 | Set **age rating** in App Store Connect / Play (17+ per your Terms) | ⬜ To do | You |
| 5 | A **process to review reports within 24h** (no in-app admin UI — reports live in the `Report` table) | ⚠️ Operational | You |
| 6 | Login-screen Terms/Privacy links pointed at a dead `uevents.app` domain | ✅ Fixed (now use the hosted `/legal/*` pages) | Done |
| 7 | Privacy policy / Terms strengthened + provider names corrected (Brevo) | ✅ Done | Done |
| 8 | Professional legal review of Privacy + Terms | ⬜ Recommended | You |

Not legal, but launch-related: a **verified sending domain** in Brevo improves
password-reset/verification deliverability (currently sending "from" a gmail.com
address can land in spam).

---

## 1. What the app collects (data inventory)

| Data | Source | Purpose | Sent to servers? |
|------|--------|---------|------------------|
| Email address | Signup | Account, login, account emails | Yes |
| Password | Signup | Auth (stored only as a salted hash) | Yes (hash) |
| Name | Profile | Display, personalization | Yes |
| Program, year (students) | Profile | Display, aggregate stats | Yes |
| Club name, category, description, logo, contact, socials | Club profile | Public club page | Yes |
| Avatar / photos (profile, recap) | User-initiated upload | Display; hosted on Cloudinary | Yes |
| Posts, announcements, polls, comments, ratings, RSVPs, votes | User actions | Core functionality | Yes |
| Activity: follows, interest-follows, likes, bookmarks, views, check-ins | User actions | Feed + "For You" ranking | Yes |
| Push token | If notifications enabled | Event reminders/updates | Yes |
| Feedback (+ optional screenshot) | Settings → Send Feedback | Support | Yes |
| Reports, blocks | Moderation actions | Safety | Yes |
| Crash + usage diagnostics | Automatic, **if Sentry/PostHog enabled** | Bug-fixing, product analytics | Yes (to Sentry/PostHog) |

**Not collected:** device location (event locations are text typed by clubs, not
GPS), contacts, financial/health data, browsing history. Calendar and camera are
used **on-device only** when you choose to add an event or attach a photo — no
calendar/contacts data is uploaded. **No advertising or cross-app tracking SDKs.**

---

## 2. Apple — App Privacy ("nutrition label")

In App Store Connect → App Privacy. Answer **"Yes, we collect data,"** and
**"No"** to *Used for Tracking* (no ad networks / cross-app tracking → no ATT
prompt needed).

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|-----------|-----------|--------------------|-------------------|---------|
| Contact Info → Email Address | Yes | Yes | No | App Functionality |
| Contact Info → Name | Yes | Yes | No | App Functionality |
| User Content → Photos or Videos | Yes | Yes | No | App Functionality |
| User Content → Other User Content (posts, comments, polls) | Yes | Yes | No | App Functionality |
| Identifiers → User ID | Yes | Yes | No | App Functionality |
| Identifiers → Device ID (push token) | Yes | Yes | No | App Functionality |
| Usage Data → Product Interaction *(only if PostHog on)* | Yes | Yes | No | Analytics |
| Diagnostics → Crash Data, Performance *(only if Sentry on)* | Yes | Yes | No | App Functionality / Analytics |

Everything else (Location, Financial, Health, Contacts, Browsing/Search History,
Purchases): **Not Collected.** If you launch without Sentry/PostHog enabled, drop
those last two rows.

Also confirm in `app.json` / App Store Connect: `ITSAppUsesNonExemptEncryption:
false` is already set (avoids the export-compliance prompt) — correct, since you
only use standard HTTPS.

---

## 3. Google Play — Data Safety form

App content → Data safety. Key answers:

**Data types collected** (all: collected, **not** shared with third parties for
their own use, processed for app functionality/account management, not for ads):

- Personal info → **Name, Email address, User IDs** → Yes
- Photos and videos → **Photos** → Yes
- App activity → **Other user-generated content** (posts, comments, RSVPs) → Yes; **App interactions** → Yes *(if PostHog on)*
- App info and performance → **Crash logs, Diagnostics** → Yes *(if Sentry on)*
- Device or other IDs → **Device ID** (push token) → Yes
- Everything else (Location, Financial, Health, Messages, Contacts, Calendar, Web history, Installed apps) → **No**

> "Sharing" vs "collection": Cloudinary and Brevo are **processors** acting on
> your behalf, which Google generally treats as collection (not sharing). Declare
> them as collection. Only mark "shared" if a third party uses the data for their
> own purposes.

**Security section:**
- Encrypted in transit → **Yes** (HTTPS everywhere)
- Users can request data deletion → **Yes** (in-app + web URL — see action item #1)
- You can select the "deletion request" badge once the web deletion URL exists

**Data deletion (App content → separate section):** provide the **web URL** where
users can request account deletion (action item #1). In-app deletion already
exists at Settings → Delete Account.

---

## 4. UGC / Safety compliance (Apple Guideline 1.2 + Google UGC policy)

Apps hosting user content must have: content filtering, a report mechanism, user
blocking, a published EULA, and a commitment to **act on reports within 24 hours**
(remove content + eject the offender).

| Requirement | Status in app |
|-------------|---------------|
| Report/flag objectionable content | ✅ Reporting exists (posts, comments, users → `Report` table) |
| Block abusive users | ✅ Bidirectional blocking (`BlockedUser`); blocked users disappear from each other's threads |
| Content moderation / removal | ✅ `hidden` flag on posts/comments; recap photos held as `PENDING` for review |
| Filter objectionable content | ⚠️ Photos are held for review; **text has no automated filter** — report-based moderation is acceptable to Apple, but consider a basic word filter as a backstop |
| Act on reports within 24h | ⚠️ **Operational gap** — there's no in-app admin UI; reports sit in the DB. You need a way to review them (a query/dashboard) and a person to action them |
| Published Terms/EULA + Privacy | ✅ Hosted at `/legal/terms` and `/legal/privacy`, linked from signup and Settings |
| Account deletion in-app | ✅ Settings → Delete Account |

---

## 5. Age & consent

- **Age:** Terms state 17+. Set the store **age rating** to match (App Store
  Connect questionnaire → likely 17+; Google Play content rating (IARC) → likely
  Teen). No in-app age gate is strictly required for a 17+ general-audience app,
  but the rating must be set.
- **Consent:** Terms + Privacy are linked on the signup/landing screen and in
  Settings, which satisfies "reasonable notice." (Links now point to the hosted
  pages — previously broken.)
- **Not directed to children under 13** — stated in the policy; keep the store
  rating out of the "child-directed" bucket so you're not pulled into COPPA /
  Play Families requirements.

---

## 6. Canadian context (PIPEDA)

- You collect personal information with consent, for identified purposes (running
  the app), and provide access/correction/deletion — the core PIPEDA obligations.
  The revised policy now states these rights and names a contact.
- Data is processed by US-based providers (hosting, Cloudinary, Brevo, and
  Sentry/PostHog if enabled). The policy now discloses cross-border processing.
- If you expect Quebec users, **Law 25** has stricter consent/notice rules worth
  a look during legal review.

---

_Prepared as a starting point. Store policies change and this isn't legal
advice — verify the current App Store Connect / Play Console forms at submission
time and get the Privacy Policy and Terms reviewed before launch._
