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

// Weekly digest — checked hourly, fires Sunday evening (server local time).
// runWeeklyDigest is idempotent (6-day per-user guard) so the hourly check is safe.
setInterval(() => {
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 18) {
        runWeeklyDigest().catch(console.error);
    }
}, 60 * 60 * 1000);
