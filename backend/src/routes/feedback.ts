import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { optionalAuth } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// POST /feedback — submit a bug report or feature request
router.post("/", optionalAuth, async (req, res, next) => {
    try {
        const { type, message, imageUrl, contactEmail } = req.body;

        if (!["BUG_REPORT", "FEATURE_REQUEST"].includes(type)) {
            return res.status(400).json({ error: "type must be BUG_REPORT or FEATURE_REQUEST" });
        }
        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "message is required" });
        }
        if (message.trim().length > 2000) {
            return res.status(400).json({ error: "message must be 2000 characters or fewer" });
        }

        const feedback = await prisma.feedback.create({
            data: {
                type,
                message: message.trim(),
                imageUrl: imageUrl?.trim() || null,
                contactEmail: contactEmail?.trim() || null,
                userId: req.user?.userId ?? null,
            },
        });

        res.status(201).json({ id: feedback.id });
    } catch (err) {
        next(err);
    }
});

export default router;
