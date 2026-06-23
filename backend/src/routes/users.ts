import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Comma-separated list of allowed signup domains, e.g. "myuni.edu,grad.myuni.edu".
// When unset, no domain restriction is applied (dev-friendly).
const SCHOOL_EMAIL_DOMAINS = (process.env.SCHOOL_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

function emailDomainAllowed(email: string): boolean {
    if (SCHOOL_EMAIL_DOMAINS.length === 0) return true;
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return SCHOOL_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

// Creates a verification token and emails the user a deep link to verify.
// No-op (token still created) if Resend isn't configured, so dev still works.
async function sendVerificationEmail(userId: string, email: string): Promise<void> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await prisma.emailVerification.create({ data: { userId, token, expiresAt } });

    if (!resend) return;
    const verifyUrl = `uevents://verify-email?token=${token}`;
    const fromEmail = process.env.FROM_EMAIL ?? "noreply@ueventsapp.com";
    await resend.emails.send({
        from: `uEvents <${fromEmail}>`,
        to: email,
        subject: "Verify your uEvents email",
        html: `
            <p>Welcome to uEvents!</p>
            <p>Tap the button below to verify your email address and finish setting up your account.</p>
            <p><a href="${verifyUrl}" style="background:#8C0327;color:#fff;padding:12px 24px;text-decoration:none;font-weight:700;display:inline-block;">VERIFY EMAIL</a></p>
            <p>This link expires in 24 hours. If you didn't create a uEvents account, you can safely ignore this email.</p>
            <p>— The uEvents team</p>
        `,
    });
}

const registerSchema = z.object({
    email:      z.string().email().max(254),
    password:   z.string().min(8, "Password must be at least 8 characters").max(128),
    firstName:  z.string().max(60).optional(),
    lastName:   z.string().max(60).optional(),
    clubName:   z.string().max(120).optional(),
    slug:       z.string().max(60).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes").optional(),
    category:   z.string().max(80).optional(),
    type:       z.enum(["STUDENT", "CLUB"]).optional(),
    inviteCode: z.string().optional(),
});

const loginSchema = z.object({
    email:    z.string().email().max(254),
    password: z.string().min(1).max(128),
});

const forgotPasswordSchema = z.object({
    email: z.string().email().max(254),
});

const resetPasswordSchema = z.object({
    token:    z.string().min(1).max(200),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const verifyEmailSchema = z.object({
    token: z.string().min(1).max(200),
});

const patchMeSchema = z.object({
    firstName:    z.string().max(60).optional(),
    lastName:     z.string().max(60).optional(),
    program:      z.string().max(120).optional(),
    year:         z.string().max(20).optional(),
    avatarUrl:    z.string().url().max(500).optional().or(z.literal("")),
    clubName:     z.string().max(120).optional(),
    category:     z.string().max(80).optional(),
    description:  z.string().max(1000).optional(),
    logoUrl:      z.string().url().max(500).optional().or(z.literal("")),
    instagram:    z.string().max(60).optional(),
    twitter:      z.string().max(60).optional(),
    contactEmail: z.string().email().max(254).optional().or(z.literal("")),
    pushNotifs:   z.boolean().optional(),
    emailDigest:  z.boolean().optional(),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword:     z.string().min(8, "Password must be at least 8 characters").max(128),
});

const router = Router();

function signToken(userId: string, type: string, tokenVersion: number) {
    return jwt.sign({ userId, type, tokenVersion }, process.env.JWT_SECRET!, { expiresIn: "30d" });
}

// POST /users/add-user
router.post("/add-user", validate(registerSchema), async (req, res, next) => {
    try {
        const {
            firstName, lastName, email, password,
            type = "STUDENT",
            clubName, slug, category,
            inviteCode,
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        const isClub = type === "CLUB";
        if (isClub) {
            const CLUB_INVITE_CODE = process.env.CLUB_INVITE_CODE;
            if (!CLUB_INVITE_CODE || inviteCode !== CLUB_INVITE_CODE) {
                return res.status(403).json({ error: "Invalid club invite code" });
            }
        }

        // Restrict student signups to the school's email domain(s) when configured.
        // Clubs are gated by the invite code instead and may use an org domain.
        if (!isClub && !emailDomainAllowed(email)) {
            const allowed = SCHOOL_EMAIL_DOMAINS.join(", ");
            return res.status(403).json({ error: `Please sign up with your school email (${allowed}).` });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(409).json({ error: "Email already registered" });

        const passwordHash = await bcrypt.hash(password, 12);

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

        // Fire-and-forget the verification email; signup still succeeds if it fails.
        sendVerificationEmail(user.id, user.email).catch(() => {});

        const token = signToken(user.id, user.type, 0);
        res.status(201).json({ token, user: { id: user.id, email: user.email, type: user.type, emailVerified: false } });
    } catch (err) {
        next(err);
    }
});

// POST /users/validate-user
router.post("/validate-user", validate(loginSchema), async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: "Invalid credentials" });

        const token = signToken(user.id, user.type, user.tokenVersion);
        res.json({ token, user: { id: user.id, email: user.email, type: user.type, emailVerified: !!user.emailVerified } });
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
                pushNotifs: true, emailDigest: true, emailVerified: true,
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
router.patch("/me", requireAuth, validate(patchMeSchema), async (req, res, next) => {
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

// GET /users/me/topics — categories (interests) the current user follows
router.get("/me/topics", requireAuth, async (req, res, next) => {
    try {
        const rows = await prisma.interestFollow.findMany({
            where: { userId: req.user!.userId },
            select: { category: true },
            orderBy: { createdAt: "asc" },
        });
        res.json(rows.map((r) => r.category));
    } catch (err) {
        next(err);
    }
});

// POST /users/me/topics { category } — follow a topic
const topicSchema = z.object({ category: z.string().min(1).max(80) });
router.post("/me/topics", requireAuth, validate(topicSchema), async (req, res, next) => {
    try {
        const { category } = req.body as { category: string };
        await prisma.interestFollow.upsert({
            where: { userId_category: { userId: req.user!.userId, category } },
            create: { userId: req.user!.userId, category },
            update: {},
        });
        res.status(201).json({ ok: true, category });
    } catch (err) {
        next(err);
    }
});

// DELETE /users/me/topics/:category — unfollow a topic
router.delete("/me/topics/:category", requireAuth, async (req, res, next) => {
    try {
        await prisma.interestFollow.deleteMany({
            where: { userId: req.user!.userId, category: req.params.category },
        });
        res.json({ ok: true });
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

// GET /users/me/attendance — events the user has checked in to (real attendance)
router.get("/me/attendance", requireAuth, async (req, res, next) => {
    try {
        const checkIns = await prisma.checkIn.findMany({
            where: { userId: req.user!.userId },
            include: {
                post: {
                    select: {
                        id: true, locales: true, startAt: true, categories: true,
                        club: { select: { id: true, clubName: true, logoUrl: true } },
                    },
                },
            },
            orderBy: { checkedAt: "desc" },
        });

        // Current academic semester start: Winter (Jan), Spring/Summer (May), Fall (Sep).
        const now = new Date();
        const m = now.getMonth();
        const semStartMonth = m < 4 ? 0 : m < 8 ? 4 : 8;
        const semesterStart = new Date(now.getFullYear(), semStartMonth, 1);
        const semesterLabel = `${["Winter", "Spring/Summer", "Fall"][semStartMonth / 4]} ${now.getFullYear()}`;

        const events = checkIns.map((c) => {
            const loc = (c.post.locales as any) ?? {};
            return {
                id: c.post.id,
                title: loc.en?.title ?? loc.fr?.title ?? "Event",
                clubName: c.post.club?.clubName ?? "",
                clubLogo: c.post.club?.logoUrl ?? null,
                startAt: c.post.startAt,
                checkedAt: c.checkedAt,
                categories: c.post.categories ?? [],
            };
        });

        res.json({
            total: checkIns.length,
            thisSemester: checkIns.filter((c) => c.checkedAt >= semesterStart).length,
            semesterLabel,
            events,
        });
    } catch (err) {
        next(err);
    }
});

// GET /users/me/waitlist
router.get("/me/waitlist", requireAuth, async (req, res, next) => {
    try {
        const entries = await prisma.waitlist.findMany({
            where: { userId: req.user!.userId },
            select: { postId: true },
        });
        res.json(entries.map((e) => e.postId));
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
router.patch("/me/password", requireAuth, validate(changePasswordSchema), async (req, res, next) => {
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
        const updated = await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash, tokenVersion: { increment: 1 } },
            select: { tokenVersion: true, type: true },
        });
        // Return a new token so the current session survives the version bump
        const token = signToken(user.id, updated.type, updated.tokenVersion);
        res.json({ message: "Password updated", token });
    } catch (err) {
        next(err);
    }
});

// POST /users/:id/block
router.post("/:id/block", requireAuth, async (req, res, next) => {
    try {
        const blockerId = req.user!.userId;
        const blockedId = req.params.id;
        if (blockerId === blockedId) return res.status(400).json({ error: "Cannot block yourself" });

        const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
        if (!target) return res.status(404).json({ error: "User not found" });

        await prisma.blockedUser.upsert({
            where: { blockerId_blockedId: { blockerId, blockedId } },
            create: { blockerId, blockedId },
            update: {},
        });
        res.status(201).json({ blocked: true });
    } catch (err) {
        next(err);
    }
});

// DELETE /users/:id/block
router.delete("/:id/block", requireAuth, async (req, res, next) => {
    try {
        const blockerId = req.user!.userId;
        const blockedId = req.params.id;
        await prisma.blockedUser.deleteMany({ where: { blockerId, blockedId } });
        res.json({ blocked: false });
    } catch (err) {
        next(err);
    }
});

// GET /users/me/blocks — list of user IDs the current user has blocked
router.get("/me/blocks", requireAuth, async (req, res, next) => {
    try {
        const blocks = await prisma.blockedUser.findMany({
            where: { blockerId: req.user!.userId },
            select: { blockedId: true },
        });
        res.json(blocks.map((b) => b.blockedId));
    } catch (err) {
        next(err);
    }
});

// POST /users/forgot-password
router.post("/forgot-password", validate(forgotPasswordSchema), async (req, res, next) => {
    try {
        const { email } = req.body as { email: string };
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

        // Always respond 200 to prevent email enumeration
        if (user) {
            const token = crypto.randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            await prisma.passwordReset.create({ data: { userId: user.id, token, expiresAt } });

            const resetUrl = `uevents://reset-password?token=${token}`;
            const fromEmail = process.env.FROM_EMAIL ?? "noreply@ueventsapp.com";

            if (resend) {
                await resend.emails.send({
                    from: `uEvents <${fromEmail}>`,
                    to: email,
                    subject: "Reset your uEvents password",
                    html: `
                        <p>Hi,</p>
                        <p>We received a request to reset your uEvents password. Tap the button below to choose a new one.</p>
                        <p><a href="${resetUrl}" style="background:#8C0327;color:#fff;padding:12px 24px;text-decoration:none;font-weight:700;display:inline-block;">RESET PASSWORD</a></p>
                        <p>This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>
                        <p>— The uEvents team</p>
                    `,
                });
            }
        }

        res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (err) {
        next(err);
    }
});

// POST /users/reset-password
router.post("/reset-password", validate(resetPasswordSchema), async (req, res, next) => {
    try {
        const { token, password } = req.body as { token: string; password: string };

        const record = await prisma.passwordReset.findUnique({ where: { token } });
        if (!record || record.usedAt || record.expiresAt < new Date()) {
            return res.status(400).json({ error: "This reset link is invalid or has expired." });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await prisma.$transaction([
            prisma.user.update({
                where: { id: record.userId },
                data: { passwordHash, tokenVersion: { increment: 1 } },
            }),
            prisma.passwordReset.update({
                where: { id: record.id },
                data: { usedAt: new Date() },
            }),
        ]);

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// POST /users/verify-email — confirm an email-verification token
router.post("/verify-email", validate(verifyEmailSchema), async (req, res, next) => {
    try {
        const { token } = req.body as { token: string };
        const record = await prisma.emailVerification.findUnique({ where: { token } });
        if (!record || record.usedAt || record.expiresAt < new Date()) {
            return res.status(400).json({ error: "This verification link is invalid or has expired." });
        }

        await prisma.$transaction([
            prisma.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } }),
            prisma.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
        ]);

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// POST /users/resend-verification — re-send the verification email (auth required)
router.post("/resend-verification", requireAuth, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.userId },
            select: { id: true, email: true, emailVerified: true },
        });
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.emailVerified) return res.json({ message: "Email already verified." });

        // Invalidate any outstanding tokens before issuing a fresh one
        await prisma.emailVerification.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
        });
        await sendVerificationEmail(user.id, user.email);

        res.json({ message: "Verification email sent." });
    } catch (err) {
        next(err);
    }
});

// DELETE /users/me
router.delete("/me", requireAuth, async (req, res, next) => {
    try {
        const userId = req.user!.userId;

        await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { id: userId }, select: { type: true } });
            if (!user) { const e: any = new Error("User not found"); e.status = 404; throw e; }

            if (user.type === "CLUB") {
                // Delete all posts the club owns (cascades to likes/comments/rsvps/bookmarks/views/checkIns)
                await tx.post.deleteMany({ where: { clubId: userId } });
                // Delete all follows of this club
                await tx.follow.deleteMany({ where: { clubId: userId } });
            }

            // Remove student engagement data
            await tx.like.deleteMany({ where: { userId } });
            await tx.bookmark.deleteMany({ where: { userId } });
            await tx.rsvp.deleteMany({ where: { userId } });
            await tx.follow.deleteMany({ where: { userId } });
            await tx.checkIn.deleteMany({ where: { userId } });
            await tx.notification.deleteMany({ where: { userId } });
            await tx.feedback.updateMany({ where: { userId }, data: { userId: null } });
            await tx.blockedUser.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
            await tx.report.deleteMany({ where: { reporterId: userId } });

            // Comments: set userId to null rather than delete to preserve thread structure
            // — requires nullable userId on Comment, which it already is not. Delete instead.
            await tx.comment.deleteMany({ where: { userId } });

            await tx.user.delete({ where: { id: userId } });
        });

        res.json({ ok: true });
    } catch (err: any) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        next(err);
    }
});

export default router;
