import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /notifications
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user!.userId },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        res.json(notifications);
    } catch (err) {
        next(err);
    }
});

// GET /notifications/unread-count
router.get("/unread-count", requireAuth, async (req, res, next) => {
    try {
        const count = await prisma.notification.count({
            where: { userId: req.user!.userId, isRead: false },
        });
        res.json({ count });
    } catch (err) {
        next(err);
    }
});

// PATCH /notifications/read-all  (must be before /:id)
router.patch("/read-all", requireAuth, async (req, res, next) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user!.userId, isRead: false },
            data: { isRead: true },
        });
        res.json({ message: "All marked as read" });
    } catch (err) {
        next(err);
    }
});

// PATCH /notifications/:id/read
router.patch("/:id/read", requireAuth, async (req, res, next) => {
    try {
        const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
        if (!notif || notif.userId !== req.user!.userId) {
            return res.status(404).json({ error: "Notification not found" });
        }
        await prisma.notification.update({
            where: { id: req.params.id },
            data: { isRead: true },
        });
        res.json({ message: "Marked as read" });
    } catch (err) {
        next(err);
    }
});

export default router;
