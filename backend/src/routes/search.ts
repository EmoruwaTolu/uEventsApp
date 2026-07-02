import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /search?q=&type=clubs|events|posts
router.get("/", async (req, res, next) => {
    try {
        const q = ((req.query.q as string) ?? "").trim().toLowerCase();
        if (!q) return res.json({ clubs: [], events: [], posts: [] });

        const [clubs, recentPosts] = await Promise.all([
            prisma.user.findMany({
                where: {
                    type: "CLUB",
                    OR: [
                        { clubName:    { contains: q, mode: "insensitive" } },
                        { description: { contains: q, mode: "insensitive" } },
                        { category:    { contains: q, mode: "insensitive" } },
                    ],
                },
                select: {
                    id: true, clubName: true, category: true,
                    description: true, logoUrl: true,
                    _count: { select: { followedBy: true } },
                },
                take: 8,
            }),
            prisma.post.findMany({
                where: { isDraft: false, hidden: false },
                include: {
                    club: { select: { id: true, clubName: true } },
                },
                orderBy: { createdAt: "desc" },
                take: 200,
            }),
        ]);

        // Filter posts client-side (locales is a JSON blob)
        const matchingPosts = recentPosts.filter((p) => {
            const loc = (p.locales as any)?.en ?? Object.values((p.locales as any) ?? {})[0] ?? {};
            const haystack = `${loc.title ?? ""} ${loc.body ?? ""} ${p.locationName ?? ""}`.toLowerCase();
            return haystack.includes(q);
        });

        const events = matchingPosts
            .filter((p) => p.type === "EVENT")
            .slice(0, 6)
            .map((p) => {
                const loc = (p.locales as any)?.en ?? Object.values((p.locales as any) ?? {})[0] ?? {};
                return {
                    id: p.id,
                    title: loc.title ?? "Untitled",
                    clubName: p.club?.clubName ?? "",
                    posterUrl: loc.posterUrl ?? null,
                    startAt: p.startAt,
                    locationName: p.locationName,
                };
            });

        const posts = matchingPosts
            .filter((p) => p.type !== "EVENT")
            .slice(0, 6)
            .map((p) => {
                const loc = (p.locales as any)?.en ?? Object.values((p.locales as any) ?? {})[0] ?? {};
                return {
                    id: p.id,
                    type: p.type,
                    title: loc.title ?? "Untitled",
                    clubName: p.club?.clubName ?? "",
                    createdAt: p.createdAt,
                };
            });

        res.json({ clubs, events, posts });
    } catch (err) {
        next(err);
    }
});

export default router;
