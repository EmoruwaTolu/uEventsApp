import { Request, Response, NextFunction } from "express";

export function errorHandler(
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    const status = err.status ?? 500;
    // Always log the real error server-side.
    console.error(err);
    // 4xx errors carry intentional, client-safe messages. For 5xx, never echo the
    // raw message — Prisma and other internals would leak schema/query details.
    const message = status >= 500
        ? "Internal server error"
        : (err.message ?? "Request failed");
    res.status(status).json({ error: message });
}
