import app from "./app";
import { runEventReminders } from "./jobs/eventReminders";
import { runScheduledPublish } from "./jobs/scheduledPublish";
import { runSeriesTopUp } from "./jobs/seriesTopUp";

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
    console.log(`uEvents API running on http://localhost:${PORT}`);
});

setInterval(() => { runEventReminders().catch(console.error); }, 60 * 1000);
setInterval(() => { runScheduledPublish().catch(console.error); }, 60 * 1000);
// Top up open-ended recurring series hourly.
setInterval(() => { runSeriesTopUp().catch(console.error); }, 60 * 60 * 1000);
runSeriesTopUp().catch(console.error); // also run once at startup
