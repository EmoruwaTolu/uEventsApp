# uEvents — Tester Guide & QA Script

Thanks for helping test **uEvents**, the uOttawa student-events app. This guide
walks you through the app and tells you exactly what to try. You don't need to do
everything — even one pass through the "Core" section is a huge help. Note anything
that feels broken, slow, confusing, or ugly.

---

## Before you start

1. **Install TestFlight** from the App Store, then open the invite link we sent you.
2. **First load may be slow (~30–50s).** Our backend sleeps when idle and takes a
   moment to wake up. This only affects the *first* action of the day — if a screen
   hangs on first open, give it up to a minute before assuming it's broken.
3. **How to report a bug:** in TestFlight, take a screenshot and the feedback form
   pops up automatically — type what happened and send. Or just message us. Please
   include: what you tapped, what you expected, and what actually happened.

## Test accounts

| Role | Use this to test |
|---|---|
| **Your own signup** | The full new-student experience (recommended for most testers). |
| **Club account** | Only if we gave you club organizer credentials + the invite code. |

---

## Core flows (please do these)

### 1. Sign up & onboarding
1. Create a new account with your email.
2. Complete email verification if prompted.
3. Go through the interest/topic follow step.

✅ **Expect:** signup is smooth, verification works, and you land on the home feed.
❓ **Watch for:** confusing steps, errors on valid emails, anything that gets stuck.

### 2. Events tab (home)
1. Look at the stats row at the top — streak, events attended, free meals.
2. Find the **NEXT UP** hero card. Tap **GOING** to RSVP.
3. Scroll to **Today on Campus** and RSVP to an event there.

✅ **Expect:** stats show real numbers, the hero shows a live badge when relevant,
and RSVPing animates smoothly (no flicker or freeze).

### 3. For You feed
1. Switch to the **For You** feed.
2. Look at the **reason chips** on cards — e.g. "Because you follow Engineering
   Society," "Matches your interest: free food," "Popular this week."
3. Tap **Show less like this** on a card you're not interested in.

✅ **Expect:** the reasons make sense for you, and "Show less" removes that post and
makes similar ones show up less. This is the feature we most want feedback on —
**does the ranking feel right?**

### 4. Discover tab
1. Browse the **Today** carousel and the **This Week / This Month** agenda.
2. Follow a topic and a club.
3. Check that followed topics start appearing in your feed.

✅ **Expect:** dates are grouped clearly, following works, and the agenda is readable.

### 5. Event detail — the big one
Open any event and try:
1. **RSVP.** If it's full, join the waitlist — you should see your position
   ("You're next in line" or "#3 in line").
2. Look for an amber **"N spots left"** badge on near-full events, or **"Full."**
3. **Like** and **bookmark** the event, then go back to the feed.
4. Read **comments**; check if there's a **top comment** with an upvote (▲) — try
   upvoting it.
5. **Share** the event (send the link to yourself and open it).
6. **Add to calendar** and tap **directions**.

✅ **Expect:** likes and bookmarks sync **instantly** between the feed and the
detail screen. Waitlist position and spots-left update after you RSVP. The share
link opens a real preview page.

### 6. Language
1. Go to **Settings** and switch to **French**.
2. Revisit the auth screens, an alert/popup, and the Events tab.

✅ **Expect:** everything translates — not just some screens.

---

## Extra flows (if you have time)

### 7. Free food
Filter for free-food events, open one, and check the "get directions" and the link
to uOttawa's Free Food Alert.

### 8. Recaps
After an event you RSVP'd to has ended, open its recap. If you attended, try adding
a photo and a rating. Your photo may show a **"Pending"** badge until the club
approves it — that's expected.

### 9. Calendar subscription
In Settings, tap **Subscribe to my events** and let it hand off to your phone's
calendar app.

### 10. Accessibility
Turn your phone's text size way up (Settings → Display) and reopen the app. Text
should scale without breaking layouts or getting cut off.

### 11. Notifications
If you allowed notifications, watch for event reminders and a Sunday-evening weekly
digest ("Your week: N RSVPs, M events matching your interests").

---

## Club organizers only

If we gave you a club account + the invite code:
1. **Sign up as a club** using the invite code (a wrong code should be rejected).
2. Go through the **club onboarding** flow.
3. **Create an event** — try the date/time picker (it should be legible, date+time
   on one wheel, and a same-day end time selectable). Try a **recurring** event with
   multiple weekdays.
4. Publish it and confirm it appears in the student feed.
5. If your account has moderation access, try the **reports** queue and approving a
   pending **recap photo**.

✅ **Expect:** the date picker isn't black/unreadable, recurring events generate
correctly, and published events show up for students.

---

## What makes a great bug report

- **Where:** which screen / what you tapped.
- **Expected vs. actual:** "I expected X, but Y happened."
- **Screenshot:** always helps (TestFlight attaches it automatically).
- **Device + iOS version** if you remember it.

Small stuff counts too — awkward wording, a button that's hard to reach, a screen
that feels slow, a color that looks off. Don't self-censor; send it all.

---

## Quick bug log (optional — copy/paste per issue)

```
Screen:
What I did:
What I expected:
What happened:
Screenshot attached? (y/n):
```

Thank you! 🙌
