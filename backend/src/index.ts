import app from "./app";
import { runEventReminders } from "./jobs/eventReminders";
import { runScheduledPublish } from "./jobs/scheduledPublish";

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
    console.log(`uEvents API running on http://localhost:${PORT}`);
});

setInterval(() => { runEventReminders().catch(console.error); }, 60 * 1000);
setInterval(() => { runScheduledPublish().catch(console.error); }, 60 * 1000);
