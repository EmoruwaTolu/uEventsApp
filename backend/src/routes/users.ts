import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

function signToken(userId: string, type: string) {
    return jwt.sign({ userId, type }, process.env.JWT_SECRET!, { expiresIn: "30d" });
}

// POST /users/add-user
router.post("/add-user", async (req, res, next) => {
    try {
        const {
            firstName, lastName, email, password,
            type = "STUDENT",
            clubName, slug, category,
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(409).json({ error: "Email already registered" });

        const passwordHash = await bcrypt.hash(password, 12);
        const isClub = type === "CLUB";

        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                type: isClub ? "CLUB" : "STUDENT",
                firstName:    !isClub ? firstName    : undefined,
                lastName:     !isClub ? lastName     : undefined,
                clubName:     isClub  ? clubName     : undefined,
                slug:         isClub  ? slug         : undefined,
                category:     isClub  ? category     : undefined,
            },
        });

        const token = signToken(user.id, user.type);
        res.status(201).json({ token, user: { id: user.id, email: user.email, type: user.type } });
    } catch (err) {
        next(err);
    }
});

// POST /users/validate-user
router.post("/validate-user", async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: "Invalid credentials" });

        const token = signToken(user.id, user.type);
        res.json({ token, user: { id: user.id, email: user.email, type: user.type } });
    } catch (err) {
        next(err);
    }
});

// GET /users/me
router.get("/me", requireAuth, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.userId },
            select: {
                id: true, email: true, type: true,
                firstName: true, lastName: true, program: true, year: true, avatarUrl: true,
                clubName: true, slug: true, category: true, description: true, logoUrl: true,
                instagram: true, twitter: true, contactEmail: true,
                pushNotifs: true, emailDigest: true,
                _count: { select: { follows: true, rsvps: true } },
            },
        });
        if (!user) return res.status(401).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        next(err);
    }
});

// PATCH /users/me
router.patch("/me", requireAuth, async (req, res, next) => {
    try {
        const {
            firstName, lastName, program, year, avatarUrl,
            clubName, category, description, logoUrl, instagram, twitter, contactEmail,
            pushNotifs, emailDigest,
        } = req.body;

        const user = await prisma.user.update({
            where: { id: req.user!.userId },
            data: {
                firstName, lastName, program, year, avatarUrl,
                clubName, category, description, logoUrl, instagram, twitter, contactEmail,
                ...(pushNotifs !== undefined && { pushNotifs }),
                ...(emailDigest !== undefined && { emailDigest }),
            },
            select: {
                id: true, email: true, type: true,
                firstName: true, lastName: true, program: true, year: true, avatarUrl: true,
                clubName: true, slug: true, category: true,
            },
        });
        res.json(user);
    } catch (err) {
        next(err);
    }
});

// GET /users/me/follows — clubs the current user follows
router.get("/me/follows", requireAuth, async (req, res, next) => {
    try {
        const follows = await prisma.follow.findMany({
            where: { userId: req.user!.userId },
            include: {
                club: {
                    select: {
                        id: true, clubName: true, slug: true, category: true,
                        description: true, logoUrl: true,
                        _count: { select: { followedBy: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(follows.map((f) => ({ ...f.club, notifPref: f.notifPref })));
    } catch (err) {
        next(err);
    }
});

// GET /users/me/rsvps
router.get("/me/rsvps", requireAuth, async (req, res, next) => {
    try {
        const rsvps = await prisma.rsvp.findMany({
            where: { userId: req.user!.userId },
            include: {
                post: {
                    select: {
                        id: true, type: true, locales: true,
                        startAt: true, endAt: true, locationName: true,
                        club: { select: { id: true, clubName: true, logoUrl: true } },
                        _count: { select: { rsvps: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(rsvps.map((r) => r.post));
    } catch (err) {
        next(err);
    }
});

// GET /users/me/bookmarks
router.get("/me/bookmarks", requireAuth, async (req, res, next) => {
    try {
        const bookmarks = await prisma.bookmark.findMany({
            where: { userId: req.user!.userId },
            include: {
                post: {
                    select: {
                        id: true, type: true, locales: true, createdAt: true,
                        club: { select: { id: true, clubName: true } },
                        _count: { select: { likes: true, comments: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(bookmarks.map((b) => b.post));
    } catch (err) {
        next(err);
    }
});

// GET /users/me/activity — posts the user has liked or commented on
router.get("/me/activity", requireAuth, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const postSelect = {
            id: true, type: true, locales: true, createdAt: true,
            club: { select: { id: true, clubName: true } },
            _count: { select: { likes: true, comments: true } },
        };

        const [likes, comments] = await Promise.all([
            prisma.like.findMany({
                where: { userId },
                include: { post: { select: postSelect } },
                orderBy: { createdAt: "desc" },
                take: 25,
            }),
            prisma.comment.findMany({
                where: { userId },
                distinct: ["postId"],
                include: { post: { select: postSelect } },
                orderBy: { createdAt: "desc" },
                take: 25,
            }),
        ]);

        const toItem = (action: "like" | "comment", post: any, actionTime: Date) => {
            const loc = (post.locales as any)?.en ?? (post.locales as any)?.fr ?? {};
            return {
                id: `${post.id}_${action}`,
                action,
                clubId: post.club.id,
                clubName: post.club.clubName ?? "",
                type: post.type.toLowerCase(),
                content: loc.body ?? loc.title ?? "",
                timestamp: post.createdAt,
                actionTime,
                likes: post._count.likes,
                comments: post._count.comments,
            };
        };

        const items = [
            ...likes.map((l) => toItem("like", l.post, l.createdAt)),
            ...comments.map((c) => toItem("comment", c.post, c.createdAt)),
        ]
            .sort((a, b) => b.actionTime.getTime() - a.actionTime.getTime())
            .slice(0, 40);

        res.json(items);
    } catch (err) {
        next(err);
    }
});

// PATCH /users/me/push-token
router.patch("/me/push-token", requireAuth, async (req, res, next) => {
    try {
        const { pushToken } = req.body;
        const updated = await prisma.user.updateMany({
            where: { id: req.user!.userId },
            data: { pushToken: pushToken ?? null },
        });
        if (updated.count === 0) return res.status(404).json({ error: "User not found" });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// PATCH /users/me/password
router.patch("/me/password", requireAuth, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Both passwords required" });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters" });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
        if (!user) return res.status(404).json({ error: "User not found" });

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

        const passwordHash = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
        res.json({ message: "Password updated" });
    } catch (err) {
        next(err);
    }
});

export default router;
