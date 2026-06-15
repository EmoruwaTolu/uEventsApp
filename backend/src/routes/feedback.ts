import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

const feedbackSchema = z.object({
    type:         z.enum(["BUG_REPORT", "FEATURE_REQUEST"]),
    message:      z.string().min(1, "message is required").max(2000, "message must be 2000 characters or fewer").trim(),
    imageUrl:     z.string().url().max(500).optional().or(z.literal("")).or(z.null()),
    contactEmail: z.string().email().max(254).optional().or(z.literal("")).or(z.null()),
});

// POST /feedback — submit a bug report or feature request
router.post("/", optionalAuth, validate(feedbackSchema), async (req, res, next) => {
    try {
        const { type, message, imageUrl, contactEmail } = req.body;

        const feedback = await prisma.feedback.create({
            data: {
                type,
                message,
                imageUrl:     imageUrl     || null,
                contactEmail: contactEmail || null,
                userId: req.user?.userId ?? null,
            },
        });

        res.status(201).json({ id: feedback.id });
    } catch (err) {
        next(err);
    }
});

export default router;
