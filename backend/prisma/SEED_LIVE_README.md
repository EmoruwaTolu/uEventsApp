# Live-feel seed (`seed-live.ts`)

Fills the database with a realistic, "already-live" data set so the app feels
like it's in active use.

## What it creates

- **18 clubs** (upserted by email — reuses any that already exist)
- **28 students**, including **temor010@uottawa.ca**
- **306 published posts** — 234 events (164 past, 70 upcoming) plus
  announcements, updates, and open polls, spread across every club and weighted
  toward the past so there's real history.
- **Full interactions**: follows, post views, likes, bookmarks, comments,
  RSVPs, check-ins (attended events), event ratings, recap photos, poll votes.
- **temor010@uottawa.ca** gets a rich, lived-in history: ~9 clubs followed,
  ~50+ attended events (check-ins), RSVPs to upcoming events, plus likes,
  bookmarks, comments, and ratings — so the profile stats populate.

All content is served through the existing APIs (`/posts/feed`, `/posts/for-you`,
`/events`, `/users/me/attendance`, `/clubs`, etc.). No hardcoded/placeholder
data remains in the app.

## How to run

The database is only reachable from your machine (the `DATABASE_URL` in
`backend/.env`), so run this locally from the `backend/` directory:

```bash
cd backend
npm run db:seed-live
```

## Safe to re-run

Everything is **idempotent** and **additive** — nothing is deleted:

- Users are upserted by email.
- Posts, poll options, comments, and recap photos use deterministic IDs, so
  `createMany({ skipDuplicates: true })` skips anything already inserted.
- Join rows (follow / like / rsvp / check-in / bookmark / view / poll vote) and
  ratings dedupe on their composite/unique keys.

Running it a second time simply tops up anything missing. It targets whatever
`DATABASE_URL` points at, so point `.env` at a staging DB first if you don't
want to write to production.

## Login

All seeded accounts use the password `password123` (e.g. sign in as
`temor010@uottawa.ca` / `password123`).
