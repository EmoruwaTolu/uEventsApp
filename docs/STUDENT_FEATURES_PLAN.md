# Student-Facing Features — Build Plan

The organizer side (analytics, check-in, waitlist, recurring events) is mature.
This plan targets the **student** side: discovery, coordination, and re-engagement.
Grounded in the current model — clubs are `User` rows (`type=CLUB`); posts carry
`type / locales / startAt / endAt / locationName / address / categories[] / capacity /
images[]`; `Follow` is student→club; `Rsvp`, `CheckIn`, `Bookmark`, `Notification`,
push, and Cloudinary uploads already exist.

Phased best-bang-for-buck first. Each phase is independently shippable.

---

## Status (June 2026)

- ✅ **Phase 1 — shipped:** free-food flag + filter + Free Food Alert companion link; "Get directions".
- ✅ **Phase 2 — shipped:** follow topics (feed blend + notifications); "My Week" (delivered by enhancing the existing Events-tab agenda with one-tap directions).
- ⏭ **Phase 3 — skipped (for now):** map/near-me and friends-going both deferred — friends-going needs a full social/connection graph we decided not to build yet.
- ✅ **Phase 4 — shipped:** attendance history + gentle semester recap; post-event recaps (5-star + photos, attendee-only contribution, public view, per-event privacy toggle).

Backend requires `npm run db:generate && npm run db:migrate` to apply: `add_email_verification`,
`add_event_series`, `add_free_food`, `add_interest_follow`, `add_event_recaps`.

Remaining polish ideas: day-section headers ("Tomorrow", weekday) on the My-Week agenda;
a subtle "topic" tag on feed items surfaced via interest-following; and Phase 3 if/when wanted.

---

## Phase 1 — Quick wins  ✅ Shipped

### 1. Free-food flag + filter
- **Why:** the single most campus-specific feature; students actively hunt free food.
- **Data:** add `freeFood Boolean @default(false)` to `Post`. (Recommend a dedicated
  boolean over a "Free Food" category so it filters independently of topic tags.)
- **API:** accept in create/edit; include `freeFood` in feed items; support a feed filter.
- **Frontend:** toggle in `CreateEventForm`; 🍕 "FREE FOOD" badge on event cards + detail;
  a filter pill in the home filter row and the Events screen.
- **Effort:** S. **Decision:** boolean (recommended) vs reserved category.
- **Relationship to uOttawa "Free Food Alert" (freefoodalert.com):** complementary, not a
  duplicate. FFA is *real-time surplus/leftovers* (alerts expire ~15 min, posted by
  faculty/staff/caterers after events). Our flag is *planned* free food on scheduled club
  events. No public API is advertised, so leverage options are:
  - **Companion link (easy):** a "Free Food Alert" entry point that deep-links to FFA's
    live-giveaways page / app and nudges students to subscribe.
  - **Partnership (bigger):** uOttawa already holds an FFA membership — ask FFA LLC for a
    feed/API to surface live giveaways in-app. Relationship step, not just code.
  - Note: FFA gates on `@uottawa.ca` verification, which matches the email-verification +
    school-domain gating already built.

### 2. "Get directions"
- **Why:** events store a location string but there's no way to navigate to it.
- **Data:** none (uses existing `locationName` / `address`).
- **Frontend:** a "Get directions" button on event detail that `Linking`s to Apple/Google
  Maps with `address || locationName`; keep showing building + room text.
- **Effort:** S.

---

## Phase 2 — Discovery & utility (mostly existing data)  ✅ Shipped

### 3. Follow topics (not just clubs)
- **Why:** today you can only follow clubs, so you miss events in topics you care about
  from clubs you haven't found.
- **Data:** new `InterestFollow { userId, category }` (unique per pair).
- **API:** `GET/POST/DELETE /users/me/topics`; feed surfaces posts whose `categories`
  intersect followed topics even from unfollowed clubs; extend notification fan-out so a
  new post also notifies users following any of its categories.
- **Frontend:** topic picker (in onboarding + search/explore), followed-topics management,
  topic posts flow into the feed.
- **Effort:** M. **Decisions:** lock a canonical category taxonomy (you already have
  `eventTags`/`categories`); do topic events join the Following feed or a separate lens?

### 4. "My Week" personal agenda
- **Why:** the screen students would open every morning — everything they're going to.
- **Data:** none (RSVPs + `startAt`).
- **API:** `GET /users/me/agenda` (upcoming RSVP'd events grouped by day) — can extend the
  existing `/users/me/rsvps`.
- **Frontend:** a screen grouping RSVP'd events by Today / Tomorrow / this week, each row
  with time, location, one-tap directions (Phase 1 #2), reminder toggle, and add-to-calendar
  (reusing the calendar sync already built). Empty state → browse events.
- **Effort:** M.

---

## Phase 3 — Bigger swings (pick based on priority)  ⏭ Skipped for now

### 5. Map / "near me" / "happening now"
- **Why:** highest-value discovery surface — what's around me right now.
- **Data:** add `lat Float?` / `lng Float?` to `Post`; populate via a **curated campus
  building → coords table** (recommended for a single campus: accurate, no external API)
  or server-side geocoding of `address`.
- **API:** events with coords; optional `/events/nearby`.
- **Frontend:** `react-native-maps` view with pins for today/selected day; a "on now /
  tonight" time filter; tap pin → event.
- **Effort:** L. **Decisions:** building lookup (recommended) vs geocoding; map provider.

### 6. "Friends going" (student social graph)
- **Why:** the stickiest campus hook — social proof ("3 people you know are going").
- **Data:** new `Connection { userId, friendId, status }`; today follows are only
  student→club, so this is a new graph. Reuse existing RSVP privacy (`hideAttendeeList`).
- **API:** send/accept/list connections; on feed/detail, compute "N friends going" from
  RSVPs ∩ connections.
- **Frontend:** find/add friends (name / email / QR), requests inbox, friend avatars on
  events, a privacy toggle for who can see your RSVPs.
- **Effort:** L. **Decisions:** mutual friend vs one-way follow; default RSVP visibility;
  how people find each other.

---

## Phase 4 — Re-engagement  ✅ Shipped

### 7. Attendance history + light streaks
- **Why:** `CheckIn` already records real attendance — surface it.
- **Data:** none new (derive from `CheckIn`).
- **API:** `GET /users/me/attendance` (past checked-in events, counts by semester/category).
- **Frontend:** a profile section "Events attended" + a gentle, non-competitive recap
  ("12 events this semester"), maybe a small badge.
- **Effort:** S–M.

### 8. Post-event recaps (photos + quick rating)
- **Why:** brings people back into the app after an event ends; gives clubs feedback.
- **Data:** new `EventPhoto { postId, userId, url }` and `EventRating { postId, userId,
  rating }`; images via existing Cloudinary uploads.
- **API:** after event end, attendees POST a photo / rating; `GET` recap (gallery +
  average rating); reuse `Report`/`BlockedUser` for moderation.
- **Frontend:** a post-event state on event detail ("How was it?" rating for attendees +
  a photo gallery); clubs see aggregate feedback in analytics.
- **Effort:** M–L. **Decisions:** attendee-only vs public viewing/upload.

---

## Suggested sequence
1. **Phase 1** (free food + directions) — one fast pass, immediate delight.
2. **Phase 2** (topic following + My Week) — discovery + the daily-open screen, mostly
   existing data.
3. **Phase 3** — Map *or* Friends, depending on whether the priority is *finding* events
   or *coordinating* with people.
4. **Phase 4** — attendance history, then recaps.

## Cross-cutting notes
- New models each need a migration (`npm run db:generate && npm run db:migrate`).
- Notifications reuse the existing `Notification` model + Expo push.
- Image features reuse the existing Cloudinary upload route.
- Moderation (recaps, friend abuse) reuses the existing `Report` / `BlockedUser` flow.
