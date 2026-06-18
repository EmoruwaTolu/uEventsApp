# uEvents — Improvement Plan (June 2026)

Rebuilt from a fresh audit. The old `TODOS.md` is badly stale: nearly all of the
"Round 2" launch-blockers and P1 security items are **already done** (waitlist model +
auto-promote, RSVP capacity transaction, club invite-code gating, account deletion,
report/block, helmet + CORS allowlist + rate limiting + zod validation + token
revocation, image resize/compress, push-tap navigation, deep-link sharing, conflict
badge, nested replies, offline banner, home FlatList + pagination, analytics CSV
export, per-club notification prefs). This list only tracks what's **actually open**.

---

## Done this session
- [x] Dead "SAVE FOR LATER" bookmark button now works (`SocialFeed.tsx` `ImageArticleCard`).
- [x] RSVP button no longer disappears on events that already have attendees (`EventFeedCard`).
- [x] Collapsed duplicate `useReducedMotion` → single `useReduceMotion` hook.
- [x] Bare share in `post-analytics/[id].tsx` now includes a `uevents://` deep link.

---

## P1 — Quick UI & responsiveness wins (low risk, high polish)

- [ ] **Font-scaling guards.** No `allowFontScaling`/`maxFontSizeMultiplier` anywhere; many
  fixed-`height` containers wrap text (category pills, type badges, RSVP buttons, date
  badges, tab labels). Large Dynamic Type clips them. Switch fixed `height:` → `minHeight:`
  on text containers and add `maxFontSizeMultiplier={1.3}` (or `allowFontScaling={false}`
  on tiny uppercase chrome labels).
- [ ] **Home filter bar locked to 40px.** `index.tsx` ALL/Event/Poll row uses
  `height: 40, maxHeight: 40` — pills clip as text grows. Let it size to content.
- [ ] **Fake attendee dots in feed.** `EventFeedCard` draws "X going" with random colored
  dots (`AVATAR_COLORS`) while the detail screen shows real avatars + names (`rsvpPreview`).
  Pass real preview data into the card, or drop the dots for a plain count.
- [ ] **`Dimensions.get` frozen in stylesheets.** Events search sheet `maxHeight`, profile
  clubs sheet `maxHeight`, and the `post/[id]` image carousel read `Dimensions.get` at
  render/module time — no rotation/split-view response. Switch to `useWindowDimensions()`.

## P2 — Accessibility (Tier 4 carryover, still mostly open)

- [ ] **Labels on interactive elements.** Only ~22 of ~799 pressables have
  `accessibilityLabel`. `SocialFeed` and `event/[id]` are well covered; the rest aren't.
- [ ] **44×44 minimum tap targets.** Many icon buttons render at 14–22px. Add padding/`hitSlop`.
- [ ] **Reduced-motion gating.** Only 3 of ~13 files using `Animated` gate on
  `useReduceMotion`. Wire the rest (feed card animations, poll bars, follow button, etc.).
- [ ] **Image alt text.** Most posters set a label now via `SafeImage`; audit the
  remaining raw `ExpoImage`/`Image` instances (club logos, profile avatars, carousels).

## P3 — Dark mode (scaffolded, intentionally deferred)

- [ ] **Activate the theme.** `ThemeProvider` is hardcoded to `lightColors` / `isDark:false`;
  `darkColors` is imported nowhere and `useColorScheme()` is never called. ~3-line fix.
- [ ] **Swap hardcoded hex.** Once active, `SocialFeed.tsx` (dozens of `#8C0327`/`#9CA3AF`/
  `#111827`/`#fff`) and ~26 components that never call `useTheme` (all create forms,
  `EventCard`, `CustomTabBar`, etc.) will still render light. Migrate them to `C.*` tokens.
- [ ] Add a dark-legible "liked" color token (poll card uses `#FF6B8A` as a one-off today).

## P4 — Performance & structure

- [ ] **Both home feed panes mount at once.** Following + For-You FlatLists are both live for
  the swipe animation, doubling cells/memory. Lazy-mount the inactive pane.
- [ ] **Profile/club lists use "Load more".** Functional but tap-based; consider
  `onEndReached` infinite scroll for parity with the home feed (optional).

## P5 — Features (post-polish)

- [ ] **Real-time poll results.** Votes are optimistic-local only — two users never see each
  other's votes without a reload. Poll the API (~10s while visible) or add a socket.
- [ ] **Undo comment delete.** 3s "Undo" toast before firing the delete API.
- [ ] **Email verification / school-domain gating.** Any email can register today; meaningful
  for a campus app's trust model. Verify on signup, optionally restrict to school domain.
- [ ] **Recurring events.** Weekly club meetings currently require re-posting.
- [ ] **Multiple managers per club.** One shared login today; add a `ClubMember` join table
  with roles.
- [ ] **"Add to calendar" staleness.** Store the calendar event ID and offer "Update calendar"
  when `startAt` changes after a user has added it.

---

## Suggested order
1. P1 (fast, visible, low risk) — knock out in one pass.
2. P3 dark mode + P2 accessibility together (both touch the same color/label sweep).
3. P4 perf cleanup.
4. P5 features by value: real-time polls → email verification → the rest.
