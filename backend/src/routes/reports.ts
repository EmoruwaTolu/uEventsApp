import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
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

export default router;
