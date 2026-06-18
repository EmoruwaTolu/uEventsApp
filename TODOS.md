# uEvents — Improvements & Fixes

---

## Tier 1 — Blockers (must fix before real users)

- [x] **Image upload is a no-op stub** — Created `lib/uploadImage.ts` utility that POSTs `multipart/form-data` to `/uploads` and returns the hosted URL. Wired into `CreateEventForm`, `CreatePollForm`, `CreateAnnouncementForm`. Existing remote URLs are passed through without re-uploading. **Backend still needs a `POST /uploads` endpoint that returns `{ url: string }`.** ✓
- [x] **Drafts are hardcoded demo data** — `drafts.tsx` already fetches from `/posts/mine?isDraft=true` (was already correct). Removed hardcoded `DRAFTS` array and dead `getDraft`/`getAllDrafts` from `lib/draftsStore.ts`. Removed dead `getDraft` usage from `create.tsx`. ✓
- [x] **Double-tap submit creates duplicate posts** — All create forms already have `disabled={submitting}` correctly wired. ✓
- [x] **Silent form submission failures** — Comment submit and delete now show `Alert` on failure. ✓

---

## Tier 2 — High Priority

- [x] **Remove debug logs** — Removed `console.log` from `lib/api.ts`, `auth/AuthContext.tsx`, `app/(tabs)/create.tsx`. ✓
- [x] **Clean up hardcoded API fallbacks** — Removed ngrok fallback URL and `ngrok-skip-browser-warning` header from `lib/api.ts`. Now throws if `EXPO_PUBLIC_API_BASE` is missing. ✓
- [x] **"High Intent" label is hardcoded** — Removed from `app/post-analytics/[id].tsx`. ✓
- [x] **Dead ellipsis button in analytics** — Replaced with an inert `<View>` spacer in `app/analytics.tsx`. ✓
- [x] **Silent `.catch(console.error)` on write operations** — RSVP now alerts + reverts on failure (`lib/RsvpContext.tsx`). Follow/unfollow now alerts + reverts in `ClubProfileView.tsx` and `app/(tabs)/index.tsx`. ✓
- [x] **Comment delete flicker** — Now waits for API before updating state. `app/event/[id].tsx`. ✓
- [x] **Calendar add event missing try/catch** — Fixed in `app/event/[id].tsx`. ✓

---

## Tier 3 — UX Polish

### Feedback & Micro-interactions
- [x] **Haptic feedback on key actions** — Added `ImpactFeedbackStyle.Medium` to RSVP toggle in all card types (HeroCard, EventFeedCard, ImageArticleCard), `Light` to poll vote and follow/unfollow in `SocialFeed.tsx`. Like/bookmark already had haptics. ✓
- [x] **Replace intrusive alerts with toasts** — Created `lib/ToastContext.tsx` (spring slide-up, auto-dismiss). Replaced "Draft saved", "Published!", "Scheduled!", "Added to Calendar", "Profile updated", "Password changed" alerts with toasts in create forms, `event/[id].tsx`, and `settings.tsx`. ✓
- [x] **Loading states on edit modals** — `ClubProfileView.tsx` already shows "SAVING…" text and disables the button while `editSaving` is true. ✓
- [ ] **Skeleton loaders** — Most screens show a blank `ActivityIndicator` while loading. Skeleton placeholder cards would feel much faster.
- [x] **Follow/unfollow animation** — Extracted `FollowButton` component with spring scale-down on press-in, spring back on press-out. Applied to all 4 follow button instances in `SocialFeed.tsx`. ✓

### Forms
- [x] **Real-time field validation** — `touched` state per required field, errors shown on blur (and immediately on failed publish attempt). Red border + error message below field. EventForm: title, date, venue. PollForm: question, 2+ options. AnnouncementForm: title. ✓
- [x] **Character counters on text areas** — Added `{len}/{MAX}` counters: description in `CreateEventForm`, body in `CreateAnnouncementForm`. `CreatePollForm` already had a question counter. ✓
- [x] **Poll option limit indicator** — Added "X of 6" counter next to the options section label. "Add Option" button already hidden at 6. ✓
- [x] **Draft auto-save** — Added 30s interval auto-save to all three create forms. Shows "Saving…" next to the lang toggle. Skips navigation/toast on silent saves. ✓
- [x] **Post scheduling UI** — Already exists in all three create forms (SCHEDULE PUBLISH field). ✓

### Navigation
- [x] **Back navigation dead ends** — All `router.back()` calls on deep-linkable screens replaced with `router.canGoBack() ? router.back() : router.replace("/(tabs)")` across `event/[id]`, `post/[id]`, `post-analytics/[id]`, `analytics`, `my-posts`, `drafts`, `club/followers`, `checkin/[id]`, `settings`. ✓
- [x] **"Event/Post not found" screen** — `event/[id]` now shows "EVENT NOT FOUND" + Go Home if fetch returns null. `post/[id]` already had a guard, upgraded to match app style with Go Home button. ✓
- [x] **Consistent modal presentation** — `settings` and `search-modal` now use `presentation: "modal"` in `_layout.tsx`, matching `notifications`. ✓

### Content & Display
- [ ] **Nested comment replies** — `parentId` support exists in the API and state but UI shows a flat list. Indent replies under parent comments. Show "1 reply" link that expands.
- [x] **Event category tags** — Added as pills below the event title in the top bar. `app/event/[id].tsx`. ✓
- [x] **Event capacity indicator** — Shows capacity bar + "X / Y SPOTS FILLED" above the RSVP button. `app/event/[id].tsx`. ✓
- [x] **RSVP waitlist status** — RSVP button now shows "WAITLISTED" (amber) or "JOIN WAITLIST" when capacity is exceeded. `app/event/[id].tsx`. ✓
- [ ] **Event conflict warning** — `hasConflict()` exists in `app/(tabs)/events.tsx` but is never surfaced. Show a badge on events that overlap with another RSVP'd event.
- [x] **Analytics axis labels** — All growth chart bars now show date labels below them. `app/analytics.tsx`. ✓
- [x] **Search result counts** — Filter pills now show counts when results exist (e.g. "CLUBS (5)"). `components/search/SearchModal.tsx`. ✓
- [x] **"Ends in X mins" countdown on live events** — Added live countdown badge next to LIVE EVENT badge in hero. Updates every minute. `app/event/[id].tsx`. ✓

### Offline & Error Recovery
- [ ] **Offline detection** — No network state check anywhere. Loading spinners run forever when offline. Add `@react-native-community/netinfo`, show an "Offline" banner, and fall back to cached data.
- [ ] **Retry button on failed fetches** — When an API call fails on a screen, show an error card with a "Retry" button rather than leaving the screen blank.

---

## Tier 4 — Accessibility

- [ ] **Accessibility labels on all interactive elements** — Only ~7 uses of `accessibilityLabel` in the whole codebase. Every icon button, tab, and pressable needs one (`accessibilityRole="button"`, `accessibilityLabel="Like post"`, etc.).
- [ ] **Minimum 44×44 tap targets** — Many icon buttons are 16–22px rendered size. Wrap with padding to meet the 44×44 minimum.
- [ ] **Dark mode support** — All colors are hardcoded. Use `useColorScheme()` and a theme palette that adapts to system dark/light mode.
- [ ] **Reduced motion support** — Animated sequences are not gated on `AccessibilityInfo.isReduceMotionEnabled`. Skip or shorten animations for users with that preference.
- [ ] **Image alt text** — Event poster `<Image>` components have no `accessibilityLabel`. Add descriptions for screen readers.

---

## Tier 5 — Larger Features

- [ ] **Real-time poll results** — Poll vote counts don't update until page refresh. Subscribe via WebSocket or poll the API every ~10 seconds while the poll is in view.
- [ ] **Undo for comment deletion** — Show a 3-second "Undo" toast after comment delete before the API call is made.
- [ ] **Notification preferences per club** — Notification preference dropdown exists in `ClubProfileView.tsx` but isn't persisted or reflected in UI. Add "All posts / Events only / Off" control.
- [ ] **Password strength indicator** — Settings password change form has no strength feedback.
- [ ] **Image crop/resize before upload** — Image picker uses `quality: 0.9` but no resizing. Compress and resize to max 1200px before upload. Show crop interface.
- [ ] **Pagination / infinite scroll** — Home feed, club post history, profile tabs (posts, RSVPs, bookmarks) all load everything at once. Implement `limit` + `offset` with FlatList `onEndReached`.
- [ ] **Export analytics** — Analytics page has no export function. Add "Export CSV" or "Share screenshot" via the ellipsis menu (see dead button above).

---
---

# Round 2 — Full Audit (June 2026)

## P0 — Broken or blocking release

- [ ] **Forgot-password is dead** — `app/(auth)/forgot-password.tsx` POSTs to `/users/forgot-password`, but that route doesn't exist in `backend/src/routes/users.ts`. Build the full flow: reset token model + expiry, email send (Resend/SES), reset screen. Until then, hide the "Forgot password?" link so users don't hit a dead end.
- [ ] **Waitlist is UI-only** — `event/[id].tsx` renders `isWaitlisted` / `waitlistEnabled` / "JOIN WAITLIST" states, but there's no Waitlist model in Prisma and `/posts/:id/rsvp` just 409s at capacity. Either build it (Waitlist model, auto-promote on cancel, notify promoted user) or remove the UI states.
- [ ] **Anyone can register as a CLUB** — `POST /users/add-user` takes `type` straight from the request body. Any student can create a fake club and post as it. Gate club signup behind an invite code or admin approval queue.
- [ ] **RSVP capacity race condition** — `posts.ts` checks capacity then upserts in two separate queries. Concurrent RSVPs can oversell. Wrap in `prisma.$transaction` with a re-check, or use a conditional raw insert.
- [ ] **In-app account deletion** — Required by App Store Guideline 5.1.1(v). Add `DELETE /users/me` (cascade or anonymize content) + a "Delete account" row in Settings with confirmation.
- [ ] **Report & block (UGC moderation)** — Required by App Store Guideline 1.2. Report post/comment endpoints + Report model, block-user (hide their comments), and a way for you to review reports. Apps with comments get rejected without this.

## P1 — Security hardening

- [ ] **Rate-limit auth endpoints** — `validate-user` / `add-user` are brute-forceable. Add `express-rate-limit` (e.g. 10/min per IP on auth, looser global limit).
- [ ] **Input validation** — `req.body` is trusted on every route. Add `zod` schemas per route (lengths, enums, URL formats). Prevents junk data like 50k-char comments.
- [ ] **helmet + CORS allowlist** — `cors()` is wide open and no security headers are set.
- [ ] **Token revocation** — 30-day JWTs survive a password change. Add a `tokenVersion` field on User, bump it on password change, check it in `requireAuth`.
- [ ] **Cap comment/feedback length server-side** — covered by zod item but worth a explicit check on the two free-text endpoints.

## P2 — UX friction (nitpicks)

### Sharing & deep links
- [ ] **Share is useless to recipients** — `Share.share({ message: title })` in `event/[id].tsx` / `post/[id].tsx` sends bare text with no link. Include a deep link (`uevents://event/{id}`) and ideally a universal-link web fallback page so recipients without the app see something.
- [ ] **Push notification tap → navigate** — verify `usePushNotifications.ts` handles `addNotificationResponseReceivedListener` and routes to the event/post (in-app notification taps already navigate; push taps must match).

### Feed & lists
- [ ] **Home feed is a `ScrollView`** — `app/(tabs)/index.tsx` renders all posts with `.map()` in a ScrollView. Memory + jank grow with feed size. Convert to `FlatList` (pairs with the pagination item from Tier 5).
- [ ] **Image pop-in** — zero `defaultSource`/blurhash/fade-in anywhere. Cards flash white then snap to the image. Use `expo-image` with `placeholder` + `transition={200}` for all post/event images.
- [ ] **Skeleton loaders** — `SkeletonLoader.tsx` exists but most screens still show a bare `ActivityIndicator`. Wire skeleton cards into feed, events, club profile, notifications.
- [ ] **Retry on failed fetches** — `notifications.tsx` has a retry card; feed, events, event detail, club profile don't. Standardize one `<ErrorRetry onRetry={...} />` component.
- [ ] **Empty states should sell the next action** — e.g. empty home feed → "Follow some clubs" button that jumps to search; empty RSVPs tab → "Browse events". Audit every empty state for a CTA instead of just text.

### Forms & input
- [ ] **`returnKeyType` + field chaining on auth forms** — no `returnKeyType="next"` / `onSubmitEditing` focus-chaining in `login.tsx`; users must tap each field. Add chaining on login, signup, settings, create forms.
- [ ] **Image crop/compress before upload** — `expo-image-manipulator` is already installed but unused. Resize to ≤1200px before upload; saves data and Cloudinary quota.
- [ ] **Password strength meter** — signup + change-password (Tier 5 carryover, do together with zod password rules so client and server agree).

### Comments
- [ ] **Nested replies UI** — backend + state already support `parentId`; UI is flat. Indent one level, "View 2 replies" expander, reply button pre-fills @mention.
- [ ] **Undo comment delete** — 3s undo toast before firing the API call (Tier 5 carryover).

### Events
- [ ] **Event conflict badge** — `hasConflict()` exists in `events.tsx` but is never shown. Badge overlapping RSVP'd events.
- [ ] **"Add to calendar" should offer updates** — if event time changes after a user added it to their calendar, the calendar entry is stale. At minimum, store the calendar event ID and offer "Update calendar" when `startAt` changed.
- [ ] **Real-time poll results** — poll API every ~10s while visible (Tier 5 carryover).
- [ ] **Notification prefs per club** — backend route `PATCH /clubs/:id/follow/notif-pref` already exists; persist the dropdown in `ClubProfileView.tsx` and respect it when fanning out notifications.

## P3 — Accessibility (Tier 4 carryover, still all open)

- [ ] Accessibility labels on every icon button / pressable (SocialFeed already has some — finish the rest).
- [ ] 44×44 minimum tap targets (many icon buttons are 16–22px).
- [ ] Dark mode via `useColorScheme()` + theme palette.
- [ ] Reduced-motion gating on animations.
- [ ] `accessibilityLabel` on event poster images.

## P4 — Bigger features (post-launch)

- [ ] **"Who's going"** — surface friends/known users attending an event; RSVPs are already stored, this is the social hook.
- [ ] **Email verification** — verify on signup; optionally restrict to school domain.
- [ ] **Recurring events** — weekly club meetings currently require re-posting.
- [ ] **Multiple managers per club** — a club is one shared login today; add a ClubMember join table with roles.
- [ ] **Backend tests + CI** — zero tests exist. Start with supertest on auth, RSVP/capacity, and permissions (student can't hit club-only routes), run on GitHub Actions.
- [ ] **Pagination / infinite scroll** — (Tier 5 carryover; do alongside the FlatList conversion in P2.)
