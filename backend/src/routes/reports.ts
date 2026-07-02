import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

const reportSchema = z.object({
    reason: z.string().min(1, "Reason is required").max(500).trim(),
});

// POST /reports/posts/:id — report a post
router.post("/posts/:id", requireAuth, validate(reportSchema), async (req, res, next) => {
    try {
        const post = await prisma.post.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!post) return res.status(404).json({ error: "Post not found" });

        await prisma.report.create({
            data: { reporterId: req.user!.userId, targetType: "POST", targetId: req.params.id, reason: req.body.reason },
        });
        res.status(201).json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// POST /reports/comments/:id — report a comment
router.post("/comments/:id", requireAuth, validate(reportSchema), async (req, res, next) => {
    try {
        const comment = await prisma.comment.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        await prisma.report.create({
            data: { reporterId: req.user!.userId, targetType: "COMMENT", targetId: req.params.id, reason: req.body.reason },
        });
        res.status(201).json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// POST /reports/users/:id — report a user
router.post("/users/:id", requireAuth, validate(reportSchema), async (req, res, next) => {
    try {
        if (req.params.id === req.user!.userId) return res.status(400).json({ error: "Cannot report yourself" });

        const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!target) return res.status(404).json({ error: "User not found" });

        await prisma.report.create({
            data: { reporterId: req.user!.userId, targetType: "USER", targetId: req.params.id, reason: req.body.reason },
        });
        res.status(201).json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ── Admin review surface ────────────────────────────────────────────────────

// Pull a human-readable title out of a post's locales JSON.
function postTitle(locales: unknown): string {
    const l = (locales as any) ?? {};
    const loc = l.en ?? l.fr ?? Object.values(l)[0] ?? {};
    return (loc as any)?.title ?? "Untitled";
}

// GET /reports — admin: list reports, grouped by target, newest first.
// Query: ?status=open (default) | resolved | all
router.get("/", requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const status = (req.query.status as string) ?? "open";
        const where: Prisma.ReportWhereInput =
            status === "resolved" ? { resolvedAt: { not: null } }
            : status === "all"    ? {}
            : { resolvedAt: null };

        const reports = await prisma.report.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 200,
            include: { reporter: { select: { id: true, firstName: true, lastName: true, clubName: true, type: true } } },
        });

        // Enrich each report with a preview of the reported target so the
        // reviewer can act without extra round-trips. Targets are fetched in
        // bulk per type to keep this to a few queries.
        const postIds    = reports.filter((r) => r.targetType === "POST").map((r) => r.targetId);
        const commentIds = reports.filter((r) => r.targetType === "COMMENT").map((r) => r.targetId);
        const userIds    = reports.filter((r) => r.targetType === "USER").map((r) => r.targetId);

        const [posts, comments, users] = await Promise.all([
            postIds.length
                ? prisma.post.findMany({
                      where: { id: { in: postIds } },
                      select: { id: true, locales: true, hidden: true, club: { select: { id: true, clubName: true } } },
                  })
                : Promise.resolve([]),
            commentIds.length
                ? prisma.comment.findMany({
                      where: { id: { in: commentIds } },
                      select: { id: true, content: true, hidden: true, postId: true, user: { select: { id: true, firstName: true, lastName: true } } },
                  })
                : Promise.resolve([]),
            userIds.length
                ? prisma.user.findMany({
                      where: { id: { in: userIds } },
                      select: { id: true, firstName: true, lastName: true, clubName: true, type: true },
                  })
                : Promise.resolve([]),
        ]);

        const postMap    = new Map(posts.map((p) => [p.id, p] as const));
        const commentMap = new Map(comments.map((c) => [c.id, c] as const));
        const userMap    = new Map(users.map((u) => [u.id, u] as const));

        const enriched = reports.map((r) => {
            let target: any = null;
            let exists = false;
            if (r.targetType === "POST") {
                const p = postMap.get(r.targetId);
                if (p) { exists = true; target = { title: postTitle(p.locales), clubName: p.club.clubName, hidden: p.hidden }; }
            } else if (r.targetType === "COMMENT") {
                const c = commentMap.get(r.targetId);
                if (c) { exists = true; target = { content: c.content, postId: c.postId, author: `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.trim(), hidden: c.hidden }; }
            } else {
                const u = userMap.get(r.targetId);
                if (u) { exists = true; target = { name: u.clubName ?? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(), type: u.type }; }
            }
            return {
                id: r.id,
                targetType: r.targetType,
                targetId: r.targetId,
                reason: r.reason,
                createdAt: r.createdAt,
                resolvedAt: r.resolvedAt,
                resolution: r.resolution,
                reporter: r.reporter,
                targetExists: exists,
                target,
            };
        });

        res.json(enriched);
    } catch (err) {
        next(err);
    }
});

const actionSchema = z.object({
    action: z.enum(["hide", "delete", "dismiss"]),
});

// PATCH /reports/:id — admin: act on a report's target.
//   hide    — soft-hide the post/comment (excluded from public feeds)
//   delete  — permanently delete the post/comment
//   dismiss — no action on the target; just close the report(s)
// All open reports pointing at the same target are resolved together.
router.patch("/:id", requireAuth, requireAdmin, validate(actionSchema), async (req, res, next) => {
    try {
        const { action } = req.body as { action: "hide" | "delete" | "dismiss" };
        const report = await prisma.report.findUnique({ where: { id: req.params.id } });
        if (!report) return res.status(404).json({ error: "Report not found" });

        if ((action === "hide" || action === "delete") && report.targetType === "USER") {
            return res.status(400).json({ error: "hide/delete apply to posts and comments only; use dismiss for user reports" });
        }

        // Apply the moderation action to the target.
        if (action === "hide") {
            if (report.targetType === "POST") {
                await prisma.post.updateMany({ where: { id: report.targetId }, data: { hidden: true } });
            } else {
                await prisma.comment.updateMany({ where: { id: report.targetId }, data: { hidden: true } });
            }
        } else if (action === "delete") {
            if (report.targetType === "POST") {
                await prisma.post.deleteMany({ where: { id: report.targetId } });
            } else {
                await prisma.comment.deleteMany({ where: { id: report.targetId } });
            }
        }

        // Resolve every open report for this same target.
        await prisma.report.updateMany({
            where: { targetType: report.targetType, targetId: report.targetId, resolvedAt: null },
            data: { resolvedAt: new Date(), resolvedById: req.user!.userId, resolution: action },
        });

        res.json({ ok: true, action, targetType: report.targetType, targetId: report.targetId });
    } catch (err) {
        next(err);
    }
});

export default router;
