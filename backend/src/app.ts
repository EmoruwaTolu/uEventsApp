import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/errors";
import usersRouter        from "./routes/users";
import clubsRouter        from "./routes/clubs";
import postsRouter        from "./routes/posts";
import eventsRouter       from "./routes/events";
import searchRouter       from "./routes/search";
import notificationsRouter from "./routes/notifications";
import uploadsRouter      from "./routes/uploads";
import feedbackRouter     from "./routes/feedback";
import reportsRouter      from "./routes/reports";
import shareRouter        from "./routes/share";
import calendarRouter     from "./routes/calendar";
import legalRouter        from "./routes/legal";

const app = express();

// Render terminates TLS at a proxy; trust one hop so req.ip is the real
// client IP (rate limiters key on it) instead of the proxy's.
app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : null;

app.use(cors({
    origin: allowedOrigins
        ? (origin, cb) => {
              if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
              cb(new Error("Not allowed by CORS"));
          }
        : true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "1mb" }));

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === "test" ? 10000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in a minute." },
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "test" ? 10000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many reset requests. Please try again later." },
});

const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === "test" ? 100000 : 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
});

app.use(globalLimiter);
app.set("etag", false);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/users/validate-user",  authLimiter);
app.use("/users/add-user",       authLimiter);
app.use("/users/forgot-password", forgotPasswordLimiter);
app.use("/users/reset-password",  forgotPasswordLimiter);
app.use("/users/verify-email",      forgotPasswordLimiter);
app.use("/users/resend-verification", forgotPasswordLimiter);

app.use("/users",         usersRouter);
app.use("/clubs",         clubsRouter);
app.use("/posts",         postsRouter);
app.use("/events",        eventsRouter);
app.use("/search",        searchRouter);
app.use("/notifications", notificationsRouter);
app.use("/uploads",       uploadsRouter);
app.use("/feedback",      feedbackRouter);
app.use("/reports",       reportsRouter);
app.use("/share",         shareRouter);
app.use("/calendar",      calendarRouter);
app.use("/legal",         legalRouter);

app.use(errorHandler);

export default app;
