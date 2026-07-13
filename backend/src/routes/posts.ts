import { Router, Request, Response, NextFunction } from "express";
import { createHmac } from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireClub, requireApprovedClub, optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { generateOccurrences } from "../lib/recurrence";
import { screenRecapPhoto } from "../lib/moderation";
import { sendExpoPush } from "../lib/push";

// 1-based position of a waitlist entry: how many entries were created at or
// before it (entries are promoted oldest-first).
async function waitlistPositionOf(
    client: Prisma.TransactionClient | typeof prisma,
    postId: string,
    createdAt: Date,
): Promise<number> {
    return client.waitlist.count({ where: { postId, createdAt: { lte: createdAt } } });
}

const localeContentSchema = z.object({
    title:       z.string().max(200).optional(),
    body:        z.string().max(10000).optional(),
    imageUrl:    z.string().url().max(500).optional().or(z.literal("")),
    posterUrl:   z.string().url().max(500).optional().or(z.literal("")),
}).passthrough();

const createPostSchema = z.object({
    type:             z.enum(["EVENT", "ANNOUNCEMENT", "UPDATE", "POLL"]),
    locales:          z.record(z.string(), localeContentSchema),
    isDraft:          z.boolean().optional(),
    publishAt:        z.string().datetime().optional().or(z.null()),
    startAt:          z.string().datetime().optional().or(z.null()),
    endAt:            z.string().datetime().optional().or(z.null()),
    locationName:     z.string().max(200).optional(),
    address:          z.string().max(300).optional(),
    categories:       z.array(z.string().max(50)).max(10).optional(),
    capacity:         z.union([z.number().int().min(1).max(100000), z.string()]).optional().or(z.null()),
    freeFood:         z.boolean().optional(),
    recapPrivate:     z.boolean().optional(),
    images:           z.array(z.string().url().max(500)).max(20).optional(),
    pollExpiresAt:    z.string().datetime().optional().or(z.null()),
    pollAllowMultiple: z.boolean().optional(),
    pollOptions:      z.array(z.object({
        textEn: z.string().max(200),
        textFr: z.string().max(200).optional(),
    })).max(6).optional(),
});

// PATCH /posts/:id: every field optional (only what's sent is changed). `type`
// and poll options can't change on edit. capacity is coerced so a garbage string
// is a 400 (not a NaN → Prisma 500), and an explicit null clears the field —
// distinct from an absent field, which leaves it untouched.
const editPostSchema = createPostSchema
    .omit({ type: true, pollOptions: true })
    .partial()
    .extend({
        capacity: z.union([z.coerce.number().int().min(1).max(100000), z.null()]).optional(),
    });

const createSeriesSchema = z.object({
    locales:      z.record(z.string(), localeContentSchema),
    startAt:      z.string().datetime(),
    endAt:        z.string().datetime().optional().or(z.null()),
    locationName: z.string().max(200).optional(),
    address:      z.string().max(300).optional(),
    categories:   z.array(z.string().max(50)).max(10).optional(),
    capacity:     z.union([z.number().int().min(1).max(100000), z.string()]).optional().or(z.null()),
    freeFood:     z.boolean().optional(),
    images:       z.array(z.string().url().max(500)).max(20).optional(),
    recurrence:   z.object({
        freq:      z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
        interval:  z.number().int().min(1).max(12).optional(),
        byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        endDate:   z.string().datetime().optional().or(z.null()),
        count:     z.number().int().min(1).max(26).optional().or(z.null()),
    }),
});

const editSeriesSchema = z.object({
    scope:        z.enum(["future", "all"]),
    fromPostId:   z.string(),
    locales:      z.record(z.string(), localeContentSchema).optional(),
    locationName: z.string().max(200).optional().or(z.null()),
    address:      z.string().max(300).optional().or(z.null()),
    categories:   z.array(z.string().max(50)).max(10).optional(),
    capacity:     z.union([z.number().int().min(1).max(100000), z.string()]).optional().or(z.null()),
    freeFood:     z.boolean().optional(),
    images:       z.array(z.string().url().max(500)).max(20).optional(),
    startHour:    z.number().int().min(0).max(23).optional().or(z.null()),
    startMinute:  z.number().int().min(0).max(59).optional().or(z.null()),
    durationMs:   z.number().int().positive().optional().or(z.null()),
});

const commentSchema = z.object({
    content:  z.string().min(1, "Comment cannot be empty").max(1000, "Comment must be 1000 characters or fewer").trim(),
    parentId: z.string().min(1).optional(),
});

function checkinToken(postId: string): string {
    return createHmac("sha256", process.env.JWT_SECRET ?? "secret")
        .update(postId)
        .digest("hex")
        .slice(0, 16);
}

const router = Router();

// ── Notification helper ───────────────────────────────────────────────────────
async function notifyFollowers(
    clubId: string,
    postType: string, // "EVENT" | "ANNOUNCEMENT" | "UPDATE" | "POLL"
    clubName: string,
    postTitle: string,
    postId: string,
    categories: string[] = [],
) {
    // Recipients = club followers (respecting notifPref) ∪ users who follow a
    // matching topic. Deduped by userId; the posting club never notifies itself.
    // pushNotifs gates the push only — in-app notifications are always created.
    const recipients = new Map<string, string | null>(); // userId -> pushToken (null = no push)

    const follows = await prisma.follow.findMany({
        where: {
            clubId,
            notifPref: postType === "EVENT" ? { in: ["ALL", "EVENTS"] } : "ALL",
        },
        select: { userId: true, user: { select: { pushToken: true, pushNotifs: true } } },
    });
    for (const f of follows) {
        recipients.set(f.userId, f.user.pushNotifs ? f.user.pushToken ?? null : null);
    }

    if (categories.length > 0) {
        const topicFollows = await prisma.interestFollow.findMany({
            where: { category: { in: categories } },
            select: { userId: true, user: { select: { pushToken: true, pushNotifs: true } } },
        });
        for (const tf of topicFollows) {
            if (!recipients.has(tf.userId)) {
                recipients.set(tf.userId, tf.user.pushNotifs ? tf.user.pushToken ?? null : null);
            }
        }
    }

    recipients.delete(clubId); // never notify the poster
    if (recipients.size === 0) return;

    const titleMap: Record<string, string> = {
        EVENT:        `New event from ${clubName}`,
        ANNOUNCEMENT: `${clubName} posted an announcement`,
        POLL:         `${clubName} posted a new poll`,
        UPDATE:       `Update from ${clubName}`,
    };
    const notifTitle = titleMap[postType] ?? `New post from ${clubName}`;
    const notifType = postType === "EVENT" ? "EVENT" : "POST";

    // Create in-app notifications
    await prisma.notification.createMany({
        data: [...recipients.keys()].map((userId) => ({
            userId,
            type: notifType,
            title: notifTitle,
            body: postTitle,
            metadata: { postId, postType },
        })),
        skipDuplicates: true,
    });

    // Send Expo push notifications to recipients who have a token
    const pushTokens = [...recipients.values()].filter(Boolean) as string[];
    if (!pushTokens.length) return;

    sendExpoPush(pushTokens.map((token) => ({
        to: token,
        title: notifTitle,
        body: postTitle,
        data: { postId, postType },
        sound: "default" as const,
    })));
}

// ── RSVP update notification helper ─────────────────────────────────────────
async function notifyRsvpd(
    postId: string,
    eventTitle: string,
    changeDesc: string,
    clubId: string,
) {
    const rsvps = await prisma.rsvp.findMany({
        where: { postId },
        select: { userId: true, user: { select: { pushToken: true, pushNotifs: true } } },
    });
    if (!rsvps.length) return;

    const notifTitle = `Event update: ${eventTitle}`;
    const notifBody = `The ${changeDesc} has been updated. Check the latest details.`;

    await prisma.notification.createMany({
        data: rsvps.map((r) => ({
            userId: r.userId,
            type: "EVENT",
            title: notifTitle,
            body: notifBody,
            metadata: { postId, postType: "EVENT", clubId },
        })),
        skipDuplicates: true,
    });

    const pushTokens = rsvps
        .filter((r) => r.user.pushNotifs)
        .map((r) => r.user.pushToken)
        .filter(Boolean) as string[];
    sendExpoPush(pushTokens.map((token) => ({
        to: token,
        title: notifTitle,
        body: notifBody,
        data: { postId, postType: "EVENT" },
        sound: "default" as const,
    })));
}

// ── Comment / reply notification helper ─────────────────────────────────────
// Notifies the post owner when someone comments, and the parent-comment author
// when someone replies. Deduped (a reply to the owner's own comment sends one
// REPLY, not REPLY + COMMENT), never notifies the actor about their own comment,
// and only pushes to users who left push on — the in-app row is always created.
async function notifyOnComment(
    postId: string,
    actorId: string,
    commentId: string,
    content: string,
    parentAuthorId: string | null,
) {
    const [post, actor] = await Promise.all([
        prisma.post.findUnique({
            where: { id: postId },
            select: { clubId: true, type: true, locales: true },
        }),
        prisma.user.findUnique({
            where: { id: actorId },
            select: { type: true, firstName: true, lastName: true, clubName: true },
        }),
    ]);
    if (!post) return;

    const actorName = actor?.type === "CLUB"
        ? (actor.clubName ?? "A club")
        : [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || "Someone";
    const loc = (post.locales as any) ?? {};
    const postTitle = loc.en?.title ?? loc.fr?.title ?? "your post";
    const snippet = content.trim().replace(/\s+/g, " ").slice(0, 120);

    // userId -> payload. A reply beats a comment when the same user would get
    // both (replying to the post owner's own comment is one REPLY, not two rows).
    const targets = new Map<string, { type: "REPLY" | "COMMENT"; title: string }>();
    if (parentAuthorId && parentAuthorId !== actorId) {
        targets.set(parentAuthorId, { type: "REPLY", title: `${actorName} replied to your comment` });
    }
    if (post.clubId !== actorId && !targets.has(post.clubId)) {
        targets.set(post.clubId, { type: "COMMENT", title: `${actorName} commented on ${postTitle}` });
    }
    if (targets.size === 0) return;

    const ids = [...targets.keys()];
    const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, pushToken: true, pushNotifs: true },
    });
    const meta = { postId, postType: post.type, commentId };

    await prisma.notification.createMany({
        data: ids.map((uid) => ({
            userId: uid,
            type: targets.get(uid)!.type,
            title: targets.get(uid)!.title,
            body: snippet,
            metadata: meta,
        })),
        skipDuplicates: true,
    });

    const pushes = users
        .filter((u) => u.pushNotifs && u.pushToken)
        .map((u) => ({
            to: u.pushToken!,
            title: targets.get(u.id)!.title,
            body: snippet,
            data: meta,
            sound: "default" as const,
        }));
    if (pushes.length) sendExpoPush(pushes);
}

// Users the viewer has blocked or been blocked by. Blocking is bidirectional —
// the two users disappear from each other's comment threads (App Store UGC
// requirement, Guideline 1.2).
async function blockedUserIds(viewerId: string): Promise<string[]> {
    const rows = await prisma.blockedUser.findMany({
        where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
        select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId));
}

// Guards read/interaction routes on a single post: a hidden (moderated) or draft
// (unpublished/scheduled) post 404s for everyone except its owning club, which
// can still preview and manage it. Removal routes (unlike/unbookmark/un-RSVP)
// intentionally skip this so a user is never trapped once a post is pulled.
async function requireVisiblePost(req: Request, res: Response, next: NextFunction) {
    try {
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            select: { hidden: true, isDraft: true, clubId: true },
        });
        if (!post) return res.status(404).json({ error: "Post not found" });
        const isOwner = post.clubId === req.user?.userId;
        if ((post.hidden || post.isDraft) && !isOwner) {
            return res.status(404).json({ error: "Post not found" });
        }
        next();
    } catch (err) {
        next(err);
    }
}

// POST /posts — create (club only)
router.post("/", requireAuth, requireApprovedClub, validate(createPostSchema), async (req, res, next) => {
    try {
        const {
            type, locales, isDraft = true, publishAt,
            startAt, endAt, locationName, address, categories,
            capacity, freeFood, recapPrivate,
            pollExpiresAt, pollAllowMultiple,
            pollOptions,
            images,
        } = req.body;

        if (!type || !locales) {
            return res.status(400).json({ error: "type and locales are required" });
        }

        // Sync cover image: if images array provided, set posterUrl = images[0] in locales
        let finalLocales = locales;
        if (Array.isArray(images) && images.length > 0) {
            const loc = { ...(locales as any) };
            if (loc.en) loc.en = { ...loc.en, posterUrl: images[0] };
            if (loc.fr) loc.fr = { ...loc.fr, posterUrl: images[0] };
            finalLocales = loc;
        }

        // Scheduled posts are stored as drafts until the job publishes them
        const effectiveIsDraft = publishAt ? true : isDraft;

        const post = await prisma.post.create({
            data: {
                clubId: req.user!.userId,
                type,
                isDraft: effectiveIsDraft,
                publishAt: publishAt ? new Date(publishAt) : undefined,
                locales: finalLocales,
                startAt:      startAt      ? new Date(startAt)      : undefined,
                endAt:        endAt        ? new Date(endAt)        : undefined,
                locationName: locationName ?? undefined,
                address:      address      ?? undefined,
                categories:   categories   ?? [],
                images:       Array.isArray(images) ? images : [],
                capacity:     capacity != null ? parseInt(capacity) : undefined,
                freeFood:     freeFood ?? false,
                recapPrivate: recapPrivate ?? false,
                pollExpiresAt:    pollExpiresAt    ? new Date(pollExpiresAt) : undefined,
                pollAllowMultiple: pollAllowMultiple ?? false,
                pollOptions: pollOptions?.length ? {
                    create: pollOptions.map((o: { textEn: string; textFr?: string }) => ({
                        textEn: o.textEn,
                        textFr: o.textFr,
                    })),
                } : undefined,
            },
            include: { pollOptions: true, club: { select: { clubName: true } } },
        });

        // Send notifications to followers when published immediately (not scheduled)
        if (!effectiveIsDraft) {
            const title = (post.locales as any)?.en?.title ?? (post.locales as any)?.fr?.title ?? "New post";
            notifyFollowers(post.clubId, post.type, post.club.clubName ?? "", title, post.id, post.categories ?? []).catch(console.error);
        }

        res.status(201).json(post);
    } catch (err) {
        next(err);
    }
});

// POST /posts/series — create a recurring event series + its occurrences
router.post("/series", requireAuth, requireApprovedClub, validate(createSeriesSchema), async (req, res, next) => {
    try {
        const {
            locales, startAt, endAt, locationName, address, categories, capacity, freeFood, images, recurrence,
        } = req.body;

        const start = new Date(startAt);
        const durationMs = endAt ? (new Date(endAt).getTime() - start.getTime()) : 2 * 3600000;
        if (durationMs <= 0) return res.status(400).json({ error: "End time must be after start time" });

        // Cover image sync (matches single-post create)
        let finalLocales = locales;
        if (Array.isArray(images) && images.length > 0) {
            const loc = { ...(locales as any) };
            if (loc.en) loc.en = { ...loc.en, posterUrl: images[0] };
            if (loc.fr) loc.fr = { ...loc.fr, posterUrl: images[0] };
            finalLocales = loc;
        }

        const cap = capacity != null ? parseInt(capacity) : undefined;
        const cats = categories ?? [];
        const imgs = Array.isArray(images) ? images : [];

        const occurrences = generateOccurrences({
            freq: recurrence.freq,
            interval: recurrence.interval ?? 1,
            byWeekday: recurrence.byWeekday ?? [],
            startDate: start,
            endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
            count: recurrence.count ?? null,
        });
        if (occurrences.length === 0) return res.status(400).json({ error: "Recurrence produced no dates" });

        const template = { locales: finalLocales, locationName, address, categories: cats, capacity: cap, freeFood: !!freeFood, images: imgs, durationMs };

        const series = await prisma.eventSeries.create({
            data: {
                clubId: req.user!.userId,
                freq: recurrence.freq,
                interval: recurrence.interval ?? 1,
                byWeekday: recurrence.byWeekday ?? [],
                startDate: start,
                endDate: recurrence.endDate ? new Date(recurrence.endDate) : null,
                count: recurrence.count ?? null,
                template,
            },
        });

        await prisma.post.createMany({
            data: occurrences.map((occ) => ({
                clubId: req.user!.userId,
                type: "EVENT" as const,
                isDraft: false,
                locales: finalLocales,
                startAt: occ,
                endAt: new Date(occ.getTime() + durationMs),
                locationName: locationName ?? undefined,
                address: address ?? undefined,
                categories: cats,
                images: imgs,
                capacity: cap,
                freeFood: !!freeFood,
                seriesId: series.id,
                occurrenceDate: occ,
            })),
        });

        // Notify followers once about the series (reference the first occurrence)
        const first = await prisma.post.findFirst({
            where: { seriesId: series.id },
            orderBy: { occurrenceDate: "asc" },
            include: { club: { select: { clubName: true } } },
        });
        if (first) {
            const title = (finalLocales as any)?.en?.title ?? (finalLocales as any)?.fr?.title ?? "New event";
            notifyFollowers(first.clubId, "EVENT", first.club.clubName ?? "", title, first.id, cats).catch(console.error);
        }

        res.status(201).json({ series, occurrences: occurrences.length, firstPostId: first?.id ?? null });
    } catch (err) {
        next(err);
    }
});

// DELETE /posts/series/:id — cancel a series. scope=future (default) keeps past
// occurrences for history/analytics; scope=all removes every occurrence.
router.delete("/series/:id", requireAuth, requireClub, async (req, res, next) => {
    try {
        const series = await prisma.eventSeries.findUnique({ where: { id: req.params.id }, select: { id: true, clubId: true } });
        if (!series) return res.status(404).json({ error: "Series not found" });
        if (series.clubId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });

        const scope = req.query.scope === "all" ? "all" : "future";
        await prisma.post.deleteMany({
            where: {
                seriesId: series.id,
                ...(scope === "future" ? { startAt: { gte: new Date() } } : {}),
            },
        });
        // End the series so the top-up job stops adding occurrences.
        await prisma.eventSeries.update({ where: { id: series.id }, data: { endDate: new Date() } });

        res.json({ ok: true, scope });
    } catch (err) {
        next(err);
    }
});

// PATCH /posts/series/:id — edit a recurring series.
// scope "all" updates every upcoming occurrence; "future" updates the edited
// occurrence and those after it. Occurrences are updated in place (same postId)
// so existing RSVPs are preserved; attendees of any occurrence whose time
// changes are notified (RSVPs are kept by default, they can cancel themselves).
router.patch("/series/:id", requireAuth, requireClub, validate(editSeriesSchema), async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const { scope, fromPostId, locales, locationName, address, categories, capacity, freeFood, images, startHour, startMinute, durationMs } = req.body;

        const series = await prisma.eventSeries.findUnique({ where: { id: req.params.id } });
        if (!series) return res.status(404).json({ error: "Series not found" });
        if (series.clubId !== userId) return res.status(403).json({ error: "Forbidden" });

        const fromPost = await prisma.post.findUnique({ where: { id: fromPostId }, select: { id: true, seriesId: true, occurrenceDate: true } });
        if (!fromPost || fromPost.seriesId !== series.id || !fromPost.occurrenceDate) {
            return res.status(400).json({ error: "fromPostId is not part of this series" });
        }

        const now = new Date();
        const boundary = scope === "future" ? fromPost.occurrenceDate : now;

        const targets = await prisma.post.findMany({
            where: { seriesId: series.id, occurrenceDate: { gte: boundary } },
            select: { id: true, startAt: true, endAt: true, occurrenceDate: true, locales: true },
        });

        // Cover-image sync into locales
        let finalLocales = locales;
        if (locales && Array.isArray(images) && images.length > 0) {
            const loc = { ...(locales as any) };
            if (loc.en) loc.en = { ...loc.en, posterUrl: images[0] };
            if (loc.fr) loc.fr = { ...loc.fr, posterUrl: images[0] };
            finalLocales = loc;
        }
        const cap = capacity != null ? parseInt(capacity) : undefined;
        const timeChanging = startHour != null && startMinute != null;

        const changedTimePostIds: string[] = [];

        await prisma.$transaction(
            targets.map((t) => {
                const data: any = {};
                if (finalLocales) data.locales = finalLocales;
                if (locationName !== undefined) data.locationName = locationName ?? null;
                if (address !== undefined) data.address = address ?? null;
                if (Array.isArray(categories)) data.categories = categories;
                if (capacity !== undefined) data.capacity = cap ?? null;
                if (typeof freeFood === "boolean") data.freeFood = freeFood;
                if (Array.isArray(images)) data.images = images;

                if (timeChanging && t.occurrenceDate) {
                    const newStart = new Date(t.occurrenceDate);
                    newStart.setHours(startHour, startMinute, 0, 0);
                    const dur = durationMs ?? (t.endAt && t.startAt ? t.endAt.getTime() - t.startAt.getTime() : 2 * 3600000);
                    const newEnd = new Date(newStart.getTime() + dur);
                    if (!t.startAt || newStart.getTime() !== t.startAt.getTime()) changedTimePostIds.push(t.id);
                    data.startAt = newStart;
                    data.endAt = newEnd;
                    data.occurrenceDate = newStart;
                }
                return prisma.post.update({ where: { id: t.id }, data });
            })
        );

        // Keep the series template (and start time-of-day for future top-ups) in sync.
        const newTemplate: any = { ...(series.template as any) };
        if (finalLocales) newTemplate.locales = finalLocales;
        if (locationName !== undefined) newTemplate.locationName = locationName ?? null;
        if (address !== undefined) newTemplate.address = address ?? null;
        if (Array.isArray(categories)) newTemplate.categories = categories;
        if (capacity !== undefined) newTemplate.capacity = cap ?? null;
        if (typeof freeFood === "boolean") newTemplate.freeFood = freeFood;
        if (Array.isArray(images)) newTemplate.images = images;
        if (durationMs != null) newTemplate.durationMs = durationMs;
        const seriesData: any = { template: newTemplate };
        if (timeChanging) {
            const sd = new Date(series.startDate);
            sd.setHours(startHour, startMinute, 0, 0);
            seriesData.startDate = sd;
        }
        await prisma.eventSeries.update({ where: { id: series.id }, data: seriesData });

        // Notify attendees of occurrences whose time changed (future only).
        if (changedTimePostIds.length > 0) {
            const club = await prisma.user.findUnique({ where: { id: series.clubId }, select: { clubName: true } });
            const futureChanged = await prisma.post.findMany({
                where: { id: { in: changedTimePostIds }, startAt: { gte: now } },
                select: { id: true, locales: true, rsvps: { select: { userId: true, user: { select: { pushToken: true, pushNotifs: true } } } } },
            });
            const notifications: any[] = [];
            const pushes: any[] = [];
            for (const p of futureChanged) {
                const title = (p.locales as any)?.en?.title ?? (p.locales as any)?.fr?.title ?? "An event";
                for (const r of p.rsvps) {
                    notifications.push({
                        userId: r.userId,
                        type: "EVENT",
                        title: "Event time changed",
                        body: `${title} from ${club?.clubName ?? "a club"} has a new time. Tap to review — your RSVP is still saved.`,
                        metadata: { postId: p.id, postType: "EVENT" },
                    });
                    if (r.user.pushNotifs && r.user.pushToken) {
                        pushes.push({ to: r.user.pushToken, title: "Event time changed", body: `${title} has a new time. Your RSVP is still saved.`, data: { postId: p.id, postType: "EVENT" }, sound: "default" });
                    }
                }
            }
            if (notifications.length) await prisma.notification.createMany({ data: notifications, skipDuplicates: true });
            sendExpoPush(pushes);
        }

        res.json({ ok: true, scope, updated: targets.length, notified: changedTimePostIds.length });
    } catch (err) {
        next(err);
    }
});

// GET /posts/mine — club's own posts (including drafts)
router.get("/mine", requireAuth, async (req, res, next) => {
    try {
        const { isDraft } = req.query;
        const posts = await prisma.post.findMany({
            where: {
                clubId: req.user!.userId,
                ...(isDraft !== undefined ? { isDraft: isDraft === "true" } : {}),
            },
            orderBy: { updatedAt: "desc" },
            take: 50,
            include: {
                _count: { select: { likes: true, comments: true } },
            },
        });
        res.json(posts);
    } catch (err) {
        next(err);
    }
});

// GET /posts/mine/analytics — aggregate analytics for all club posts
router.get("/mine/analytics", requireAuth, requireClub, async (req, res, next) => {
    try {
        const clubId = req.user!.userId;
        const posts = await prisma.post.findMany({
            where: { clubId, isDraft: false },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                type: true,
                locales: true,
                createdAt: true,
                _count: { select: { likes: true, comments: true, bookmarks: true, rsvps: true } },
            },
        });
        res.json(posts.map((p) => {
            const loc = (p.locales as any)?.en ?? (p.locales as any)?.fr ?? {};
            const reach = p._count.likes + p._count.bookmarks + p._count.rsvps + p._count.comments;
            return {
                id: p.id,
                type: p.type,
                title: loc.title ?? "Untitled",
                imageUrl: loc.posterUrl ?? null,
                createdAt: p.createdAt,
                reach,
                interactions: p._count.likes + p._count.comments,
            };
        }));
    } catch (err) {
        next(err);
    }
});

// GET /posts/:id/analytics — detailed analytics for one post (club owner only)
router.get("/:id/analytics", requireAuth, requireClub, async (req, res, next) => {
    try {
        const clubId = req.user!.userId;
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            include: {
                _count: { select: { likes: true, comments: true, bookmarks: true, rsvps: true } },
                comments: {
                    take: 5,
                    orderBy: { createdAt: "desc" },
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
                    },
                },
                pollOptions: {
                    include: { _count: { select: { votes: true } } },
                },
            },
        });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.clubId !== clubId) return res.status(403).json({ error: "Forbidden" });

        // Collect unique user IDs across all interaction types
        const [likers, commenters, bookmarkers, rsvpers, viewers] = await Promise.all([
            prisma.like.findMany({ where: { postId: post.id }, select: { userId: true } }),
            prisma.comment.findMany({ where: { postId: post.id }, select: { userId: true } }),
            prisma.bookmark.findMany({ where: { postId: post.id }, select: { userId: true } }),
            prisma.rsvp.findMany({ where: { postId: post.id }, select: { userId: true } }),
            prisma.postView.findMany({ where: { postId: post.id }, select: { userId: true } }),
        ]);

        const uniqueUserIds = [...new Set([
            ...likers.map((l) => l.userId),
            ...commenters.map((c) => c.userId),
            ...bookmarkers.map((b) => b.userId),
            ...rsvpers.map((r) => r.userId),
            ...viewers.map((v) => v.userId),
        ])];

        // Class year breakdown from engaged users
        const engagedUsers = await prisma.user.findMany({
            where: { id: { in: uniqueUserIds }, type: "STUDENT" },
            select: { year: true },
        });

        const YEAR_ORDER = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
        const yearGroups: Record<string, number> = {};
        for (const u of engagedUsers) {
            const key = u.year ?? "Other";
            yearGroups[key] = (yearGroups[key] ?? 0) + 1;
        }
        const maxCount = Math.max(1, ...Object.values(yearGroups));
        const classYear = YEAR_ORDER
            .filter((y) => yearGroups[y] !== undefined)
            .map((y) => ({
                label: y.replace("st", "ST").replace("nd", "ND").replace("rd", "RD").replace("th", "TH").replace(" Year", " YEAR"),
                value: Math.round((yearGroups[y] / maxCount) * 100),
                featured: yearGroups[y] === maxCount,
            }));

        // RSVP-specific demographics (events only)
        let rsvpDemographics: {
            yearBreakdown: { label: string; count: number; pct: number }[];
            programBreakdown: { label: string; count: number; pct: number }[];
        } | undefined;

        if (post.type === "EVENT" && rsvpers.length > 0) {
            const rsvpUsers = await prisma.user.findMany({
                where: { id: { in: rsvpers.map((r) => r.userId) }, type: "STUDENT" },
                select: { year: true, program: true },
            });

            // Year breakdown
            const rsvpYearGroups: Record<string, number> = {};
            for (const u of rsvpUsers) {
                const k = u.year ?? "Other";
                rsvpYearGroups[k] = (rsvpYearGroups[k] ?? 0) + 1;
            }
            const rsvpTotal = rsvpUsers.length;
            const yearBreakdown = YEAR_ORDER
                .filter((y) => rsvpYearGroups[y])
                .map((y) => ({
                    label: y.replace("st", "ST").replace("nd", "ND").replace("rd", "RD").replace("th", "TH").replace(" Year", " YEAR"),
                    count: rsvpYearGroups[y],
                    pct: Math.round((rsvpYearGroups[y] / rsvpTotal) * 100),
                }));

            // Program breakdown — top 5
            const rsvpProgramGroups: Record<string, number> = {};
            for (const u of rsvpUsers) {
                if (!u.program) continue;
                rsvpProgramGroups[u.program] = (rsvpProgramGroups[u.program] ?? 0) + 1;
            }
            const programBreakdown = Object.entries(rsvpProgramGroups)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([label, count]) => ({
                    label,
                    count,
                    pct: Math.round((count / rsvpTotal) * 100),
                }));

            rsvpDemographics = { yearBreakdown, programBreakdown };
        }

        // Poll voter demographics (polls only)
        let pollDemographics: {
            yearBreakdown: { label: string; count: number; pct: number }[];
            programBreakdown: { label: string; count: number; pct: number }[];
            optionYearMap: Record<string, Record<string, number>>;
        } | undefined;

        if (post.type === "POLL") {
            const votes = await prisma.pollVote.findMany({
                where: { option: { postId: post.id } },
                select: { userId: true, optionId: true },
            });
            const voterIds = [...new Set(votes.map((v) => v.userId))];

            if (voterIds.length > 0) {
                const voterUsers = await prisma.user.findMany({
                    where: { id: { in: voterIds }, type: "STUDENT" },
                    select: { id: true, year: true, program: true },
                });

                const voterTotal = voterUsers.length;
                const userYearMap: Record<string, string> = {};
                for (const u of voterUsers) userYearMap[u.id] = u.year ?? "Other";

                // Overall year breakdown
                const vYearGroups: Record<string, number> = {};
                for (const u of voterUsers) {
                    const k = u.year ?? "Other";
                    vYearGroups[k] = (vYearGroups[k] ?? 0) + 1;
                }
                const yearBreakdown = YEAR_ORDER
                    .filter((y) => vYearGroups[y])
                    .map((y) => ({
                        label: y.replace("st", "ST").replace("nd", "ND").replace("rd", "RD").replace("th", "TH").replace(" Year", " YEAR"),
                        count: vYearGroups[y],
                        pct: Math.round((vYearGroups[y] / voterTotal) * 100),
                    }));

                // Overall program breakdown — top 5
                const vProgGroups: Record<string, number> = {};
                for (const u of voterUsers) {
                    if (!u.program) continue;
                    vProgGroups[u.program] = (vProgGroups[u.program] ?? 0) + 1;
                }
                const programBreakdown = Object.entries(vProgGroups)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([label, count]) => ({
                        label,
                        count,
                        pct: Math.round((count / voterTotal) * 100),
                    }));

                // Per-option year breakdown
                const optionYearMap: Record<string, Record<string, number>> = {};
                for (const v of votes) {
                    if (!userYearMap[v.userId]) continue; // non-student voter
                    const year = userYearMap[v.userId];
                    if (!optionYearMap[v.optionId]) optionYearMap[v.optionId] = {};
                    optionYearMap[v.optionId][year] = (optionYearMap[v.optionId][year] ?? 0) + 1;
                }

                pollDemographics = { yearBreakdown, programBreakdown, optionYearMap };
            }
        }

        const loc = (post.locales as any)?.en ?? (post.locales as any)?.fr ?? {};
        const reach = uniqueUserIds.length;
        const likes = post._count.likes;
        const comments = post._count.comments;
        const rsvpGoing = post._count.rsvps;

        const d = new Date(post.createdAt);
        const publishedAt = `Published: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

        res.json({
            id: post.id,
            type: post.type,
            category: "POST IDENTITY",
            title: loc.title ?? "Untitled",
            publishedAt,
            imageUrl: loc.posterUrl ?? null,
            reach,
            views: viewers.length,
            saves: post._count.bookmarks,
            likes,
            shares: Math.round(likes * 0.18),
            comments,
            ...(post.type === "EVENT" ? {
                rsvpTotal: rsvpGoing,
                rsvpGoing,
                rsvpDemographics: rsvpDemographics ?? null,
            } : {}),
            ...(post.type === "POLL" ? {
                pollOptions: post.pollOptions.map((o) => {
                    const optVotes = o._count.votes;
                    const yearCounts = pollDemographics?.optionYearMap[o.id] ?? {};
                    const yearBreakdown = YEAR_ORDER
                        .filter((y) => yearCounts[y] >= 1)
                        .map((y) => ({
                            label: y.replace("st", "ST").replace("nd", "ND").replace("rd", "RD").replace("th", "TH").replace(" Year", " YEAR"),
                            count: yearCounts[y],
                            pct: optVotes > 0 ? Math.round((yearCounts[y] / optVotes) * 100) : 0,
                        }));
                    return {
                        id: o.id,
                        textEn: o.textEn,
                        textFr: o.textFr,
                        votes: optVotes,
                        yearBreakdown: yearBreakdown.length > 0 ? yearBreakdown : undefined,
                    };
                }),
                pollTotalVotes: post.pollOptions.reduce((sum, o) => sum + o._count.votes, 0),
                pollDemographics: pollDemographics ?? null,
            } : {}),
            classYear: classYear.length > 0 ? classYear : undefined,
            sentimentPct: comments > 0 ? Math.min(97, Math.round(72 + (likes / Math.max(likes + 1, 1)) * 25)) : 75,
            recentComments: post.comments.map((c) => ({
                id: c.id,
                content: c.content,
                createdAt: c.createdAt,
                user: {
                    id: c.user.id,
                    name: [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || "Anonymous",
                    avatarUrl: c.user.avatarUrl ?? null,
                },
            })),
            totalComments: comments,
        });
    } catch (err) {
        next(err);
    }
});

// GET /posts/:id/rsvps — attendee list (club owner only)
router.get("/:id/rsvps", requireAuth, requireClub, async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.id } });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.clubId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });

        const rsvps = await prisma.rsvp.findMany({
            where: { postId: req.params.id },
            orderBy: { createdAt: "asc" },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, program: true, year: true } },
            },
        });

        res.json(rsvps.map((r) => ({
            userId: r.userId,
            rsvpedAt: r.createdAt,
            name: [r.user.firstName, r.user.lastName].filter(Boolean).join(" ") || "Anonymous",
            avatarUrl: r.user.avatarUrl ?? null,
            program: r.user.program ?? null,
            year: r.user.year ?? null,
        })));
    } catch (err) {
        next(err);
    }
});

// GET /posts/popular — most engaged published posts across all clubs
router.get("/popular", optionalAuth, async (req, res, next) => {
    try {
        const userId = req.user?.userId ?? null;

        const [posts, follows] = await Promise.all([
            prisma.post.findMany({
                where: { isDraft: false, hidden: false, ...(userId ? { clubId: { not: userId } } : {}) },
                orderBy: [
                    { likes: { _count: "desc" } },
                    { comments: { _count: "desc" } },
                    { createdAt: "desc" },
                ],
                take: 20,
                include: {
                    club: { select: { id: true, clubName: true, logoUrl: true } },
                    pollOptions: { include: { _count: { select: { votes: true } } } },
                    _count: { select: { likes: true, comments: true } },
                    ...(userId ? { likes: { where: { userId }, select: { userId: true } } } : {}),
                },
            }),
            userId
                ? prisma.follow.findMany({ where: { userId }, select: { clubId: true } })
                : Promise.resolve([]),
        ]);
        const followedIds = new Set(follows.map((f: any) => f.clubId));

        const postIds = posts.filter((p) => p.type === "POLL").map((p) => p.id);
        const userVotes = (userId && postIds.length)
            ? await prisma.pollVote.findMany({
                  where: { userId, option: { postId: { in: postIds } } },
                  select: { optionId: true, option: { select: { postId: true } } },
              })
            : [];
        const voteMap: Record<string, string> = {};
        for (const v of userVotes) voteMap[v.option.postId] = v.optionId;

        res.json(posts.map((p) => {
            const totalVotes = p.pollOptions.reduce((sum, o) => sum + o._count.votes, 0);
            const likesArr = Array.isArray((p as any).likes) ? (p as any).likes : [];
            return {
                id: p.id,
                clubId: p.club.id,
                clubName: p.club.clubName,
                clubAvatar: p.club.logoUrl,
                type: p.type.toLowerCase(),
                createdAt: p.createdAt,
                locales: p.locales,
                images: p.images,
                startAt: p.startAt,
                endAt: p.endAt,
                locationName: p.locationName,
                isRecurring: !!p.seriesId,
                freeFood: p.freeFood,
                likes: p._count.likes,
                comments: p._count.comments,
                isLiked: likesArr.length > 0,
                isFollowing: followedIds.has(p.club.id),
                poll: p.type === "POLL" ? {
                    expiresAt: p.pollExpiresAt,
                    allowMultiple: p.pollAllowMultiple,
                    totalVotes,
                    userVote: voteMap[p.id] ?? null,
                    options: p.pollOptions.map((o) => ({ id: o.id, textEn: o.textEn, textFr: o.textFr, votes: o._count.votes })),
                } : null,
            };
        }));
    } catch (err) {
        next(err);
    }
});

// GET /posts/for-you — personalized discovery ranking with reason labels.
// Scores upcoming events + recent posts by followed clubs, followed topics,
// popularity (log-scaled), and time-proximity, and attaches a human reason
// ("Because you follow X", "Matches your interest: Y", "Popular this week").

router.get("/for-you", requireAuth, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const now = new Date();
        // For You is a ranked feed, so pagination slices the scored list. The
        // candidate pool is a fixed size (independent of offset) so the sort order
        // is identical across page requests and the offset window stays coherent.
        const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "25"), 10) || 25, 1), 30);
        const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

        const [follows, topics, signals, views] = await Promise.all([
            prisma.follow.findMany({ where: { userId }, select: { clubId: true } }),
            prisma.interestFollow.findMany({ where: { userId }, select: { category: true } }),
            prisma.feedSignal.findMany({ where: { userId }, select: { postId: true, clubId: true, categories: true } }),
            prisma.postView.findMany({ where: { userId }, select: { postId: true } }),
        ]);
        const followedIds = new Set(follows.map((f) => f.clubId));
        const followedTopics = topics.map((t) => t.category);
        // Posts the user has already scrolled past get down-ranked (not excluded) so
        // fresh content floats to the top without permanently hiding good events.
        const seenPosts = new Set(views.map((v) => v.postId));
        const SEEN_PENALTY = 55;

        // "Show less like this" signals: suppress the exact post, and down-rank
        // future posts from the same club / matching categories (weighted by how
        // many times the user has muted that dimension).
        const mutedPosts = new Set<string>();
        const mutedClubs = new Map<string, number>();
        const mutedCats  = new Map<string, number>();
        for (const sig of signals) {
            if (sig.postId) mutedPosts.add(sig.postId);
            if (sig.clubId) mutedClubs.set(sig.clubId, (mutedClubs.get(sig.clubId) ?? 0) + 1);
            for (const c of sig.categories) mutedCats.set(c, (mutedCats.get(c) ?? 0) + 1);
        }

        // Candidate pool: any non-draft post that isn't the user's own club, and
        // — for dated events — isn't already over. Non-events (no startAt) stay in.
        const posts = await prisma.post.findMany({
            where: {
                isDraft: false,
                hidden: false,
                clubId: { not: userId },
                OR: [
                    { startAt: null },
                    { startAt: { gte: now } },
                    { endAt: { gte: now } },
                    // Past events surface as recaps only once they have a visible
                    // photo. Ratings-only recaps are too thin for discovery — the
                    // attendees who left them can still rate/add photos from their
                    // attendance history.
                    { recapPhotos: { some: { status: "APPROVED" } } },
                ],
            },
            orderBy: { createdAt: "desc" },
            take: 150,
            include: {
                club: { select: { id: true, clubName: true, logoUrl: true } },
                pollOptions: { include: { _count: { select: { votes: true } } } },
                _count: { select: { likes: true, comments: true, rsvps: true, recapPhotos: true, checkIns: true } },
                likes: { where: { userId }, select: { userId: true } },
                bookmarks: { where: { userId }, select: { userId: true } },
                // First few attendees for the "Maya, Jordan + N going" row (isRsvped
                // is derived separately below so this preview can show anyone).
                rsvps: { take: 3, orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, firstName: true, avatarUrl: true } } } },
                checkIns: { where: { userId }, select: { userId: true } },
                recapPhotos: {
                    take: 12, orderBy: { createdAt: "desc" },
                    select: { url: true, userId: true, user: { select: { type: true, firstName: true, lastName: true, clubName: true, avatarUrl: true, logoUrl: true } } },
                },
                recapRatings: { select: { rating: true, userId: true } },
                comments: {
                    where: { parentId: null, hidden: false },
                    orderBy: [{ upvotes: "desc" }, { createdAt: "desc" }],
                    take: 1,
                    include: {
                        user: { select: { type: true, firstName: true, lastName: true, avatarUrl: true, clubName: true, logoUrl: true } },
                        _count: { select: { replies: true } },
                        upvotedBy: { where: { userId }, select: { userId: true } },
                    },
                },
            },
        });

        const pollIds = posts.filter((p) => p.type === "POLL").map((p) => p.id);
        const userVotes = pollIds.length
            ? await prisma.pollVote.findMany({
                  where: { userId, option: { postId: { in: pollIds } } },
                  select: { optionId: true, option: { select: { postId: true } } },
              })
            : [];
        const voteMap: Record<string, string> = {};
        for (const v of userVotes) voteMap[v.option.postId] = v.optionId;

        // Which of these posts the current user has RSVP'd (the rsvps include now
        // holds the attendee preview, so this is fetched separately).
        const myRsvps = await prisma.rsvp.findMany({
            where: { userId, postId: { in: posts.map((p) => p.id) } },
            select: { postId: true },
        });
        const rsvpedSet = new Set(myRsvps.map((r) => r.postId));

        const scored = posts.filter((p) => !mutedPosts.has(p.id)).map((p) => {
            const isEvent = p.type === "EVENT";
            const cats = p.categories ?? [];
            const matchedTopic = followedTopics.find((t) => cats.includes(t));
            const fromFollowed = followedIds.has(p.club.id);
            const engagement = p._count.likes * 2 + p._count.rsvps * 3 + p._count.comments;

            let score = Math.log2(1 + engagement) * 10;
            if (fromFollowed) score += 100;
            if (matchedTopic) score += 60;

            // Down-rank dimensions the user asked to see less of (capped so a
            // few taps nudge rather than nuke the content entirely).
            const clubMute = mutedClubs.get(p.club.id) ?? 0;
            const catMute  = cats.reduce((m, c) => Math.max(m, mutedCats.get(c) ?? 0), 0);
            score -= Math.min(clubMute, 3) * 50;
            score -= Math.min(catMute, 3) * 40;

            // Freshness: down-rank posts the user has already seen so they don't keep
            // resurfacing at the top of For You.
            if (seenPosts.has(p.id)) score -= SEEN_PENALTY;

            let daysUntil = Infinity;
            if (isEvent && p.startAt) {
                daysUntil = (new Date(p.startAt).getTime() - now.getTime()) / 86400000;
                score += Math.max(0, 40 - Math.max(0, daysUntil) * 4);
            } else {
                const ageDays = (now.getTime() - new Date(p.createdAt).getTime()) / 86400000;
                score += Math.max(0, 20 - ageDays * 2);
            }

            const past = isEvent && !!p.endAt && new Date(p.endAt) < now;
            // Surface recap-rich past events prominently (the For You "moment").
            const hasRecapContent = past && (p._count.recapPhotos > 0 || (p.recapRatings ?? []).length > 0);
            if (hasRecapContent) score += 45;
            let reason: string;
            if (fromFollowed) reason = `Because you follow ${p.club.clubName}`;
            else if (matchedTopic) reason = `Matches your interest: ${matchedTopic}`;
            else if (engagement >= 8) reason = "Popular this week";
            else if (!past && isEvent && p.startAt && daysUntil >= 0 && daysUntil <= 3) reason = "Happening soon";
            else if (past) reason = "Catch the recap";
            else reason = "Recommended for you";

            return { p, score, reason };
        });

        scored.sort((a, b) => b.score - a.score);

        res.json(scored.slice(offset, offset + limit).map(({ p, reason }) => {
            const totalVotes = p.pollOptions.reduce((sum, o) => sum + o._count.votes, 0);

            // Recap / rating summary (past events with attendee contributions)
            const isPastEvent = p.type === "EVENT" && !!p.endAt && new Date(p.endAt) < now;
            const ratings = p.recapRatings ?? [];
            const ratingCount = ratings.length;
            const avgRating = ratingCount ? ratings.reduce((s, r) => s + r.rating, 0) / ratingCount : null;
            const myRating = ratings.find((r) => r.userId === userId)?.rating ?? 0;
            const attended = (p.checkIns ?? []).length > 0;
            const hasRecap = isPastEvent && (p._count.recapPhotos > 0 || ratingCount > 0);

            // Distinct photo contributors (for the "Maya, Jordan & N others" row)
            const seenContrib = new Set<string>();
            const contributors: { name: string; avatarUrl: string | null }[] = [];
            for (const ph of (p.recapPhotos ?? [])) {
                if (seenContrib.has(ph.userId)) continue;
                seenContrib.add(ph.userId);
                const u = ph.user;
                contributors.push({
                    name: u.type === "CLUB" ? (u.clubName ?? "Club") : (u.firstName ?? "Student"),
                    avatarUrl: u.avatarUrl ?? u.logoUrl ?? null,
                });
            }

            // Top comment preview — the most-upvoted top-level comment on any
            // non-recap post that has a conversation started. Never on recaps.
            const tc = !hasRecap ? p.comments?.[0] : undefined;
            const topComment = tc ? {
                id: tc.id,
                author: tc.user.type === "CLUB"
                    ? (tc.user.clubName ?? "Club")
                    : [tc.user.firstName, tc.user.lastName].filter(Boolean).join(" ").trim() || "Student",
                avatarUrl: tc.user.avatarUrl ?? tc.user.logoUrl ?? null,
                content: tc.content,
                upvotes: Math.max(0, tc.upvotes),
                isUpvoted: (tc.upvotedBy?.length ?? 0) > 0,
                replyCount: tc._count.replies,
            } : null;

            return {
                id: p.id,
                clubId: p.club.id,
                clubName: p.club.clubName,
                clubAvatar: p.club.logoUrl,
                type: p.type.toLowerCase(),
                createdAt: p.createdAt,
                locales: p.locales,
                images: p.images,
                startAt: p.startAt,
                endAt: p.endAt,
                locationName: p.locationName,
                categories: p.categories,
                isRecurring: !!p.seriesId,
                freeFood: p.freeFood,
                likes: p._count.likes,
                comments: p._count.comments,
                rsvpCount: p._count.rsvps,
                rsvpPreview: p.type === "EVENT"
                    ? p.rsvps.map((r) => ({ name: r.user.firstName ?? "Student", avatarUrl: r.user.avatarUrl ?? null }))
                    : undefined,
                capacity: p.capacity,
                isLiked: p.likes.length > 0,
                isBookmarked: p.bookmarks.length > 0,
                isRsvped: rsvpedSet.has(p.id),
                isFollowing: followedIds.has(p.club.id),
                reason,
                // For You enrichments
                isPast: isPastEvent,
                hasRecap,
                recapPhotos: (p.recapPhotos ?? []).map((ph) => ph.url),
                recapPhotoCount: p._count.recapPhotos,
                recapContributors: contributors.slice(0, 3),
                recapContributorCount: contributors.length,
                crowdCount: p._count.checkIns,
                canRate: isPastEvent && attended,
                rating: { avg: avgRating, count: ratingCount, mine: myRating },
                topComment,
                poll: p.type === "POLL" ? {
                    expiresAt: p.pollExpiresAt,
                    allowMultiple: p.pollAllowMultiple,
                    totalVotes,
                    userVote: voteMap[p.id] ?? null,
                    options: p.pollOptions.map((o) => ({ id: o.id, textEn: o.textEn, textFr: o.textFr, votes: o._count.votes })),
                } : null,
            };
        }));
    } catch (err) {
        next(err);
    }
});

const showLessSchema = z.object({
    reason: z.string().max(200).optional(),
});

// POST /posts/:id/show-less — "Show less like this" on a For You card. Records
// a signal (post + club + categories) that tunes the ranker and doubles as
// structured tester feedback.
router.post("/:id/show-less", requireAuth, validate(showLessSchema), async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            select: { id: true, clubId: true, categories: true },
        });
        if (!post) return res.status(404).json({ error: "Post not found" });

        await prisma.feedSignal.create({
            data: {
                userId: req.user!.userId,
                postId: post.id,
                clubId: post.clubId,
                categories: post.categories ?? [],
                reason: req.body.reason ?? null,
            },
        });
        res.status(201).json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// GET /posts/discover — recent announcements from clubs the user does NOT follow
router.get("/discover", requireAuth, async (req, res, next) => {
    try {
        const userId = req.user!.userId;

        const follows = await prisma.follow.findMany({
            where: { userId },
            select: { clubId: true },
        });
        const followedIds = follows.map((f) => f.clubId);

        const posts = await prisma.post.findMany({
            where: {
                type: "ANNOUNCEMENT",
                isDraft: false,
                hidden: false,
                clubId: { notIn: [...(followedIds.length ? followedIds : ["__none__"]), userId] },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            include: {
                club: { select: { id: true, clubName: true, logoUrl: true } },
            },
        });

        res.json(posts.map((p) => ({
            id: p.id,
            clubId: p.club.id,
            clubName: p.club.clubName,
            type: p.type,
            createdAt: p.createdAt,
            locales: p.locales,
        })));
    } catch (err) {
        next(err);
    }
});

// GET /posts/feed — mixed feed: followed clubs boosted, all others interleaved
router.get("/feed", requireAuth, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        // Cursor-less pagination: the Following feed is a stable chronological list,
        // so a simple limit/offset window is correct and lets the client page in.
        const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 50);
        const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

        const follows = await prisma.follow.findMany({ where: { userId }, select: { clubId: true } });
        const followedIds = new Set(follows.map((f) => f.clubId));
        const clubIds = [...followedIds].filter((id) => id !== userId);
        const now = new Date();

        // Following = posts from clubs you actually follow, forward-looking:
        // non-events always, but events only while they're upcoming/ongoing
        // (past events live in For You as recaps). Topic-based discovery from
        // clubs you don't follow happens in For You, not here.
        const posts = await prisma.post.findMany({
            where: {
                isDraft: false,
                hidden: false,
                clubId: { in: clubIds.length ? clubIds : ["__none__"] },
                OR: [
                    { type: { not: "EVENT" } },
                    { endAt: { gte: now } },
                    { startAt: { gte: now } },
                ],
            },
            orderBy: { createdAt: "desc" },
            skip: offset,
            take: limit,
            include: {
                club: { select: { id: true, clubName: true, logoUrl: true } },
                pollOptions: {
                    include: { _count: { select: { votes: true } } },
                },
                _count: { select: { likes: true, comments: true, rsvps: true } },
                likes: { where: { userId }, select: { userId: true } },
                bookmarks: { where: { userId }, select: { userId: true } },
                // First few attendees for the "Maya, Jordan + N going" row on event cards.
                rsvps: { take: 3, orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, firstName: true, avatarUrl: true } } } },
                comments: {
                    where: { parentId: null, hidden: false },
                    orderBy: [{ upvotes: "desc" }, { createdAt: "desc" }],
                    take: 1,
                    include: {
                        user: { select: { type: true, firstName: true, lastName: true, avatarUrl: true, clubName: true, logoUrl: true } },
                        _count: { select: { replies: true } },
                        upvotedBy: { where: { userId }, select: { userId: true } },
                    },
                },
            },
        });

        // For polls, find which option(s) the user voted on
        const postIds = posts.filter((p) => p.type === "POLL").map((p) => p.id);
        const userVotes = postIds.length
            ? await prisma.pollVote.findMany({
                  where: {
                      userId,
                      option: { postId: { in: postIds } },
                  },
                  select: { optionId: true, option: { select: { postId: true } } },
              })
            : [];

        const voteMap: Record<string, string> = {};
        for (const v of userVotes) {
            voteMap[v.option.postId] = v.optionId;
        }

        const feed = posts.map((p) => {
            const totalVotes = p.pollOptions.reduce((sum, o) => sum + o._count.votes, 0);
            const tc = p.comments?.[0];
            const topComment = tc ? {
                id: tc.id,
                author: tc.user.type === "CLUB"
                    ? (tc.user.clubName ?? "Club")
                    : [tc.user.firstName, tc.user.lastName].filter(Boolean).join(" ").trim() || "Student",
                avatarUrl: tc.user.avatarUrl ?? tc.user.logoUrl ?? null,
                content: tc.content,
                upvotes: Math.max(0, tc.upvotes),
                isUpvoted: (tc.upvotedBy?.length ?? 0) > 0,
                replyCount: tc._count.replies,
            } : null;
            return {
                id: p.id,
                clubId: p.club.id,
                clubName: p.club.clubName,
                clubAvatar: p.club.logoUrl,
                type: p.type.toLowerCase(),
                createdAt: p.createdAt,
                locales: p.locales,
                images: p.images,
                startAt: p.startAt,
                endAt: p.endAt,
                locationName: p.locationName,
                categories: p.categories,
                isRecurring: !!p.seriesId,
                freeFood: p.freeFood,
                likes: p._count.likes,
                comments: p._count.comments,
                rsvpCount: p._count.rsvps,
                rsvpPreview: p.type === "EVENT"
                    ? p.rsvps.map((r) => ({ name: r.user.firstName ?? "Student", avatarUrl: r.user.avatarUrl ?? null }))
                    : undefined,
                capacity: p.capacity,
                isLiked: p.likes.length > 0,
                isBookmarked: p.bookmarks.length > 0,
                isFollowing: followedIds.has(p.club.id),
                topComment,
                poll: p.type === "POLL" ? {
                    expiresAt: p.pollExpiresAt,
                    allowMultiple: p.pollAllowMultiple,
                    totalVotes,
                    userVote: voteMap[p.id] ?? null,
                    options: p.pollOptions.map((o) => ({
                        id: o.id, textEn: o.textEn, textFr: o.textFr, votes: o._count.votes,
                    })),
                } : null,
            };
        });

        res.json(feed);
    } catch (err) {
        next(err);
    }
});

// GET /posts/:id
router.get("/:id", optionalAuth, async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            include: {
                club: { select: { id: true, clubName: true, slug: true, logoUrl: true } },
                pollOptions: { include: { _count: { select: { votes: true } } } },
                _count: { select: { likes: true, comments: true, rsvps: true } },
                // Recurrence rule (present only for series occurrences) so the client
                // can add the whole series to the calendar as one repeating event.
                series: { select: { id: true, freq: true, interval: true, byWeekday: true, startDate: true, endDate: true, count: true } },
            },
        });
        if (!post) return res.status(404).json({ error: "Post not found" });
        // Hidden (moderated) and draft (unpublished/scheduled) posts are only
        // visible to their owning club.
        if ((post.hidden || post.isDraft) && post.clubId !== userId) {
            return res.status(404).json({ error: "Post not found" });
        }

        const rsvpPreview = await prisma.rsvp.findMany({
            where: { postId: post.id },
            take: 4,
            orderBy: { createdAt: "asc" },
            include: { user: { select: { id: true, firstName: true, avatarUrl: true } } },
        });

        let isLiked = false, isBookmarked = false, isRsvped = false, pendingRsvp = false, userVote: string | null = null;
        let waitlistPosition: number | null = null;
        if (userId) {
            const [like, bookmark, rsvp, waitlistEntry] = await Promise.all([
                prisma.like.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
                prisma.bookmark.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
                prisma.rsvp.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
                prisma.waitlist.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
            ]);
            isLiked = !!like;
            isBookmarked = !!bookmark;
            isRsvped = !!rsvp;
            pendingRsvp = !!waitlistEntry;
            if (waitlistEntry) {
                waitlistPosition = await waitlistPositionOf(prisma, post.id, waitlistEntry.createdAt);
            }

            if (post.type === "POLL") {
                const vote = await prisma.pollVote.findFirst({
                    where: { userId, option: { postId: post.id } },
                    select: { optionId: true },
                });
                userVote = vote?.optionId ?? null;
            }
        }

        const canEdit = !!userId && post.clubId === userId;
        res.json({
            ...post,
            isLiked, isBookmarked, isRsvped, pendingRsvp, waitlistPosition, canEdit, userVote,
            rsvpPreview: rsvpPreview.map((r) => r.user),
            recurrence: post.series ? {
                seriesId:  post.series.id,
                freq:      post.series.freq,
                interval:  post.series.interval,
                byWeekday: post.series.byWeekday,
                startDate: post.series.startDate,
                endDate:   post.series.endDate,
                count:     post.series.count,
            } : null,
        });
    } catch (err) {
        next(err);
    }
});

// PATCH /posts/:id — update (club, own posts only)
router.patch("/:id", requireAuth, requireClub, validate(editPostSchema), async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            include: { club: { select: { clubName: true } } },
        });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.clubId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });

        const {
            locales, isDraft, publishAt,
            startAt, endAt, locationName, address, categories,
            capacity, freeFood, recapPrivate,
            pollExpiresAt, pollAllowMultiple,
            images,
        } = req.body;

        // Sync cover image: if images array provided, set posterUrl = images[0] in locales
        let finalLocales = locales;
        if (Array.isArray(images) && images.length > 0 && locales) {
            const loc = { ...(locales as any) };
            if (loc.en) loc.en = { ...loc.en, posterUrl: images[0] };
            if (loc.fr) loc.fr = { ...loc.fr, posterUrl: images[0] };
            finalLocales = loc;
        } else if (Array.isArray(images) && images.length > 0 && !locales) {
            // images changed but locales not sent — update posterUrl in existing locales
            const loc = { ...(post.locales as any) };
            if (loc.en) loc.en = { ...loc.en, posterUrl: images[0] };
            if (loc.fr) loc.fr = { ...loc.fr, posterUrl: images[0] };
            finalLocales = loc;
        }

        // Scheduling: store as draft with publishAt set
        // Unpublish: isDraft: true clears publishAt
        const effectiveIsDraft = publishAt ? true : isDraft;
        const effectivePublishAt = isDraft === true
            ? null                                          // unpublish clears schedule
            : publishAt ? new Date(publishAt) : undefined; // schedule or leave unchanged

        // Nullable fields: undefined = leave unchanged, null = clear, value = set.
        // (zod already validated the shapes, so no NaN / Invalid Date can reach here.)
        const dateField = (v: string | null | undefined) =>
            v === undefined ? undefined : (v === null ? null : new Date(v));

        const updated = await prisma.post.update({
            where: { id: req.params.id },
            data: {
                locales:      finalLocales  ?? undefined,
                isDraft:      effectiveIsDraft ?? undefined,
                publishAt:    effectivePublishAt,
                startAt:      dateField(startAt),
                endAt:        dateField(endAt),
                locationName: locationName ?? undefined,
                address:      address      ?? undefined,
                categories:   categories   ?? undefined,
                images:       Array.isArray(images) ? images : undefined,
                capacity:     capacity === undefined ? undefined : capacity, // number | null
                freeFood:     typeof freeFood === "boolean" ? freeFood : undefined,
                recapPrivate: typeof recapPrivate === "boolean" ? recapPrivate : undefined,
                pollExpiresAt:     dateField(pollExpiresAt),
                pollAllowMultiple: pollAllowMultiple ?? undefined,
            },
        });

        // Send notifications when transitioning from draft → published
        if (post.isDraft && isDraft === false) {
            const effectiveLocales = locales ?? post.locales;
            const title = (effectiveLocales as any)?.en?.title ?? (effectiveLocales as any)?.fr?.title ?? "New post";
            notifyFollowers(post.clubId, post.type, post.club.clubName ?? "", title, post.id).catch(console.error);
        }

        // Notify RSVP'd users when a published event's key details change
        if (post.type === "EVENT" && !post.isDraft && isDraft !== false) {
            const dateChanged = startAt && new Date(startAt).toISOString() !== post.startAt?.toISOString();
            const locationChanged = locationName !== undefined && locationName !== post.locationName;
            const titleChanged = locales && (
                (locales as any)?.en?.title !== (post.locales as any)?.en?.title ||
                (locales as any)?.fr?.title !== (post.locales as any)?.fr?.title
            );

            if (dateChanged || locationChanged || titleChanged) {
                const eventTitle = (locales as any)?.en?.title ?? (post.locales as any)?.en?.title ?? "An event you RSVPed to";
                const changeDesc = [
                    dateChanged ? "date/time" : null,
                    locationChanged ? "location" : null,
                    titleChanged ? "details" : null,
                ].filter(Boolean).join(" and ");

                notifyRsvpd(post.id, eventTitle, changeDesc, post.clubId).catch(console.error);
            }
        }

        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// DELETE /posts/:id
router.delete("/:id", requireAuth, requireClub, async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.id } });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.clubId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });
        await prisma.post.delete({ where: { id: req.params.id } });
        res.json({ message: "Deleted" });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/view — record a view (one per user per post, idempotent)
router.post("/:id/view", requireAuth, requireVisiblePost, async (req, res, next) => {
    try {
        await prisma.postView.upsert({
            where: { userId_postId: { userId: req.user!.userId, postId: req.params.id } },
            create: { userId: req.user!.userId, postId: req.params.id },
            update: {},
        });
        res.status(201).json({ viewed: true });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/like
router.post("/:id/like", requireAuth, requireVisiblePost, async (req, res, next) => {
    try {
        await prisma.like.upsert({
            where: { userId_postId: { userId: req.user!.userId, postId: req.params.id } },
            create: { userId: req.user!.userId, postId: req.params.id },
            update: {},
        });
        res.status(201).json({ liked: true });
    } catch (err) {
        next(err);
    }
});

// DELETE /posts/:id/like
router.delete("/:id/like", requireAuth, async (req, res, next) => {
    try {
        await prisma.like.deleteMany({
            where: { userId: req.user!.userId, postId: req.params.id },
        });
        res.json({ liked: false });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/bookmark
router.post("/:id/bookmark", requireAuth, requireVisiblePost, async (req, res, next) => {
    try {
        await prisma.bookmark.upsert({
            where: { userId_postId: { userId: req.user!.userId, postId: req.params.id } },
            create: { userId: req.user!.userId, postId: req.params.id },
            update: {},
        });
        res.status(201).json({ bookmarked: true });
    } catch (err) {
        next(err);
    }
});

// DELETE /posts/:id/bookmark
router.delete("/:id/bookmark", requireAuth, async (req, res, next) => {
    try {
        await prisma.bookmark.deleteMany({
            where: { userId: req.user!.userId, postId: req.params.id },
        });
        res.json({ bookmarked: false });
    } catch (err) {
        next(err);
    }
});

// GET /posts/:id/comments
router.get("/:id/comments", optionalAuth, requireVisiblePost, async (req, res, next) => {
    try {
        const userSelect = {
            id: true, type: true,
            firstName: true, lastName: true, avatarUrl: true,
            clubName: true, logoUrl: true,
        };

        // Blocked users are removed from the thread in both directions.
        const viewerId = req.user?.userId;
        const blockedIds = viewerId ? await blockedUserIds(viewerId) : [];
        const notBlocked = blockedIds.length ? { userId: { notIn: blockedIds } } : {};

        const comments = await prisma.comment.findMany({
            where: { postId: req.params.id, parentId: null, hidden: false, ...notBlocked },
            include: {
                user: { select: userSelect },
                replies: {
                    where: { hidden: false, ...notBlocked },
                    include: { user: { select: userSelect } },
                    orderBy: { createdAt: "asc" },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(comments);
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/comments
router.post("/:id/comments", requireAuth, requireVisiblePost, validate(commentSchema), async (req, res, next) => {
    try {
        const { content, parentId } = req.body;
        if (!content?.trim()) {
            return res.status(400).json({ error: "Comment content required" });
        }
        let parentAuthorId: string | null = null;
        if (parentId) {
            const parent = await prisma.comment.findUnique({ where: { id: parentId } });
            if (!parent || parent.postId !== req.params.id || parent.parentId !== null) {
                return res.status(400).json({ error: "Invalid parentId" });
            }
            parentAuthorId = parent.userId;
        }
        const userSelect = {
            id: true, type: true,
            firstName: true, lastName: true, avatarUrl: true,
            clubName: true, logoUrl: true,
        };
        const comment = await prisma.comment.create({
            data: {
                userId: req.user!.userId,
                postId: req.params.id,
                content: content.trim(),
                ...(parentId ? { parentId } : {}),
            },
            include: { user: { select: userSelect }, replies: true },
        });
        res.status(201).json(comment);

        // Fire-and-forget: notify the post owner (and the parent author on a reply).
        notifyOnComment(req.params.id, req.user!.userId, comment.id, comment.content, parentAuthorId)
            .catch((e) => console.error("notifyOnComment failed", e));
    } catch (err) {
        next(err);
    }
});

// DELETE /posts/:id/comments/:commentId — club owner or comment author
router.delete("/:id/comments/:commentId", requireAuth, async (req, res, next) => {
    try {
        const { id: postId, commentId } = req.params;
        const userId = req.user!.userId;

        const comment = await prisma.comment.findUnique({
            where: { id: commentId },
            include: { post: { select: { clubId: true } } },
        });

        if (!comment || comment.postId !== postId) {
            return res.status(404).json({ error: "Comment not found" });
        }

        if (comment.userId !== userId && comment.post.clubId !== userId) {
            return res.status(403).json({ error: "Forbidden" });
        }

        await prisma.comment.delete({ where: { id: commentId } });
        res.json({ deleted: true });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/comments/:commentId/upvote — toggle the current user's like
// on a comment. Returns the new count and whether the user now likes it.
router.post("/:id/comments/:commentId/upvote", requireAuth, async (req, res, next) => {
    try {
        const { id: postId, commentId } = req.params;
        const userId = req.user!.userId;

        const comment = await prisma.comment.findUnique({
            where: { id: commentId },
            select: { id: true, postId: true },
        });
        if (!comment || comment.postId !== postId) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const existing = await prisma.commentUpvote.findUnique({
            where: { userId_commentId: { userId, commentId } },
        });

        const updated = await prisma.$transaction(async (tx) => {
            if (existing) {
                await tx.commentUpvote.delete({ where: { userId_commentId: { userId, commentId } } });
                return tx.comment.update({ where: { id: commentId }, data: { upvotes: { decrement: 1 } }, select: { upvotes: true } });
            }
            await tx.commentUpvote.create({ data: { userId, commentId } });
            return tx.comment.update({ where: { id: commentId }, data: { upvotes: { increment: 1 } }, select: { upvotes: true } });
        });

        res.json({ upvotes: Math.max(0, updated.upvotes), isUpvoted: !existing });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/vote — poll vote
router.post("/:id/vote", requireAuth, requireVisiblePost, async (req, res, next) => {
    try {
        const { optionId } = req.body;
        if (!optionId) return res.status(400).json({ error: "optionId required" });

        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            include: { pollOptions: true },
        });
        if (!post || post.type !== "POLL") return res.status(404).json({ error: "Poll not found" });

        // Poll expiry is enforced here, not just in the UI — a closed poll
        // must reject late votes regardless of client state.
        if (post.pollExpiresAt && post.pollExpiresAt.getTime() <= Date.now()) {
            return res.status(409).json({ error: "This poll has closed" });
        }

        const validOption = post.pollOptions.find((o) => o.id === optionId);
        if (!validOption) return res.status(400).json({ error: "Invalid option" });

        if (!post.pollAllowMultiple) {
            // Remove any existing votes on this poll before casting new one
            const existing = await prisma.pollVote.findMany({
                where: { userId: req.user!.userId, option: { postId: req.params.id } },
            });
            if (existing.length > 0) {
                await prisma.pollVote.deleteMany({
                    where: {
                        userId: req.user!.userId,
                        optionId: { in: existing.map((v) => v.optionId) },
                    },
                });
            }
        }

        await prisma.pollVote.upsert({
            where: { userId_optionId: { userId: req.user!.userId, optionId } },
            create: { userId: req.user!.userId, optionId },
            update: {},
        });

        res.status(201).json({ voted: true });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/rsvp
router.post("/:id/rsvp", requireAuth, requireVisiblePost, async (req, res, next) => {
    try {
        const postId = req.params.id;
        const userId = req.user!.userId;
        let outcome = "rsvped";
        let waitlistPosition: number | null = null;

        await prisma.$transaction(async (tx) => {
            const [post, existingRsvp, existingWaitlist] = await Promise.all([
                tx.post.findUnique({ where: { id: postId }, select: { capacity: true, _count: { select: { rsvps: true } } } }),
                tx.rsvp.findUnique({ where: { userId_postId: { userId, postId } } }),
                tx.waitlist.findUnique({ where: { userId_postId: { userId, postId } } }),
            ]);
            if (!post) { const e: any = new Error("Post not found"); e.status = 404; throw e; }
            if (existingRsvp) { outcome = "rsvped"; return; }
            if (existingWaitlist) {
                outcome = "waitlisted";
                waitlistPosition = await waitlistPositionOf(tx, postId, existingWaitlist.createdAt);
                return;
            }
            if (post.capacity != null && post._count.rsvps >= post.capacity) {
                const entry = await tx.waitlist.create({ data: { userId, postId } });
                outcome = "waitlisted";
                waitlistPosition = await waitlistPositionOf(tx, postId, entry.createdAt);
                return;
            }
            await tx.rsvp.create({ data: { userId, postId } });
        }, { isolationLevel: "Serializable" });

        res.status(201).json({
            rsvped: outcome === "rsvped",
            waitlisted: outcome === "waitlisted",
            ...(waitlistPosition != null ? { waitlistPosition } : {}),
        });
    } catch (err: any) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        next(err);
    }
});

// PATCH /posts/:id/pin — toggle pin (club owner only)
router.patch("/:id/pin", requireAuth, requireClub, async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.id } });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.clubId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });

        // Unpin any existing pinned post first
        if (!post.isPinned) {
            await prisma.post.updateMany({
                where: { clubId: req.user!.userId, isPinned: true },
                data: { isPinned: false },
            });
        }

        const updated = await prisma.post.update({
            where: { id: req.params.id },
            data: { isPinned: !post.isPinned },
            select: { id: true, isPinned: true },
        });
        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// DELETE /posts/:id/rsvp
router.delete("/:id/rsvp", requireAuth, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const postId = req.params.id;

        const [existingRsvp, existingWaitlist] = await Promise.all([
            prisma.rsvp.findUnique({ where: { userId_postId: { userId, postId } } }),
            prisma.waitlist.findUnique({ where: { userId_postId: { userId, postId } } }),
        ]);

        if (existingWaitlist) {
            await prisma.waitlist.delete({ where: { userId_postId: { userId, postId } } });
        } else if (existingRsvp) {
            const promotedUserId = await prisma.$transaction(async (tx) => {
                await tx.rsvp.delete({ where: { userId_postId: { userId, postId } } });
                const next = await tx.waitlist.findFirst({ where: { postId }, orderBy: { createdAt: "asc" } });
                if (!next) return null;
                await tx.rsvp.create({ data: { userId: next.userId, postId } });
                await tx.waitlist.delete({ where: { id: next.id } });
                await tx.notification.create({
                    data: {
                        userId: next.userId,
                        type: "WAITLIST_PROMOTED",
                        title: "You're in!",
                        body: "A spot opened up — you've been moved off the waitlist.",
                        metadata: { postId },
                    },
                });
                return next.userId;
            });

            // Push after the transaction commits — this is the most
            // time-sensitive notification in the app.
            if (promotedUserId) {
                const [promoted, post] = await Promise.all([
                    prisma.user.findUnique({
                        where: { id: promotedUserId },
                        select: { pushToken: true, pushNotifs: true },
                    }),
                    prisma.post.findUnique({ where: { id: postId }, select: { locales: true } }),
                ]);
                if (promoted?.pushNotifs && promoted.pushToken) {
                    const loc = (post?.locales as any) ?? {};
                    const eventTitle = loc.en?.title ?? loc.fr?.title ?? "an event";
                    sendExpoPush([{
                        to: promoted.pushToken,
                        title: "You're in!",
                        body: `A spot opened up for ${eventTitle} — you're off the waitlist.`,
                        data: { postId, postType: "EVENT" },
                        sound: "default" as const,
                    }]);
                }
            }
        }

        res.json({ rsvped: false, waitlisted: false });
    } catch (err) {
        next(err);
    }
});

// ── Check-in ──────────────────────────────────────────────────────────────────

// GET /posts/:id/checkin-qr — club only, returns QR value
router.get("/:id/checkin-qr", requireAuth, async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { clubId: true, type: true } });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.clubId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });
        if (post.type !== "EVENT") return res.status(400).json({ error: "Check-in is only available for events" });
        const token = checkinToken(req.params.id);
        res.json({ value: `uevents-checkin:${req.params.id}:${token}` });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/checkin — student submits scanned token
router.post("/:id/checkin", requireAuth, requireVisiblePost, async (req, res, next) => {
    try {
        const { token } = req.body as { token: string };
        const expected = checkinToken(req.params.id);
        if (token !== expected) return res.status(400).json({ error: "Invalid check-in token" });

        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            select: { type: true, isDraft: true, startAt: true, endAt: true },
        });
        if (!post || post.isDraft || post.type !== "EVENT") {
            return res.status(404).json({ error: "Event not found" });
        }

        // The QR token is a static HMAC of the post id, so a screenshot never
        // expires on its own. Bound check-ins to the event window (start − 30 min
        // → end + 2 h) so a leaked code can't be replayed from home. Falls back to
        // a 3 h default duration when the event has no explicit end time.
        if (post.startAt) {
            const now = Date.now();
            const opensAt = post.startAt.getTime() - 30 * 60 * 1000;
            const endBase = post.endAt?.getTime() ?? post.startAt.getTime() + 3 * 60 * 60 * 1000;
            const closesAt = endBase + 2 * 60 * 60 * 1000;
            if (now < opensAt) return res.status(403).json({ error: "Check-in isn't open yet" });
            if (now > closesAt) return res.status(403).json({ error: "Check-in has closed for this event" });
        }

        await prisma.checkIn.upsert({
            where: { postId_userId: { postId: req.params.id, userId: req.user!.userId } },
            create: { postId: req.params.id, userId: req.user!.userId },
            update: {},
        });
        res.json({ checkedIn: true });
    } catch (err) {
        next(err);
    }
});

// GET /posts/:id/checkins — club only, returns checked-in attendees
router.get("/:id/checkins", requireAuth, async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { clubId: true } });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.clubId !== req.user!.userId) return res.status(403).json({ error: "Forbidden" });

        const checkIns = await prisma.checkIn.findMany({
            where: { postId: req.params.id },
            orderBy: { checkedAt: "desc" },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, program: true, year: true } },
            },
        });

        res.json({
            count: checkIns.length,
            checkIns: checkIns.map((c) => ({
                userId: c.userId,
                checkedAt: c.checkedAt,
                name: [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || "Anonymous",
                avatarUrl: c.user.avatarUrl ?? null,
                program: c.user.program ?? null,
                year: c.user.year ?? null,
            })),
        });
    } catch (err) {
        next(err);
    }
});

// ── Post-event recaps ───────────────────────────────────────────────────────
const recapPhotoSchema = z.object({ url: z.string().url().max(500) });
const recapRatingSchema = z.object({ rating: z.number().int().min(1).max(5) });

async function isCheckedIn(userId: string, postId: string): Promise<boolean> {
    const c = await prisma.checkIn.findUnique({ where: { postId_userId: { postId, userId } } });
    return !!c;
}
function eventOver(post: { startAt: Date | null; endAt: Date | null }): boolean {
    const end = post.endAt ?? post.startAt;
    return !!end && end < new Date();
}

// GET /posts/:id/recap — gallery + average rating. Public unless recapPrivate,
// in which case only checked-in attendees (or the club) may view.
router.get("/:id/recap", optionalAuth, async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            select: { id: true, clubId: true, recapPrivate: true, hidden: true, startAt: true, endAt: true },
        });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.hidden && post.clubId !== userId) return res.status(404).json({ error: "Post not found" });

        const isOwner = userId === post.clubId;
        const attendee = userId ? await isCheckedIn(userId, post.id) : false;

        if (post.recapPrivate && !attendee && !isOwner) {
            return res.json({ visible: false, eventOver: eventOver(post) });
        }

        // Everyone sees APPROVED. The club owner sees everything (to moderate);
        // a viewer additionally sees their own submissions so they know a pending
        // photo is awaiting review.
        const photoWhere: Prisma.EventPhotoWhereInput = isOwner
            ? { postId: post.id }
            : { postId: post.id, OR: [{ status: "APPROVED" }, ...(userId ? [{ userId }] : [])] };

        const [photos, ratingAgg, myRating] = await Promise.all([
            prisma.eventPhoto.findMany({
                where: photoWhere,
                orderBy: { createdAt: "desc" },
                include: { user: { select: { id: true, firstName: true, avatarUrl: true } } },
            }),
            prisma.eventRating.aggregate({ where: { postId: post.id }, _avg: { rating: true }, _count: true }),
            userId ? prisma.eventRating.findUnique({ where: { postId_userId: { postId: post.id, userId } } }) : null,
        ]);

        const pendingPhotoCount = isOwner ? photos.filter((p) => p.status === "PENDING").length : 0;

        res.json({
            visible: true,
            eventOver: eventOver(post),
            canContribute: !!userId && attendee && eventOver(post),
            isClubOwner: isOwner,
            pendingPhotoCount,
            avgRating: ratingAgg._avg.rating ?? null,
            ratingCount: ratingAgg._count,
            myRating: myRating?.rating ?? null,
            photos: photos.map((p) => ({
                id: p.id,
                url: p.url,
                userId: p.userId,
                by: p.user.firstName ?? "Someone",
                avatarUrl: p.user.avatarUrl ?? null,
                createdAt: p.createdAt,
                status: p.status,
                canModerate: isOwner && p.status === "PENDING",
                canDelete: !!userId && (p.userId === userId || isOwner),
            })),
        });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/recap/photo — checked-in attendees only, after the event ends.
// Attendee photos are held for moderation (PENDING) and only publish once the
// club manager approves them (or an automated provider clears them). The club's
// own uploads publish immediately.
router.post("/:id/recap/photo", requireAuth, validate(recapPhotoSchema), async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true, clubId: true, startAt: true, endAt: true } });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (!eventOver(post)) return res.status(400).json({ error: "You can add photos once the event has ended." });

        const isOwner = post.clubId === userId;
        if (!isOwner && !(await isCheckedIn(userId, post.id))) {
            return res.status(403).json({ error: "Only people who attended can add photos." });
        }

        // Club's own photos auto-publish; attendee photos are screened / held.
        const status = isOwner ? "APPROVED" : await screenRecapPhoto(req.body.url);

        const photo = await prisma.eventPhoto.create({ data: { postId: post.id, userId, url: req.body.url, status } });
        res.status(201).json({ id: photo.id, url: photo.url, status: photo.status });
    } catch (err) {
        next(err);
    }
});

const recapModerationSchema = z.object({ action: z.enum(["approve", "reject"]) });

// PATCH /posts/:id/recap/photo/:photoId — club owner approves/rejects a pending photo
router.patch("/:id/recap/photo/:photoId", requireAuth, validate(recapModerationSchema), async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const photo = await prisma.eventPhoto.findUnique({
            where: { id: req.params.photoId },
            include: { post: { select: { clubId: true } } },
        });
        if (!photo || photo.postId !== req.params.id) return res.status(404).json({ error: "Photo not found" });
        if (photo.post.clubId !== userId) return res.status(403).json({ error: "Only the club can moderate recap photos." });

        const status = req.body.action === "approve" ? "APPROVED" : "REJECTED";
        await prisma.eventPhoto.update({ where: { id: photo.id }, data: { status } });
        res.json({ id: photo.id, status });
    } catch (err) {
        next(err);
    }
});

// DELETE /posts/:id/recap/photo/:photoId — uploader or club owner
router.delete("/:id/recap/photo/:photoId", requireAuth, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const photo = await prisma.eventPhoto.findUnique({
            where: { id: req.params.photoId },
            include: { post: { select: { clubId: true } } },
        });
        if (!photo || photo.postId !== req.params.id) return res.status(404).json({ error: "Photo not found" });
        if (photo.userId !== userId && photo.post.clubId !== userId) return res.status(403).json({ error: "Forbidden" });

        await prisma.eventPhoto.delete({ where: { id: photo.id } });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// POST /posts/:id/recap/rating { rating } — checked-in attendees only, after the event
router.post("/:id/recap/rating", requireAuth, validate(recapRatingSchema), async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true, startAt: true, endAt: true } });
        if (!post) return res.status(404).json({ error: "Post not found" });
        if (!eventOver(post)) return res.status(400).json({ error: "You can rate once the event has ended." });
        if (!(await isCheckedIn(userId, post.id))) return res.status(403).json({ error: "Only people who attended can rate." });

        await prisma.eventRating.upsert({
            where: { postId_userId: { postId: post.id, userId } },
            create: { postId: post.id, userId, rating: req.body.rating },
            update: { rating: req.body.rating },
        });

        const agg = await prisma.eventRating.aggregate({ where: { postId: post.id }, _avg: { rating: true }, _count: true });
        res.json({ ok: true, avgRating: agg._avg.rating ?? null, ratingCount: agg._count, myRating: req.body.rating });
    } catch (err) {
        next(err);
    }
});

export default router;
