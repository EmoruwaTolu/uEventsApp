# uEvents — TODOs

_Regenerated July 2026 from a fresh code audit. Previous lists were stale — nearly
everything on them is shipped (real-time polls, undo delete, forgot-password,
waitlist model, For You ranking, lazy feed panes, etc.). This tracks only what's
actually open._

---

## P0 — Before TestFlight

- [x] **Report review surface.** Added `ADMIN` UserType + `requireAdmin` guard,
  `GET /reports` (admin list with target previews, `?status=open|resolved|all`),
  and `PATCH /reports/:id` with `hide` / `delete` / `dismiss` actions. `hidden`
  flags on Post/Comment exclude moderated content from all public feeds, detail,
  search, club profiles, comments, and recaps. Migration + tests included.
  (Run `npx prisma migrate dev` + `npm test` in the backend env to apply/verify.)
- [x] **Share link web fallback.** Added `GET /share/event/:id` and
  `/share/post/:id` — self-contained HTML preview (poster, title, date, OG tags)
  with deep-link hand-off + App Store / Play Store buttons. Mobile `Share.share`
  now sends `${API_BASE}/share/...` instead of `uevents://`.

## P1 — Shortly after launch

- [ ] **Friends-lite / "going with."** RSVPs are already stored. Skip the full friend
  graph: surface "2 people you follow clubs with are going" style signals from
  existing data first.
- [x] **"Show less like this" on For You reason chips.** Reason chips now render on
  For You cards with a "Show less" action → `POST /posts/:id/show-less` records a
  `FeedSignal` (post + club + categories). The ranker suppresses the exact post and
  down-ranks matching clubs/categories (capped). Signals double as queryable tester
  feedback. Migration + tests included.
- [x] **Weekly digest push.** Added `backend/src/jobs/weeklyDigest.ts` (+ `DIGEST`
  NotifType). Sunday-evening job (hourly check, idempotent 6-day per-user guard)
  sends "Your week: N RSVPs, M events matching your interests," reusing interest +
  club-follow signals. Wired into `index.ts`; scoped `userIds` option for targeting.
  Tests included.
- [x] **Recap photo moderation.** Attendee recap photos now upload as `PENDING`
  (`EventPhotoStatus` enum) and only publish once the club approves them
  (`PATCH /posts/:id/recap/photo/:photoId`); the club's own uploads auto-approve.
  Recap GET filters by status (viewers see approved + their own; owner sees all +
  `pendingPhotoCount`). `lib/moderation.ts` provides a seam for an automated
  provider (Cloudinary/Rekognition/Hive), failing safe to manual review. Mobile
  shows a "Pending" badge + owner approve/reject controls. Tests included.
- [x] **Waitlist position.** RSVP endpoint + post detail now return
  `waitlistPosition`; the event screen shows "#3 in line" (or "You're next in line")
  under the ON WAITLIST button, and refreshes after joining/leaving. Tests included.
- [x] **"X spots left" badge** on near-capacity events. `capacity` now flows through
  the For You + following feed payloads; event feed cards show an amber "N spots left"
  badge when ≤10 remain, or a "Full" badge at capacity.

## P2 — Structural

- [x] **Club self-signup with admin approval.** Clubs now self-register into a
  `PENDING` queue (`clubStatus` on User); the shared `CLUB_INVITE_CODE` is now an
  optional trusted auto-approve fast-path, not the only gate. `requireApprovedClub`
  blocks publishing until approved. Admin queue: `GET /clubs/pending` +
  `PATCH /clubs/:id/approval` (approve/reject + reason, notifies the club). App:
  invite code optional at signup, pending banner on the create tab. Tests included.
- [ ] **Multi-manager clubs.** Design doc exists (`docs/DESIGN_multi_manager_clubs.md`)
  but no member/manager model in schema — clubs are still one shared login.
  _(Intentionally skipped this round.)_
- [x] **ICS subscription feed.** Per-user `calendarToken` + public
  `GET /calendar/:token.ics` (VCALENDAR of RSVP'd events). `GET /users/me/calendar`
  returns the https + `webcal://` subscribe URLs (rotatable). Settings has a
  "Subscribe to my events" row that hands off to the OS. Tests included.
- [x] **Accessibility sweep (substantial pass).** Global font-scaling cap applied at
  the root layout (covers all screens, not just the 3 tabs). Labels + roles added to
  the shared auth components (buttons, inputs, password toggle → covers login/forgot/
  reset), `EventCard`, `DateCarousel`, and the check-in screen. _Remaining: per-screen
  label pass on the create-flow components, club-onboarding, and profile; reduced-motion
  gating on secondary animations — inherently iterative, continue as needed._

## Deferred (intentionally)

- Dark mode (scaffolded — `ThemeProvider` hardcoded light; ~3-line activation + hex
  sweep when wanted).
- Campus map / "near me" view.
