import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthPayload {
    userId: string;
    type: "STUDENT" | "CLUB";
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
