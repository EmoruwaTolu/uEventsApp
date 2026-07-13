# uEvents — Beta Audit & Plan

_July 12, 2026 • Full code review of `uEvents/` (app) + `backend/` during TestFlight beta._
_App typechecks clean. Backend tsc errors locally are a stale generated Prisma client only._

Overall: core loop is solid — RSVP/waitlist is properly transactional, moderation and
self-signup plumbing are in place, TODOS.md is accurate. The items below are what's left,
ordered by how much they affect beta testers.

> **Status (July 12):** two batches done and in the working tree. **Batch 1** — P0 items 1–6,
> plus 8 (poll expiry), 13, and 14. **Batch 2** — the engagement + App Store UGC pass: A
> (comment/reply notifications), B (blocking end-to-end), and 7 / 10 / 12 (draft/hidden
> guards, comment post-state check, check-in replay window). Items marked ✅ below are fixed.
>
> **Before shipping Batch 2:** run `prisma migrate deploy` (new migration
> `20260712000000_add_comment_notifs` adds the `COMMENT`/`REPLY` enum values) and regenerate
> the Prisma client. Batch 2 touches native modules (new screen, notification enum) so it
> needs a **new TestFlight build**, not just OTA; Batch 1 was OTA-eligible.
>
> **Batch 3 (in the working tree, uncommitted):** C (going-with) + D (feed pagination). Both
> the app and backend typecheck clean (0 errors). Ships in the same new TestFlight build as
> Batch 2 — no extra migration needed.

---

## P0 — Bugs likely biting testers right now

1. ✅ **Rate limiter is broken behind Render's proxy.** `app.ts` never calls
   `app.set("trust proxy", 1)`, so every request appears to come from the proxy IP and all
   users share one bucket: **10 login attempts/min and 300 requests/min across the entire
   beta combined**. A few simultaneous testers → random 429s. _Fix: one line in
   `backend/src/app.ts`. ~5 min._

2. ✅ **Emails are case-sensitive.** Signup/login/forgot-password in `routes/users.ts` use the
   raw email. `Jane@uOttawa.ca` ≠ `jane@uottawa.ca` → "Invalid credentials", duplicate
   accounts, reset emails that never arrive. _Fix: `.trim().toLowerCase()` at all four
   backend entry points; optionally a one-time migration to lowercase existing rows. ~30 min._

3. ✅ **Push tap does nothing on cold start.** `lib/usePushNotifications.ts` only registers
   `addNotificationResponseReceivedListener`; when the app is killed, the launch
   notification is never read. Testers tap "New event from X" and land on the home feed.
   _Fix: also handle `Notifications.getLastNotificationResponseAsync()` on mount. ~20 min._

4. ✅ **iOS badge never clears.** `shouldSetBadge: true` but `setBadgeCount(0)` is never
   called. The red badge sticks forever. _Fix: clear on app foreground + when notifications
   screen is opened. ~15 min._

5. ✅ **Waitlist promotion sends no push.** `DELETE /posts/:id/rsvp` creates the in-app
   "You're in!" notification but never calls `sendExpoPush` — the single most time-sensitive
   notification in the app arrives silently. _Fix: send push in the same block. ~15 min._

6. ✅ **The push-notifications settings toggle is mostly a no-op.** `user.pushNotifs` is only
   respected by the weekly digest. `notifyFollowers`, `notifyRsvpd`, and the event-reminder
   job all push regardless of the setting. Testers who turn notifications off keep getting
   them. _Fix: filter recipients on `pushNotifs` in `posts.ts` helpers + `jobs/eventReminders.ts`. ~30 min._

## P1 — Correctness, safety, hardening

7. ✅ **Drafts and hidden posts aren't protected.** `GET /posts/:id` checks `hidden` but not
   `isDraft`; RSVP, like, bookmark, comment, vote, and view endpoints check neither. Anyone
   with an ID can read and interact with unpublished or moderated content (e.g. a post a
   club unpublished stays reachable from a student's bookmarks). _Fixed: added a shared
   `requireVisiblePost` guard (404s hidden/draft posts for non-owners) on view/like/bookmark/
   comment/vote/RSVP/check-in, plus the `isDraft` check in the detail route. Withdrawal routes
   (unlike/unbookmark/un-RSVP) stay open so nobody is trapped once a post is pulled._

8. ✅ **Poll expiry is UI-only.** `POST /posts/:id/vote` never checks `pollExpiresAt` (the
   detail screen blocks it, the API doesn't). _Fixed: the vote route now rejects votes with
   409 once `pollExpiresAt` has passed._

9. **`PATCH /posts/:id` is the only unvalidated write route.** No zod schema;
   `parseInt(capacity)` can produce NaN → Prisma 500; garbage `startAt` → Invalid Date → 500.
   Also: clubs can never *clear* `capacity`/`endAt`/`startAt` once set (null coerces to
   "leave unchanged"). Reuse `createPostSchema.partial()` + explicit null handling.

10. ✅ **`GET /posts/:id/comments` ignores post state** (no auth, no hidden/draft check) —
    comments on moderated posts remain publicly readable. _Fixed: the route now runs
    `optionalAuth` + `requireVisiblePost`, so hidden/draft posts' comments 404 for non-owners._

11. **Error handler leaks internals.** `middleware/errors.ts` echoes raw `err.message` on
    500s — Prisma errors expose schema/query details to clients. Return a generic message
    for status ≥ 500, log the real one.

12. ✅ **Check-in QR is replayable.** Token is a static HMAC of postId — a screenshot lets
    anyone "attend" from home, inflating streaks and free-meal stats. _Fixed: check-ins are
    now bounded to the event window (start − 30 min → end + 2 h; 3 h fallback when no end
    time), so a leaked code can't be replayed from home._

13. ✅ **Reminder job doesn't exclude `hidden`** — moderated events still send "starting soon".
    Same one-word fix in `jobs/scheduledPublish.ts` if applicable. _Fixed alongside item 6:
    `hidden: false` added to the reminder query and the scheduled-publish query._

14. ✅ **Account deletion leaves poll votes behind.** `PollVote` has no user FK, so deletion
    succeeds but the deleted user's votes remain counted. _Fixed:
    `tx.pollVote.deleteMany({ where: { userId } })` added to the `DELETE /users/me`
    transaction._

15. **Weekly digest fires at 18:00 UTC** (Render server time) = 2 p.m. Ottawa. Check
    against `America/Toronto` instead.

## Missing features — highest student value first

A. ✅ **Comment & reply notifications (biggest engagement gap).** Nobody is told when a
   student comments on a club's post, when someone replies to them, or when a club replies.
   Threads die unless people re-check manually. _Done: `notifyOnComment` in
   `POST /posts/:id/comments` notifies the post owner (COMMENT) and the parent-comment author
   on replies (REPLY), deduped (a reply to the owner's own comment sends one row), never
   self-notifies, and respects `pushNotifs` for the push. New `COMMENT`/`REPLY` NotifType
   values (migration `20260712000000_add_comment_notifs`); notifications screen gets icons
   + deep-links to the comment thread. Requires `prisma migrate deploy` + regen._

B. ✅ **Blocking: endpoints exist, feature doesn't.** No block UI anywhere in the app, and
   `BlockedUser` is never used in any query — blocked users' comments still appear.
   **App Store Guideline 1.2 (UGC) requires working block + report for full release** —
   report exists, block doesn't. _Done: `GET /posts/:id/comments` now filters blocked users
   bidirectionally (both top-level and replies) via a `blockedUserIds` helper; the comment
   report flag became an overflow menu with Report + Block on both the post and event screens
   (self-guarded); `GET /users/me/blocks` returns display info; and a new **Settings →
   Privacy → Blocked users** screen (`app/blocked-users.tsx`) lists and unblocks them. This
   closes the UGC compliance gap._

C. ✅ **Friends-lite "going with"** (already P1 in TODOS). `rsvpPreview` already exists on the
   detail endpoint — surfacing "Maya + 2 others are going" on feed cards is mostly
   presentation work. _Done: both `/feed` and `/for-you` now include an `rsvpPreview` (first
   3 attendees) for events; feed event cards render an attendee avatar-stack + a
   "Maya, Jordan +N going" line (`goingSummary`, en/fr). On For You the preview reuses the
   existing attendee include and `isRsvped` is derived from a separate query._

D. ✅ **Feed pagination.** For You caps at 25, Following at 60, no cursor anywhere.
   `SocialFeed` already accepts `onEndReached` — the client is ready, the backend isn't.
   _Done: `/feed` honours `limit`/`offset` (chronological, stable window). `/for-you` scores
   a fixed 150-candidate pool and slices `[offset, offset+limit]` so the ranking is coherent
   across pages. The For You tab is now wired to `onEndReached` (`loadMoreForYou`), both feeds
   dedupe on append and track a server-count offset so paging can't stall._

E. **Search depth.** `/search` loads the latest 200 posts and filters in memory, and only
   matches the `en` locale (first-locale fallback) — older and French-first events become
   unfindable. Post-beta: Postgres full-text search over a generated title/body column.

F. _(idea)_ **"Add series to calendar"** — single events sync to calendar, but recurring
   series require adding each occurrence one at a time. The per-user ICS feed already
   solves this; consider pointing the event screen's calendar action at it for series.

## Beta operations & QoL

- **Render cold start is the worst first impression** — 30–50 s of skeletons after idle
  (acknowledged in `lib/api.ts`). Options: uptime ping on `/health` every 10 min (free),
  paid instance, and/or an explicit "Server waking up…" state instead of skeletons.
- **Crash/error visibility: add Sentry** (`sentry-expo` + backend SDK). Right now a tester
  crash is invisible unless they report it. ~1 h, disproportionate payoff during beta.
- **You already have EAS Update configured** — use OTA updates to ship the P0 fixes to
  testers without a new TestFlight build (JS-only changes qualify).
- **Tester feedback loop:** `/feedback`, `/reports`, and `FeedSignal` rows are all
  queryable — schedule a weekly pass over all three while the beta runs.
- **Android manifest requests `RECORD_AUDIO`** — nothing uses it (camera is for QR).
  Remove before Play submission; permission reviewers flag it.

## App Store readiness (beyond TestFlight)

- [x] Block users — UI + enforcement (item B) — **required for UGC apps**
- [x] Report content + moderation queue (`/reports`, hidden flags)
- [x] Account deletion in-app (`DELETE /users/me`)
- [x] Privacy policy / terms endpoints (`routes/legal.ts`) — link them in App Store Connect
- [x] `ITSAppUsesNonExemptEncryption` set
- [ ] Support URL / contact for the listing (APP_STORE_LISTING.md)
- [ ] Set `APP_STORE_URL` / `PLAY_STORE_URL` env vars so share-page buttons point at the
      real listing once live

## Post-beta backlog (unchanged from ROADMAP, still agreed)

- Multi-manager clubs (design doc exists; skipped intentionally)
- Dark mode (~3-line activation + hex sweep)
- Campus map / "near me"
- Frontend automated tests (backend has coverage; app is typecheck + manual QA)
- Remaining accessibility pass (create flow, club onboarding, reduced-motion gating)

---

## Suggested sequence

**This week (one sitting, ship via OTA + redeploy):** ✅ done — P0 items 1–6, plus 8, 13,
and 14. All small, contained changes; changes are in the working tree, not yet committed.

**Next:** ✅ done — A (comment notifications) → B (blocking) → 7/10/12 (draft/hidden guards,
QR window). Closed the engagement gap and the App Store UGC gap in one pass. Ships as a new
TestFlight build (native surface changed); run `prisma migrate deploy` + regen first.

**Then:** ✅ done — C (going-with) and D (pagination), the headline improvements for the next
TestFlight build. 9, 11, 15 remain as background hardening.

**Ongoing:** uptime ping + Sentry now; weekly feedback/reports/FeedSignal review.
