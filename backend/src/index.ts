import app from "./app";
import { runEventReminders } from "./jobs/eventReminders";
import { runScheduledPublish } from "./jobs/scheduledPublish";
import { runSeriesTopUp } from "./jobs/seriesTopUp";
import { runWeeklyDigest } from "./jobs/weeklyDigest";

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
    console.log(`uEvents API running on http://localhost:${PORT}`);
});

setInterval(() => { runEventReminders().catch(console.error); }, 60 * 1000);
setInterval(() => { runScheduledPublish().catch(console.error); }, 60 * 1000);
// Top up open-ended recurring series hourly.
setInterval(() => { runSeriesTopUp().catch(console.error); }, 60 * 60 * 1000);
runSeriesTopUp().catch(console.error); // also run once at startup

// Weekly digest — checked hourly, fires Sunday 18:00 in Ottawa (America/Toronto),
// not the server's UTC clock (on Render, getHours() === 18 would land at 2pm local).
// runWeeklyDigest is idempotent (6-day per-user guard) so the hourly check is safe.
setInterval(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        weekday: "short",
        hour: "2-digit",
        hour12: false,
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === "weekday")?.value;
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "-1", 10);
    if (weekday === "Sun" && hour === 18) {
        runWeeklyDigest().catch(console.error);
    }
}, 60 * 60 * 1000);
