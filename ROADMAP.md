# uEvents — Roadmap & Inventory

_Last updated: June 2026 • Target: TestFlight at the start of July_

## 1. What we have today

uEvents is a uOttawa student-events platform: an Expo / React Native app (`uEvents/`) on an
Express + Prisma + PostgreSQL backend (`backend/`). The core loop works end to end — clubs
post events, students discover them, RSVP, like, bookmark, comment, and get reminders.

**Core**
- Auth with email verification + school-domain gating; club onboarding flow.
- Home feed with two panes: **Following** (`/posts/feed`, followed clubs boosted) and
  **For You** (currently just `/posts/popular`).
- Discover tab: Today carousel, This Week / This Month agenda, topic following, latest updates,
  clubs to discover.
- Event detail: RSVP (with capacity / waitlist / approval states), like, bookmark, comments,
  share, calendar sync, directions, recaps.

**Feature set added recently**
- **Recurring events** — schema, backend generation, create-form UI with multi-weekday picker,
  and edit-scope handling (this / all / future occurrences).
- **Free food** — backend flag, toggle + badges + feed filter, "get directions," and a companion
  link to uOttawa's Free Food Alert.
- **Topic following** — follow interests and receive them in-feed even from unfollowed clubs;
  "My Week" agenda on the Events tab.
- **Attendance + recaps** — attendance history with a streak; post-event recaps (public view,
  attendee-only contribution with photos and ratings).
- **Trust / safety plumbing** — email verification, multiple managers per club, basic reporting
  and moderation hooks.

**UI maturation**
- Profile redesign (sectioned scroll), all modals unified as full-screen pages.
- Discover redesign: feed-style event cards, polished day-grouped agenda rows, warm hairline
  borders, consistent tag / RSVP styling.
- Event likes for students; request timeout so failures surface instead of hanging; editorial
  toast restyle (theme-aware).

**Health**
- Frontend typechecks completely clean (0 errors).
- No automated test coverage yet — changes are verified via typecheck + manual QA.

## 2. The blocker before anything ships

None of the recent backend-dependent features are live. Before they can be seen or tested:
1. `prisma generate` + `prisma migrate deploy` against the production DB.
2. Deploy the updated backend.
3. Point the app's `EXPO_PUBLIC_API_BASE` at it.
4. Device QA pass on the new flows (RSVP, like, topics, recaps).
5. If `backend/.env` was ever pushed to git, rotate those secrets (it is gitignored now).

## 3. Next direction — Smarter Discovery

**Goal for the TestFlight:** make discovery feel personal and *visibly* smart, so testers can
react to whether the ranking is right. Not an ML system — a transparent, signal-based ranker.

### 3a. "For You" ranking (the build)
Replace `/posts/popular` (in the For You pane) with a new `GET /posts/for-you` that scores
upcoming, non-expired events the user hasn't already RSVP'd to:

- **Followed club** — strong boost.
- **Followed topic / category match** — strong boost.
- **Popularity** — RSVP + like counts (log-scaled so a few big events don't dominate).
- **Time proximity** — sooner events rank higher; past events excluded.
- **Cold-start fallback** — for users with no follows, lead with trending + diverse categories.

Each result carries a `reason` label, surfaced as a chip on the card:
"Because you follow Engineering Society," "Matches your interest: free food," "Popular this week."
Those chips are the feature's visible payoff and the thing testers give feedback on.

### 3b. Demo seed data (dependency)
Discovery is only as good as its data. Expand `seed-phase4.ts` into a believable dataset —
varied clubs across categories, ~40 upcoming events at mixed times (some free food), populated
RSVPs/likes, and a demo student with a few pre-follows — so the For You feed looks smart in the
test environment.

## 4. TestFlight checklist (early July)

- [ ] Backend migrated + deployed; app pointed at it.
- [ ] Realistic seed data loaded.
- [ ] Club logins prepared and handed to authoring testers.
- [ ] For You ranking + reason chips live.
- [ ] Device QA pass: sign-up, RSVP, like, follow club/topic, recaps.
- [ ] Secrets rotated if ever exposed.

## 5. After the test

- **Club self-signup** — a registration / application + admin-approval flow. Handing out logins
  works for a closed test but doesn't scale past this round.
- **Deepen social** — friends / "going with," see what classmates attend.
- **Dark mode (P3)** — deferred; theme infrastructure exists and newer components are already
  theme-aware, so it's a bounded audit of remaining hardcoded colors.
- **Automated tests** — establish coverage so changes aren't typecheck-and-eyeball only.
