import "dotenv/config";
import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errors";
import usersRouter        from "./routes/users";
import clubsRouter        from "./routes/clubs";
import postsRouter        from "./routes/posts";
import eventsRouter       from "./routes/events";
import searchRouter       from "./routes/search";
import notificationsRouter from "./routes/notifications";
import uploadsRouter      from "./routes/uploads";
import { runEventReminders } from "./jobs/eventReminders";
import { runScheduledPublish } from "./jobs/scheduledPublish";

const app  = express();
const PORT = process.env.PORT ?? 4000;

app.set("etag", false);
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/users",         usersRouter);
app.use("/clubs",         clubsRouter);
app.use("/posts",         postsRouter);
app.use("/events",        eventsRouter);
app.use("/search",        searchRouter);
app.use("/notifications", notificationsRouter);
app.use("/uploads",       uploadsRouter);

app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`uEvents API running on http://localhost:${PORT}`);
});

// Event reminder job — runs every minute
setInterval(() => { runEventReminders().catch(console.error); }, 60 * 1000);

// Scheduled publish job — runs every minute
setInterval(() => { runScheduledPublish().catch(console.error); }, 60 * 1000);
