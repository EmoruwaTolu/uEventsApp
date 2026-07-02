import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthPayload {
    userId: string;
    type: "STUDENT" | "CLUB" | "ADMIN";
    tokenVersion: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = header.slice(7);
    let payload: AuthPayload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Verify tokenVersion to support revocation on password change
    prisma.user
        .findUnique({ where: { id: payload.userId }, select: { tokenVersion: true } })
        .then((user) => {
            if (!user) return res.status(401).json({ error: "User not found" });
            if (user.tokenVersion !== (payload.tokenVersion ?? 0)) {
                return res.status(401).json({ error: "Token has been revoked. Please sign in again." });
            }
            req.user = payload;
            next();
        })
        .catch(next);
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
        const token = header.slice(7);
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
        } catch { /* ignore invalid tokens */ }
    }
    next();
}

export function requireClub(req: Request, res: Response, next: NextFunction) {
    if (req.user?.type !== "CLUB") {
        return res.status(403).json({ error: "Club account required" });
    }
    next();
}

// Publishing guard for clubs: must be an approved club. Self-signed-up clubs
// start PENDING and can set up their profile but not publish until an admin
// approves them. Checks the DB since approval can change after the token issues.
export function requireApprovedClub(req: Request, res: Response, next: NextFunction) {
    if (req.user?.type !== "CLUB") {
        return res.status(403).json({ error: "Club account required" });
    }
    prisma.user
        .findUnique({ where: { id: req.user.userId }, select: { clubStatus: true } })
        .then((user) => {
            if (user?.clubStatus !== "APPROVED") {
                return res.status(403).json({
                    error: "Your club is pending approval. You'll be able to post once an admin approves your account.",
                    clubStatus: user?.clubStatus ?? "PENDING",
                });
            }
            next();
        })
        .catch(next);
}

// Admin guard. Re-checks the user's type against the DB (not just the token
// claim) since admin is a privileged role and tokens are long-lived (30d).
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    prisma.user
        .findUnique({ where: { id: req.user.userId }, select: { type: true } })
        .then((user) => {
            if (user?.type !== "ADMIN") {
                return res.status(403).json({ error: "Admin access required" });
            }
            next();
        })
        .catch(next);
}
