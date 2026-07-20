# Showcase demo seed (`seed-demo.ts`)

An **additive, idempotent** seed that layers a curated, feature-complete demo
set on top of your existing data so you can show off every feature of the app.
Nothing is deleted — it only adds, and re-running it just tops up anything
missing.

## How to run

The database is only reachable from your machine (the `DATABASE_URL` in
`backend/.env`), so run this locally from the `backend/` directory:

```bash
cd backend
npm run db:seed-demo
```

> Tip: point `.env` at a staging database first if you don't want to write to
> production. Everything is upserted / deduped, so a second run is safe.

## Accounts to present from

Both use the password `password123`:

| Role    | Login                     | Best for showing |
| ------- | ------------------------- | ---------------- |
| Club    | `demo.club@uottawa.ca`    | Drafts, scheduled posts, a pinned event, a recurring series, a full/waitlisted event, check-in QR, post analytics, recap-photo moderation |
| Student | `temor010@uottawa.ca`     | The feed (Following + For You), RSVPs, attendance/profile stats, a full notifications inbox, blocked users |

## What it creates (feature → where to see it)

- **Bilingual club profile** — logo, English/French name & description, Instagram/Twitter/contact, approved status.
- **Events** — past + upcoming, with capacity, free-food banner, address, and category tags.
- **Pinned post** — a hero pinned event at the top of the club profile.
- **Photo carousel** — a multi-image event (swipeable gallery + the club's Media tab).
- **Recurring event** — a weekly "Coding Night" series with 6 generated occurrences (recurring badge on the event).
- **Waitlist** — "Hands-on Workshop" is filled to capacity (6 seats), with more users waitlisted and one promoted off it.
- **Announcements** — one plain, one with an image.
- **Polls** — an open single-choice poll, an open **multiple-choice** poll, and a **closed** poll (shows results).
- **Drafts & scheduling** — an unpublished draft and a future-dated scheduled post (club Drafts screen).
- **Recap** — approved recap photos, two **pending** photos awaiting moderation, and star ratings on past events.
- **Comments** — threads with club replies and per-user comment likes.
- **Engagement** — views, likes, and bookmarks across everything (drives post analytics).
- **Notifications** — every notification type (event, reminder, waitlist promoted, reply, like, post, digest, follow, comment), read and unread, split across both accounts.
- **Interests** — category interest-follows on temor010 (For You personalization).
- **Blocked users** — temor010 has one blocked user (Blocked users screen in Settings).
- **Follows** — the club has followers with a mix of notification preferences (All / Events only / Muted).

## Idempotency

- Users are upserted by email.
- Posts, poll options, comments, recap photos, the event series, waitlist rows,
  and notifications use deterministic IDs (prefixed `demo_`).
- Join rows (follow / like / rsvp / check-in / bookmark / view / poll vote /
  rating / interest / block / comment like) dedupe on their composite or unique
  keys.

All inserts use `createMany({ skipDuplicates: true })`, so a second run adds
nothing new.
