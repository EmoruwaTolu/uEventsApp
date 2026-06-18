# Design — Recurring Events

**Goal:** Let a club create an event that repeats (e.g. "weekly meeting, Tuesdays 6pm") without re-posting each time.

**Status:** Proposed. Plan-first per request — no code written yet.

---

## Current state

`Post` (events are `type = EVENT`) has `startAt` / `endAt` `DateTime?` and no recurrence concept. Each event is one row. RSVPs, check-ins, comments, likes, bookmarks, and views all hang off a single `postId`.

The core design question is **one row vs many rows** for a recurring series. The check-in model (`CheckIn` per `postId`), capacity, and per-occurrence RSVP all argue for **one row per occurrence** — attendance is inherently per-date. We therefore generate concrete occurrence rows from a recurrence rule rather than storing a single "virtual" event.

## Recommended approach: a series parent + generated occurrences

### Data model (Prisma)

```prisma
model EventSeries {
  id          String   @id @default(cuid())
  clubId      String
  freq        RecurrenceFreq      // WEEKLY | BIWEEKLY | MONTHLY
  interval    Int       @default(1)        // every N freq units
  byWeekday   Int[]     @default([])       // 0–6 (Sun–Sat) for weekly
  startDate   DateTime                     // first occurrence date/time
  endDate     DateTime?                    // series ends after this (null = open-ended, capped)
  count       Int?                          // OR ends after N occurrences
  template    Json                          // title/desc/location/capacity/categories/images
  createdAt   DateTime @default(now())
  club        User      @relation(fields: [clubId], references: [id])
  posts       Post[]
}

enum RecurrenceFreq { WEEKLY BIWEEKLY MONTHLY }
```

Add to `Post`:

```prisma
seriesId      String?
series        EventSeries? @relation(fields: [seriesId], references: [id], onDelete: SetNull)
occurrenceDate DateTime?    // the specific date this row represents
```

### Occurrence generation strategy

- On series create, generate occurrence `Post` rows for a **rolling horizon** (e.g. the next 8 weeks, capped at a max like 26 occurrences). Don't materialize infinite rows.
- A scheduled job (there's already `src/jobs/scheduledPublish.ts` and `eventReminders.ts`) tops up the horizon daily: for each open-ended series, ensure occurrences exist N weeks out.
- Each generated `Post` is a normal event row, so RSVP / check-in / capacity / analytics all work unchanged.

### API

- `POST /posts/series` (requireClub) — create a series + generate initial occurrences. Body: recurrence rule + event template (reuse `createPostSchema` fields).
- `PATCH /posts/series/:id` — edit the template and/or rule. Apply mode (see edge cases): `this` | `future` | `all`.
- `DELETE /posts/series/:id?scope=future|all` — cancel upcoming occurrences (keep past for history/analytics).
- Existing `GET /posts/:id`, RSVP, etc. need **no change** — occurrences are ordinary posts.
- Feed: optionally collapse a series to its **next** occurrence to avoid flooding (group by `seriesId`, show next upcoming, with a "repeats weekly" badge).

### Frontend

- **Create form (`CreateEventForm`)**: add a "Repeats" section — a toggle plus frequency (Weekly / Biweekly / Monthly), weekday picker (weekly), and end condition (on date / after N / never). Default off, so non-recurring flow is unchanged.
- **Event detail (`event/[id]`)**: show a "Repeats weekly · next: <date>" line and a small "see all dates" expander listing upcoming occurrences.
- **Feed**: a "REPEATS" pill on event cards that belong to a series.
- **Manage**: club edit screen offers "Edit this / this + future / all", and "End series".

### Edge cases & decisions

- **Editing scope** — mirror calendar apps: edit *this occurrence*, *this + future*, or *whole series*. "This + future" splits the series (new `EventSeries` from the edit point).
- **RSVPs are per-occurrence** — a student RSVPs to each date individually. Optionally offer "RSVP to all upcoming" later.
- **Capacity** — per occurrence (already how `capacity` works).
- **DST / timezones** — store occurrence times in UTC; generate using the club's local time so "6pm" stays 6pm across DST. Use the `startDate` local wall-clock as the anchor.
- **Calendar staleness** — ties into the per-post calendar sync already built; each occurrence has its own calendar entry.
- **Deletion** — never hard-delete past occurrences (analytics/history); only cancel future ones.

### Rollout / migration

1. Add `EventSeries` model + `Post.seriesId` / `occurrenceDate` (nullable — fully backward compatible; existing events stay `seriesId = null`).
2. Ship generation + create API behind the create-form toggle.
3. Add the top-up job to the existing jobs runner.

### Effort estimate

Medium–large: ~1 new model + 2 `Post` columns, ~3 endpoints, 1 cron top-up job, create-form section, and feed/detail badges. Backend ~2–3 days, frontend ~2 days, plus testing of the edit-scope logic (the trickiest part).
