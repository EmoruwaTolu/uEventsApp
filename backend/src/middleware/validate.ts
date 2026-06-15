import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validate(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const first = (result.error as ZodError).issues[0];
            const field = first.path.join(".");
            const msg = field ? `${field}: ${first.message}` : first.message;
            return res.status(400).json({ error: msg });
        }
        req.body = result.data;
        next();
    };
}
