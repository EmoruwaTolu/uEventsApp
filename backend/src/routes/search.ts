import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const router = Router();

type PostRow = {
    id: string;
    type: string;
    startAt: Date | null;
    locationName: string | null;
    createdAt: Date;
    locales: any;
    clubName: string | null;
};

// Pull the best display locale for a result (prefer en, then fr, then whatever
// exists) — the search itself matches across every locale.
function pickLoc(locales: any): { title?: string; body?: string; posterUrl?: string } {
    return locales?.en ?? locales?.fr ?? Object.values(locales ?? {})[0] ?? {};
}

// GET /search?q=&type=clubs|events|posts
router.get("/", async (req, res, next) => {
    try {
        const raw = ((req.query.q as string) ?? "").trim();
        if (!raw) return res.json({ clubs: [], events: [], posts: [] });

        // Build a prefix tsquery: split into letter/number terms (unicode-aware so
        // accented French words survive), match each as a prefix so "hack" finds
        // "hackathon", AND them together. Terms are alphanumeric only, so tsquery
        // operator characters can never reach to_tsquery.
        const terms = raw.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        if (terms.length === 0) return res.json({ clubs: [], events: [], posts: [] });
        const tsquery = terms.map((t) => `${t}:*`).join(" & ");

        // Full-text vector over both locales' title/body plus the location. Computed
        // per row (Postgres 'simple' config: no stemming/stopwords, so it works for
        // en and fr alike). No 200-row cap — every non-draft, non-hidden post is
        // searchable. Perf follow-up: a STORED generated tsvector column + GIN index.
        const fts = Prisma.sql`
            to_tsvector('simple',
                coalesce(p.locales->'en'->>'title', '') || ' ' ||
                coalesce(p.locales->'en'->>'body',  '') || ' ' ||
                coalesce(p.locales->'fr'->>'title', '') || ' ' ||
                coalesce(p.locales->'fr'->>'body',  '') || ' ' ||
                coalesce(p."locationName", '')
            )`;

        const eventQuery = Prisma.sql`
            SELECT p.id, p.type::text AS type, p."startAt", p."locationName", p."createdAt",
                   p.locales, c."clubName" AS "clubName"
            FROM "Post" p
            JOIN "User" c ON c.id = p."clubId"
            WHERE p."isDraft" = false AND p.hidden = false AND p.type = 'EVENT'
              AND ${fts} @@ to_tsquery('simple', ${tsquery})
            ORDER BY ts_rank(${fts}, to_tsquery('simple', ${tsquery})) DESC, p."createdAt" DESC
            LIMIT 6`;

        const postQuery = Prisma.sql`
            SELECT p.id, p.type::text AS type, p."startAt", p."locationName", p."createdAt",
                   p.locales, c."clubName" AS "clubName"
            FROM "Post" p
            JOIN "User" c ON c.id = p."clubId"
            WHERE p."isDraft" = false AND p.hidden = false AND p.type <> 'EVENT'
              AND ${fts} @@ to_tsquery('simple', ${tsquery})
            ORDER BY ts_rank(${fts}, to_tsquery('simple', ${tsquery})) DESC, p."createdAt" DESC
            LIMIT 6`;

        const [clubs, eventRows, postRows] = await Promise.all([
            prisma.user.findMany({
                where: {
                    type: "CLUB",
                    OR: [
                        { clubName:    { contains: raw, mode: "insensitive" } },
                        { description: { contains: raw, mode: "insensitive" } },
                        { category:    { contains: raw, mode: "insensitive" } },
                    ],
                },
                select: {
                    id: true, clubName: true, category: true,
                    description: true, logoUrl: true,
                    _count: { select: { followedBy: true } },
                },
                take: 8,
            }),
            prisma.$queryRaw<PostRow[]>(eventQuery),
            prisma.$queryRaw<PostRow[]>(postQuery),
        ]);

        const events = eventRows.map((p) => {
            const loc = pickLoc(p.locales);
            return {
                id: p.id,
                title: loc.title ?? "Untitled",
                clubName: p.clubName ?? "",
                posterUrl: loc.posterUrl ?? null,
                startAt: p.startAt,
                locationName: p.locationName,
            };
        });

        const posts = postRows.map((p) => {
            const loc = pickLoc(p.locales);
            return {
                id: p.id,
                type: p.type,
                title: loc.title ?? "Untitled",
                clubName: p.clubName ?? "",
                createdAt: p.createdAt,
            };
        });

        res.json({ clubs, events, posts });
    } catch (err) {
        next(err);
    }
});

export default router;
