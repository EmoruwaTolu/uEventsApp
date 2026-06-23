# uEvents — Manual Test Checklist

Use this checklist before each release build to verify all core flows work end-to-end.
Mark each item ✅ pass or ❌ fail. File a bug for anything that fails.

---

## 1. Authentication

### Sign In
- [ ] Tapping SIGN IN on landing slides to the sign-in form
- [ ] Submitting with empty email shows "Email is required"
- [ ] Submitting with a non-`@uottawa.ca` email (e.g. `test@gmail.com`) shows "Must be a uOttawa email (@uottawa.ca)"
- [ ] Submitting with a `@uottawa.ca` email and wrong password shows an alert "Sign in failed"
- [ ] Correct credentials sign in and navigate to the home feed
- [ ] "Forgot password?" link opens the forgot-password screen

### Registration
- [ ] Tapping CREATE ACCOUNT on landing slides to the register form
- [ ] Submitting with empty first/last name shows the name error
- [ ] Submitting with a non-`@uottawa.ca` email shows "Must be a uOttawa email (@uottawa.ca)"
- [ ] Submitting with a password shorter than 8 characters shows "Password must be at least 8 characters"
- [ ] Valid `@uottawa.ca` email + strong password creates account and signs in
- [ ] BACK slides back to landing page and clears errors

### Forgot Password
- [ ] Submitting empty email shows "Email is required"
- [ ] Submitting a non-`@uottawa.ca` email shows "Must be a uOttawa email (@uottawa.ca)"
- [ ] Valid `@uottawa.ca` email shows the EMAIL SENT confirmation (regardless of whether account exists)
- [ ] BACK TO SIGN IN navigates back

### Guest Mode
- [ ] "Continue as guest" on landing skips auth and shows the app
- [ ] Club-only actions (create post, follow, etc.) prompt to sign in

---

## 2. Home Feed

### Following Tab
- [ ] Signed-in user with followed clubs sees their posts
- [ ] User following no clubs sees "NOT FOLLOWING ANYONE YET" empty state with DISCOVER CLUBS button
- [ ] DISCOVER CLUBS button navigates to the Search tab

### For You Tab
- [ ] Tab shows a mix of popular posts from across campus
- [ ] When no posts are available, shows "NOTHING HERE YET" with "Follow more clubs to personalize your feed." and a DISCOVER CLUBS button
- [ ] Pull-to-refresh loads fresh posts
- [ ] Network failure shows an error toast

---

## 3. Events Tab
- [ ] Upcoming events are listed in chronological order
- [ ] Tapping an event opens the event detail screen
- [ ] All Events modal shows the full list
- [ ] Past events are visually distinct or hidden

---

## 4. Event Detail
- [ ] Event title, date, venue, and description render correctly
- [ ] Hero image loads; if image fails, a placeholder is shown (no crash)
- [ ] RSVP button RSVPs the user; count updates
- [ ] Check-in screen opens via the check-in route
- [ ] Network failure shows "Could not load event" toast

---

## 5. Club Profile
- [ ] Club name, avatar, follower count, and bio display correctly
- [ ] Follow/Unfollow toggles and updates count
- [ ] Club's posts are listed below the profile header
- [ ] Followers list is accessible via the follower count

---

## 6. Search
- [ ] Typing in the search bar queries clubs by name
- [ ] Tapping a result navigates to that club's profile
- [ ] Empty query shows suggested / all clubs

---

## 7. Create Post (Club admins only)

### General Rules
- [ ] All three post types (Event, Announcement, Poll) require a **description/body** to publish
- [ ] Attempting to publish without a description disables the PUBLISH button and shows "Description is required" when tapped
- [ ] Saving as a **draft** does NOT require a description
- [ ] Auto-save (every 30s) does NOT block on description

### Create Event
- [ ] Title is required — publish blocked if empty
- [ ] Description is required — publish blocked if empty; inline error shown
- [ ] Date & time is required — publish blocked if absent or in the past
- [ ] Venue is required — publish blocked if empty
- [ ] Requirements checklist at the bottom reflects live state
- [ ] SAVE DRAFT saves without publishing
- [ ] PUBLISH creates the post and navigates away
- [ ] Scheduled publish picks a future date/time and queues the post

### Create Announcement
- [ ] Headline is required — publish blocked if empty
- [ ] Body is required — publish blocked if empty; inline "Body is required" shown
- [ ] SAVE DRAFT and PUBLISH work correctly

### Create Poll
- [ ] Question is required — publish blocked if empty
- [ ] Description is required — publish blocked if empty; inline error shown
- [ ] Must have at least 2 filled options — inline "Add at least 2 options" shown
- [ ] All three of question + description + 2 options must be satisfied before PUBLISH enables
- [ ] Poll duration selector works (24H, 3D, 7D)
- [ ] SAVE DRAFT and PUBLISH work correctly

---

## 8. My Posts
- [ ] List shows all published posts and drafts for the club
- [ ] STATS button on each published post navigates to post analytics
- [ ] Edit button opens the edit screen for that post
- [ ] Drafts section shows unpublished posts
- [ ] Deleting a post removes it from the list

---

## 9. Drafts
- [ ] Saved drafts appear in the list
- [ ] Tapping a draft opens it in the create form pre-filled
- [ ] Deleting a draft removes it

---

## 10. Edit Post
- [ ] Edit screen pre-fills all fields from the existing post
- [ ] Description field is pre-filled; clearing it blocks UPDATE
- [ ] UPDATE saves changes and navigates back

---

## 11. Analytics (Club admins only)
- [ ] Total Reach shows real follower count
- [ ] Growth badge (e.g. `+5`) only appears when `growthDelta > 0`; hidden when flat or negative
- [ ] Performance row shows real post count and follower count, not the old "88%" placeholder
- [ ] Report period shows the actual date range of posts (`MMM YYYY – MMM YYYY`)
- [ ] Report period row is hidden if the club has no posts
- [ ] Post-level analytics accessible from My Posts → STATS

---

## 12. Post Analytics
- [ ] Opens for a specific post via `/post-analytics/[id]`
- [ ] Shows views, likes, comments, and RSVP count (for events)
- [ ] Network failure shows an appropriate error state

---

## 13. Notifications
- [ ] Notification list loads
- [ ] Tapping a notification navigates to the relevant post or event
- [ ] Unread badge clears after viewing

---

## 14. Settings
- [ ] Profile name and avatar load from the backend
- [ ] Editing name and saving shows a success toast
- [ ] Avatar upload picks an image, uploads it, and updates the UI
- [ ] Sign out clears the session and returns to login
- [ ] Delete Account prompts for confirmation before deleting
- [ ] Terms of Service and Privacy Policy links open in the browser

---

## 15. Session & Error Handling
- [ ] Expired token (401) shows "Your session expired. Please sign in again." toast, then signs out
- [ ] Broken image anywhere in the app (feed, event hero, club avatar) falls back to a placeholder — no crash
- [ ] Unexpected crash shows the ErrorBoundary "Something went wrong" screen with a TRY AGAIN button
- [ ] TRY AGAIN on ErrorBoundary dismisses the error and attempts to re-render

---

## 16. Club Onboarding
- [ ] New club account walks through the onboarding flow
- [ ] Club name, description, and avatar can be set
- [ ] Completing onboarding navigates to the Create tab

---

*Last updated: 2026-04-25*
