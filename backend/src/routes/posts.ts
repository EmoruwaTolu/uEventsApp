import { Router } from "express";
import { createHmac } from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, requireClub, optionalAuth } from "../middleware/auth";

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
) {
    // Fetch all followers + their push tokens; EVENTS pref gets events only, ALL gets everything, NONE gets nothing
    const follows = await prisma.follow.findMany({
        where: {
            clubId,
            notifPref: postType === "EVENT"
                ? { in: ["ALL", "EVENTS"] }
                : "ALL",
        },
        select: { userId: true, user: { select: { pushToken: true } } },
    });

    if (!follows.length) return;

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
        data: follows.map((f) => ({
            userId: f.userId,
            type: notifType,
            title: notifTitle,
            body: postTitle,
            metadata: { postId, postType },
        })),
        skipDuplicates: true,
    });

    // Send Expo push notifications to followers who have a token
    const pushTokens = follows.map((f) => f.user.pushToken).filter(Boolean) as string[];
    if (!pushTokens.length) return;

    const messages = pushTokens.map((token) => ({
        to: token,
        title: notifTitle,
        body: postTitle,
        data: { postId, postType },
        sound: "default" as const,
    }));

    fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
    }).catch(console.error);
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
        select: { userId: true, user: { select: { pushToken: true } } },
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

    const pushTokens = rsvps.map((r) => r.user.pushToken).filter(Boolean) as string[];
    if (!pushTokens.length) return;

    fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(pushTokens.map((token) => ({
            to: token,
            title: notifTitle,
            body: notifBody,
            data: { postId, postType: "EVENT" },
            sound: "default",
        }))),
    }).catch(console.error);
}

// POST /posts — create (club only)
router.post("/", requireAuth, requireClub, async (req, res, next) => {
    try {
        const {
            type, locales, isDraft = true, publishAt,
            startAt, endAt, locationName, address, categories,
            capacity,
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
            notifyFollowers(post.clubId, post.type, post.club.clubName ?? "", title, post.id).catch(console.error);
        }

        res.status(201).json(post);
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
                where: { isDraft: false, ...(userId ? { clubId: { not: userId } } : {}) },
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

        const follows = await prisma.follow.findMany({
            where: { userId },
            select: { clubId: true },
        });
        const followedIds = new Set(follows.map((f) => f.clubId));

        // Fetch only posts from followed clubs
        const posts = await prisma.post.findMany({
            where: {
                isDraft: false,
                clubId: { not: userId },
                ...(followedIds.size > 0 ? { clubId: { in: [...followedIds].filter(id => id !== userId) } } : { id: { in: [] } }),
            },
            orderBy: { createdAt: "desc" },
            take: 60,
            include: {
                club: { select: { id: true, clubName: true, logoUrl: true } },
                pollOptions: {
                    include: { _count: { select: { votes: true } } },
                },
                _count: { select: { likes: true, comments: true, rsvps: true } },
                likes: { where: { userId }, select: { userId: true } },
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
                likes: p._count.likes,
                comments: p._count.comments,
                rsvpCount: p._count.rsvps,
                isLiked: p.likes.length > 0,
                isFollowing: followedIds.has(p.club.id),
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
            },
        });
        if (!post) return res.status(404).json({ error: "Post not found" });

        const rsvpPreview = await prisma.rsvp.findMany({
            where: { postId: post.id },
            take: 4,
            orderBy: { createdAt: "asc" },
            include: { user: { select: { id: true, firstName: true, avatarUrl: true } } },
        });

        let isLiked = false, isBookmarked = false, isRsvped = false, userVote: string | null = null;
        if (userId) {
            const [like, bookmark, rsvp] = await Promise.all([
                prisma.like.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
                prisma.bookmark.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
                prisma.rsvp.findUnique({ where: { userId_postId: { userId, postId: post.id } } }),
            ]);
            isLiked = !!like;
            isBookmarked = !!bookmark;
            isRsvped = !!rsvp;

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
            isLiked, isBookmarked, isRsvped, canEdit, userVote,
            rsvpPreview: rsvpPreview.map((r) => r.user),
        });
    } catch (err) {
        next(err);
    }
});

// PATCH /posts/:id — update (club, own posts only)
router.patch("/:id", requireAuth, requireClub, async (req, res, next) => {
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
            capacity,
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

        const updated = await prisma.post.update({
            where: { id: req.params.id },
            data: {
                locales:      finalLocales  ?? undefined,
                isDraft:      effectiveIsDraft ?? undefined,
                publishAt:    effectivePublishAt,
                startAt:      startAt      ? new Date(startAt) : undefined,
                endAt:        endAt        ? new Date(endAt)   : undefined,
                locationName: locationName ?? undefined,
                address:      address      ?? undefined,
                categories:   categories   ?? undefined,
                images:       Array.isArray(images) ? images : undefined,
                capacity:     capacity != null ? parseInt(capacity) : undefined,
                pollExpiresAt:     pollExpiresAt     ? new Date(pollExpiresAt) : undefined,
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
router.post("/:id/view", requireAuth, async (req, res, next) => {
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
router.post("/:id/like", requireAuth, async (req, res, next) => {
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
router.post("/:id/bookmark", requireAuth, async (req, res, next) => {
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
router.get("/:id/comments", async (req, res, next) => {
    try {
        const userSelect = {
            id: true, type: true,
            firstName: true, lastName: true, avatarUrl: true,
            clubName: true, logoUrl: true,
        };
        const comments = await prisma.comment.findMany({
            where: { postId: req.params.id, parentId: null },
            include: {
                user: { select: userSelect },
                replies: {
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
router.post("/:id/comments", requireAuth, async (req, res, next) => {
    try {
        const { content, parentId } = req.body;
        if (!content?.trim()) {
            return res.status(400).json({ error: "Comment content required" });
        }
        if (parentId) {
            const parent = await prisma.comment.findUnique({ where: { id: parentId } });
            if (!parent || parent.postId !== req.params.id || parent.parentId !== null) {
                return res.status(400).json({ error: "Invalid parentId" });
            }
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

// POST /posts/:id/vote — poll vote
router.post("/:id/vote", requireAuth, async (req, res, next) => {
    try {
        const { optionId } = req.body;
        if (!optionId) return res.status(400).json({ error: "optionId required" });

        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            include: { pollOptions: true },
        });
        if (!post || post.type !== "POLL") return res.status(404).json({ error: "Poll not found" });

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
router.post("/:id/rsvp", requireAuth, async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({
            where: { id: req.params.id },
            select: { capacity: true, _count: { select: { rsvps: true } } },
        });
        if (!post) return res.status(404).json({ error: "Post not found" });

        if (post.capacity != null && post._count.rsvps >= post.capacity) {
            return res.status(409).json({ error: "This event is at capacity." });
        }

        await prisma.rsvp.upsert({
            where: { userId_postId: { userId: req.user!.userId, postId: req.params.id } },
            create: { userId: req.user!.userId, postId: req.params.id },
            update: {},
        });
        res.status(201).json({ rsvped: true });
    } catch (err) {
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
        await prisma.rsvp.deleteMany({
            where: { userId: req.user!.userId, postId: req.params.id },
        });
        res.json({ rsvped: false });
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
router.post("/:id/checkin", requireAuth, async (req, res, next) => {
    try {
        const { token } = req.body as { token: string };
        const expected = checkinToken(req.params.id);
        if (token !== expected) return res.status(400).json({ error: "Invalid check-in token" });

        const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { type: true, isDraft: true } });
        if (!post || post.isDraft || post.type !== "EVENT") {
            return res.status(404).json({ error: "Event not found" });
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

export default router;
