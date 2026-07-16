import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

// ── Admin: club approval queue ──────────────────────────────────────────────

// GET /clubs/pending — clubs awaiting approval (admin only)
router.get("/pending", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
        const clubs = await prisma.user.findMany({
            where: { type: "CLUB", clubStatus: "PENDING" },
            orderBy: { createdAt: "asc" },
            select: {
                id: true, email: true, clubName: true, slug: true, category: true,
                description: true, contactEmail: true, createdAt: true,
            },
        });
        res.json(clubs);
    } catch (err) {
        next(err);
    }
});

const approvalSchema = z.object({
    action: z.enum(["approve", "reject"]),
    reason: z.string().max(500).optional(),
});

// PATCH /clubs/:id/approval — approve or reject a pending club (admin only)
router.patch("/:id/approval", requireAuth, requireAdmin, validate(approvalSchema), async (req, res, next) => {
    try {
        const club = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, type: true, clubStatus: true },
        });
        if (!club || club.type !== "CLUB") return res.status(404).json({ error: "Club not found" });

        const approve = req.body.action === "approve";
        const updated = await prisma.user.update({
            where: { id: club.id },
            data: {
                clubStatus: approve ? "APPROVED" : "REJECTED",
                clubRejectionReason: approve ? null : (req.body.reason ?? null),
            },
            select: { id: true, clubStatus: true, clubRejectionReason: true },
        });

        // Let the club know the outcome.
        await prisma.notification.create({
            data: {
                userId: club.id,
                type: approve ? "FOLLOW" : "FOLLOW", // reuse a generic type; no dedicated enum needed
                title: approve ? "Your club was approved" : "Club application update",
                body: approve
                    ? "You can now post events and announcements."
                    : `Your club application wasn't approved.${req.body.reason ? ` Reason: ${req.body.reason}` : ""}`,
                metadata: { kind: "CLUB_APPROVAL", clubStatus: updated.clubStatus },
            },
        }).catch(() => {});

        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// GET /clubs
router.get("/", optionalAuth, async (req, res, next) => {
    try {
        const { search, category, limit = "20", offset = "0" } = req.query;
        const callerId = (req as any).user?.userId;

        const clubs = await prisma.user.findMany({
            where: {
                type: "CLUB",
                ...(callerId ? { id: { not: callerId } } : {}),
                ...(category ? { category: category as string } : {}),
                ...(search ? {
                    OR: [
                        { clubName: { contains: search as string, mode: "insensitive" } },
                        { description: { contains: search as string, mode: "insensitive" } },
                    ],
                } : {}),
            },
            select: {
                id: true, clubName: true, clubNameFr: true, slug: true, category: true,
                description: true, descriptionFr: true, logoUrl: true,
                _count: { select: { followedBy: true, posts: true } },
            },
            orderBy: { followedBy: { _count: "desc" } },
            take: parseInt(limit as string),
            skip: parseInt(offset as string),
        });

        res.json(clubs);
    } catch (err) {
        next(err);
    }
});

// GET /clubs/:id
router.get("/:id", async (req, res, next) => {
    try {
        const club = await prisma.user.findFirst({
            where: { id: req.params.id, type: "CLUB" },
            select: {
                id: true, clubName: true, clubNameFr: true, slug: true, category: true,
                description: true, descriptionFr: true, logoUrl: true,
                instagram: true, twitter: true, contactEmail: true,
                _count: { select: { followedBy: true, posts: true } },
            },
        });
        if (!club) return res.status(404).json({ error: "Club not found" });
        res.json(club);
    } catch (err) {
        next(err);
    }
});

// GET /clubs/:id/pinned — single pinned post for a club
router.get("/:id/pinned", optionalAuth, async (req, res, next) => {
    try {
        const post = await prisma.post.findFirst({
            where: { clubId: req.params.id, isPinned: true, isDraft: false, hidden: false },
            include: {
                pollOptions: { include: { _count: { select: { votes: true } } } },
                _count: { select: { likes: true, comments: true, rsvps: true } },
            },
        });
        res.json(post ?? null);
    } catch (err) {
        next(err);
    }
});

// GET /clubs/:id/posts
router.get("/:id/posts", optionalAuth, async (req, res, next) => {
    try {
        const userId = (req as any).user?.userId as string | undefined;
        const { type, limit = "20", offset = "0" } = req.query;

        const posts = await prisma.post.findMany({
            where: {
                clubId: req.params.id,
                isDraft: false,
                hidden: false,
                ...(type ? { type: type as any } : {}),
            },
            include: {
                pollOptions: { include: { _count: { select: { votes: true } } } },
                _count: { select: { likes: true, comments: true, rsvps: true } },
            },
            orderBy: { createdAt: "desc" },
            take: parseInt(limit as string),
            skip: parseInt(offset as string),
        });

        // Attach userVote for poll posts when authenticated
        let voteMap: Record<string, string> = {};
        if (userId) {
            const pollPostIds = posts.filter((p) => p.type === "POLL").map((p) => p.id);
            if (pollPostIds.length) {
                const votes = await prisma.pollVote.findMany({
                    where: { userId, option: { postId: { in: pollPostIds } } },
                    select: { optionId: true, option: { select: { postId: true } } },
                });
                for (const v of votes) voteMap[v.option.postId] = v.optionId;
            }
        }

        res.json(posts.map((p) => ({ ...p, userVote: voteMap[p.id] ?? null })));
    } catch (err) {
        next(err);
    }
});

// GET /clubs/:id/followers — followers list (club owner only)
router.get("/:id/followers", requireAuth, async (req, res, next) => {
    try {
        if (req.user!.userId !== req.params.id) {
            return res.status(403).json({ error: "Forbidden" });
        }
        const { limit = "50", offset = "0" } = req.query;
        const follows = await prisma.follow.findMany({
            where: { clubId: req.params.id },
            orderBy: { createdAt: "desc" },
            take: parseInt(limit as string),
            skip: parseInt(offset as string),
            include: {
                user: {
                    select: {
                        id: true, firstName: true, lastName: true,
                        avatarUrl: true, program: true, year: true,
                    },
                },
            },
        });
        res.json(follows.map((f) => ({
            userId: f.userId,
            followedAt: f.createdAt,
            notifPref: f.notifPref,
            name: [f.user.firstName, f.user.lastName].filter(Boolean).join(" ") || "Anonymous",
            avatarUrl: f.user.avatarUrl ?? null,
            program: f.user.program ?? null,
            year: f.user.year ?? null,
        })));
    } catch (err) {
        next(err);
    }
});

// GET /clubs/:id/follower-growth — weekly follower counts (club owner only)
router.get("/:id/follower-growth", requireAuth, async (req, res, next) => {
    try {
        if (req.user!.userId !== req.params.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        const follows = await prisma.follow.findMany({
            where: { clubId: req.params.id },
            select: { createdAt: true },
            orderBy: { createdAt: "asc" },
        });

        if (!follows.length) return res.json([]);

        // Build weekly buckets for the last 8 weeks
        const now = new Date();
        const weeks: { label: string; start: Date; end: Date }[] = [];
        for (let i = 7; i >= 0; i--) {
            const end = new Date(now);
            end.setDate(now.getDate() - i * 7);
            const start = new Date(end);
            start.setDate(end.getDate() - 7);
            const label = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            weeks.push({ label, start, end });
        }

        let cumulative = 0;
        // count all follows before first bucket
        cumulative = follows.filter((f) => f.createdAt < weeks[0].start).length;

        const result = weeks.map(({ label, start, end }) => {
            const newThisWeek = follows.filter((f) => f.createdAt >= start && f.createdAt < end).length;
            cumulative += newThisWeek;
            return { label, newFollowers: newThisWeek, total: cumulative };
        });

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// POST /clubs/:id/follow
router.post("/:id/follow", requireAuth, async (req, res, next) => {
    try {
        if (req.user!.userId === req.params.id) {
            return res.status(400).json({ error: "You cannot follow yourself" });
        }
        const follow = await prisma.follow.upsert({
            where: { userId_clubId: { userId: req.user!.userId, clubId: req.params.id } },
            create: { userId: req.user!.userId, clubId: req.params.id },
            update: {},
        });
        res.status(201).json(follow);
    } catch (err) {
        next(err);
    }
});

// DELETE /clubs/:id/follow
router.delete("/:id/follow", requireAuth, async (req, res, next) => {
    try {
        await prisma.follow.delete({
            where: { userId_clubId: { userId: req.user!.userId, clubId: req.params.id } },
        });
        res.json({ message: "Unfollowed" });
    } catch (err) {
        next(err);
    }
});

// PATCH /clubs/:id/follow/notif-pref
router.patch("/:id/follow/notif-pref", requireAuth, async (req, res, next) => {
    try {
        const { notifPref } = req.body;
        if (!["ALL", "EVENTS", "NONE"].includes(notifPref)) {
            return res.status(400).json({ error: "notifPref must be ALL, EVENTS, or NONE" });
        }
        const follow = await prisma.follow.update({
            where: { userId_clubId: { userId: req.user!.userId, clubId: req.params.id } },
            data: { notifPref },
        });
        res.json(follow);
    } catch (err) {
        next(err);
    }
});

export default router;
