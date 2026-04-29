import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
    userId: string;
    type: "STUDENT" | "CLUB";
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
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
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
