# uEvents — TestFlight Launch Checklist

A step-by-step guide to get the current build into testers' hands. Work top to
bottom — the backend must be deployed before the app build is useful.

---

## 1. Backend — deploy the latest code to Render

The app now depends on backend changes (attendance streak/free-meals, hero
`rsvpPreview`, feed `isBookmarked`, club signup, moderation/reports, weekly
digest, club approval + calendar feed, and top-comment upvotes). Until Render
runs the updated code, those features silently fall back to empty/zero.

- [ ] Commit and push the `backend/` changes to the branch Render deploys from.
- [ ] Confirm Render auto-deployed (or trigger a manual **Deploy → Deploy latest commit**).
- [ ] Watch the deploy logs for a clean build + start (Prisma client generates on build).
- [ ] **Run the pending migrations against production.** The build only runs
      `prisma generate && tsc` — it does **not** apply migrations automatically.
      Several migrations were added since the last deploy (moderation, feed
      signals, recap moderation + digest, club approval + calendar, and the
      `CommentUpvote` table for top comments). If any are unapplied, those
      features will 500 against the live DB. Apply them one of two ways:
  - Locally, pointing at the production `DATABASE_URL`:
    `cd backend && npx prisma migrate deploy`, **or**
  - Add `prisma migrate deploy` to the Render build/pre-deploy command so it
    runs on every deploy (recommended going forward).
- [ ] Confirm `npx prisma migrate status` reports "Database schema is up to date."

**Env vars (Render → service → Environment).** Confirm these are set:

- [ ] `DATABASE_URL` — the Render Postgres connection string
- [ ] `JWT_SECRET`
- [ ] `PORT` (Render usually injects its own; your app reads `PORT`)
- [ ] `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
- [ ] **`CLUB_INVITE_CODE`** — set this (e.g. `CSSA-CLUBS-2026`). Club signup is
      rejected if it's missing. This is the value organizers type on the club form.
- [ ] `RESEND_API_KEY` *(optional)* — only needed if you want verification /
      password-reset emails to actually send. The app works without it.
- [ ] Leave `SCHOOL_EMAIL_DOMAINS` **unset** for an open beta (any email allowed).
      Set it later if you want to restrict signups by domain.

**Verify it's live:**

- [ ] Open `https://ueventsapp.onrender.com` in a browser — it should respond
      (the server is awake; a blank/404 root is fine, the API lives under paths).
- [ ] Note: Render's free tier cold-starts (~30–50s) after idle. The app's request
      timeout was raised to 45s to tolerate this, but the **first** request of the
      day may still be slow for a tester.

---

## 2. Provision club tester accounts

There's no public club signup gate beyond the invite code, so:

- [ ] Share the `CLUB_INVITE_CODE` value with your club organizers (privately).
- [ ] They create a club account in-app via **Create a club account** (club name,
      contact email, optional category, invite code, password).
- [ ] First launch drops them into the club-onboarding flow automatically.

---

## 3. Pre-build sanity checks (local)

From `uEvents/`:

- [ ] `npx tsc --noEmit` → no errors (currently clean).
- [ ] `npx expo-doctor` → resolve any flagged issues.

From `backend/` (against a **throwaway/test** database, not production):

- [ ] `npm test` → Jest suite passes.

On a real device or simulator (`npx expo start -c`), smoke-test the flows we changed:

- [ ] **Events tab** — stats (streak / attended / free meals), NEXT UP hero with
      live badge + GOING button, RSVP from "Today on Campus" animates smoothly.
- [ ] **Likes** — like a post in the detail view, go back to the feed → reflects instantly.
- [ ] **Bookmarks** — same instant sync across feed ↔ detail.
- [ ] **Create event** — date picker is legible (not black), date+time in one wheel,
      a same-day end time is selectable.
- [ ] **Club signup** — works with the invite code; wrong code is rejected.
- [ ] **Language** — switch to French in Settings; auth screens, alerts, and the
      events tab all translate.
- [ ] **Push notifications** — only testable in a real build (next step), not Expo Go.

---

## 4. Build for iOS (EAS)

`eas.json` already injects `EXPO_PUBLIC_API_BASE=https://ueventsapp.onrender.com`
into the build profiles, and `app.json` has the camera/photo/calendar permission
strings and bundle id `com.cssa.uevents`.

- [ ] `npm i -g eas-cli` (if not installed) and `eas login`.
- [ ] Confirm you're on the right Expo account/project (`app.json` → `extra.eas.projectId`).
- [ ] `eas build --platform ios --profile production`
- [ ] When prompted, let EAS manage credentials (Apple Distribution cert +
      provisioning profile + push key). You'll need your **Apple Developer** login.
- [ ] Wait for the build to finish and download/verify the `.ipa` in the EAS dashboard.

---

## 5. Submit to TestFlight

- [ ] `eas submit --platform ios --profile production` (or upload the build via
      Transporter / App Store Connect).
- [ ] In **App Store Connect → your app → TestFlight**, wait for the build to finish
      processing (a few minutes to ~an hour).
- [ ] Complete the **Test Information** and **export compliance** prompts.
- [ ] Add testers:
  - **Internal testers** (up to 100, your team) — fastest, no review.
  - **External testers** (friends) — requires a quick Beta App Review first.
- [ ] Send the invite (email or public TestFlight link).

---

## 6. After testers are in

- [ ] Ask testers to install **TestFlight** from the App Store, then open your invite.
- [ ] Warn them the very first load may take ~30–50s if the backend was idle (cold start).
- [ ] Collect feedback (TestFlight has built-in screenshot feedback).
- [ ] Watch the Render logs for backend errors during real usage.

---

## Known follow-ups (not blockers)

- Push notifications: verify end-to-end in the real build (APNs key via EAS).
- Backend Jest tests: run locally against a test DB before each release.
- Optional: a crash/error reporter (e.g. Sentry) to see what breaks in the wild.
- Optional: dead-code cleanup (unused category filter state/styles, `endedToday`,
  `formatDateLabel`).
- Areas not yet deep-reviewed for bugs: club admin screens beyond what was audited,
  offline behaviour, RSVP capacity/waitlist edge cases.

---

## Quick reference

| Item | Value |
|---|---|
| Production API | `https://ueventsapp.onrender.com` |
| iOS bundle id | `com.cssa.uevents` |
| Club invite code | `CSSA-CLUBS-2026` *(change as you like; keep `.env` + Render in sync)* |
| Build command | `eas build --platform ios --profile production` |
| Submit command | `eas submit --platform ios --profile production` |
| Run locally | `npx expo start -c` |
