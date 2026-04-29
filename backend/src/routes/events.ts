import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /events — list published events, optionally filtered by date or club
router.get("/", async (req, res, next) => {
    try {
        const { date, from, to, clubId, limit = "100", offset = "0", upcoming, popular } = req.query;
        const where: any = { type: "EVENT", isDraft: false };

        if (date) {
            const [y, m, d] = (date as string).slice(0, 10).split("-").map(Number);
            const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
            const end   = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
            where.startAt = { gte: start, lte: end };
        } else if (from || to) {
            const rangeFilter: any = {};
            if (from) {
                const [y, m, d] = (from as string).slice(0, 10).split("-").map(Number);
                rangeFilter.gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
            }
            if (to) {
                const [y, m, d] = (to as string).slice(0, 10).split("-").map(Number);
                rangeFilter.lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
            }
            where.startAt = rangeFilter;
        } else if (upcoming || popular) {
            where.startAt = { gte: new Date() };
        }

        if (clubId) where.clubId = clubId as string;

        const events = await prisma.post.findMany({
            where,
            include: {
                club: { select: { id: true, clubName: true, slug: true, logoUrl: true, category: true } },
                _count: { select: { rsvps: true, likes: true, comments: true } },
            },
            orderBy: popular ? { rsvps: { _count: "desc" } } : { startAt: "asc" },
            take: parseInt(limit as string),
            skip: parseInt(offset as string),
        });

        res.json(events);
    } catch (err) {
        next(err);
    }
});

// GET /events/:id
router.get("/:id", requireAuth, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const event = await prisma.post.findUnique({
            where: { id: req.params.id },
            include: {
                club: { select: { id: true, clubName: true, slug: true, logoUrl: true, category: true } },
                _count: { select: { rsvps: true } },
                rsvps:     { where: { userId }, select: { userId: true } },
                bookmarks: { where: { userId }, select: { userId: true } },
            },
        });
        if (!event || event.type !== "EVENT") return res.status(404).json({ error: "Event not found" });

        // Fetch first 5 attendees for the avatar stack
        const attendees = await prisma.rsvp.findMany({
            where: { postId: req.params.id },
            take: 5,
            include: { user: { select: { id: true, firstName: true, avatarUrl: true } } },
        });

        res.json({
            ...event,
            isRsvped: event.rsvps.length > 0,
            isBookmarked: event.bookmarks.length > 0,
            rsvpPreview: attendees.map((r) => r.user),
        });
    } catch (err) { next(err); }
});

// POST /events/:id/rsvp
router.post("/:id/rsvp", requireAuth, async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.id } });
        if (!post || post.type !== "EVENT") {
            return res.status(404).json({ error: "Event not found" });
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

// DELETE /events/:id/rsvp
router.delete("/:id/rsvp", requireAuth, async (req, res, next) => {
    try {
        await prisma.rsvp.delete({
            where: { userId_postId: { userId: req.user!.userId, postId: req.params.id } },
        });
        res.json({ rsvped: false });
    } catch (err) {
        next(err);
    }
});

export default router;
