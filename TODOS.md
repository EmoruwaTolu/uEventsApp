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
