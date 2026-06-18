# Design — Multiple Managers per Club

**Goal:** Let several people manage one club instead of sharing a single login.

**Status:** Proposed. Plan-first per request — no code written yet.

---

## Current state (the constraint)

There is **no separate Club table** — a club *is* a `User` row with `type = CLUB` (it carries `clubName`, `slug`, `logoUrl`, etc.). Ownership is checked everywhere as:

```ts
post.clubId === req.user!.userId    // the club User's own id
```

and the JWT encodes `{ userId, type, tokenVersion }`. So today "the club" and "the one account that controls it" are the same id. Multi-manager means **decoupling the club identity from the human accounts that can act as it** — this touches auth, every ownership check, and analytics attribution, so it's the larger of the two features and warrants care.

## Recommended approach: `ClubMember` join table + acting-club context

Keep the club as a `User` (minimal disruption to data/feed/relations). Introduce membership linking *manager* student-or-person accounts to a club, plus an "acting as club" concept in the token/requests.

### Data model (Prisma)

```prisma
model ClubMember {
  id        String     @id @default(cuid())
  clubId    String                       // the club User id
  userId    String                       // the manager's personal User id
  role      ClubRole   @default(MANAGER) // OWNER | MANAGER
  createdAt DateTime   @default(now())
  club      User       @relation("ClubManagedBy", fields: [clubId], references: [id], onDelete: Cascade)
  user      User       @relation("ManagesClubs",  fields: [userId], references: [id], onDelete: Cascade)

  @@unique([clubId, userId])
}

enum ClubRole { OWNER MANAGER }
```

- The existing club `User` becomes the **OWNER** member (backfill on migration).
- Managers are ordinary accounts (can be `STUDENT`) that also appear in `ClubMember`.

### Auth / acting-as-club

The cleanest minimal change: an **ownership helper** instead of the inline `clubId === userId` check.

```ts
async function canManageClub(userId: string, clubId: string): Promise<boolean> {
  if (userId === clubId) return true; // legacy owner-login
  return !!(await prisma.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId } },
  }));
}
```

Replace every `post.clubId === req.user!.userId` with `await canManageClub(req.user!.userId, post.clubId)`. For **create** (`POST /posts`), the club is currently `clubId: req.user!.userId`; instead accept a target `clubId` in the body and authorize via `canManageClub`. A manager picks which club they're posting as (most will manage one).

`requireClub` middleware also needs widening: a manager is `type = STUDENT` but may manage clubs, so gate on "manages ≥1 club" rather than `type === CLUB`, or add a lighter `requireClubManager(clubId)` check per route.

### API

- `GET /clubs/:id/members` (manager only) — list members + roles.
- `POST /clubs/:id/members` (owner only) — invite by email; creates `ClubMember` (or a pending invite row if the person has no account yet).
- `DELETE /clubs/:id/members/:userId` (owner only) — remove a manager.
- `GET /users/me/clubs` — clubs the current user can manage (drives the "post as" picker).
- All write routes on posts/club-profile switch to `canManageClub`.

### Frontend

- **Club profile / settings**: a "Managers" section (list, role, invite by email, remove). Owner-only controls.
- **Create flow**: if the user manages >1 club, a "Posting as ▾" selector at the top; if exactly 1, post as it implicitly.
- **App entry**: a manager logging in with their personal account sees normal student UI plus a "Manage [club]" entry point. (Avoids the current pattern of logging in *as* the club.)

### Edge cases & decisions

- **Analytics attribution** — analytics stay per-club (`clubId`), not per-manager, so dashboards are unaffected.
- **Last owner** — block removing/leaving if it would leave a club with zero owners.
- **Invites for non-users** — store a pending invite keyed by email; promote to `ClubMember` on signup (overlaps with the email-verification flow already built).
- **Token revocation** — removing a manager should drop their access immediately; since auth re-checks the DB each request (`tokenVersion` lookup in `requireAuth`), `canManageClub` is also a live DB check, so removal takes effect at once.
- **Legacy club logins** — keep working: `userId === clubId` is treated as OWNER, so nothing breaks during/after migration.

### Rollout / migration

1. Add `ClubMember` + `ClubRole`; backfill one `OWNER` row per existing club (`clubId = userId = club.id`).
2. Introduce `canManageClub` and swap inline checks route-by-route (mechanical but wide — covers posts, club profile, analytics, check-in).
3. Ship members UI + invite, then the "post as" selector.
4. Optional later: deprecate direct club-account login in favor of personal-account + manage.

### Effort estimate

Large: 1 model + a backfill migration, an auth helper threaded through **every** club-ownership check (highest-risk part — needs the existing `permissions.test.ts` extended), members CRUD endpoints, and three frontend surfaces. Backend ~3–4 days incl. tests, frontend ~3 days. Recommend doing it **after** recurring events, and landing the ownership-helper swap behind thorough permission tests.
