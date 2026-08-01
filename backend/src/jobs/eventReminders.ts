import { prisma } from "../lib/prisma";
import { sendExpoPush } from "../lib/push";
import { toLang, eventReminderPush } from "../lib/notifCopy";

/**
 * Runs every minute. Finds events starting in 55–65 minutes and sends
 * a push notification + in-app notification to all RSVP'd users who
 * haven't already been reminded.
 */
export async function runEventReminders() {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 55 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + 65 * 60 * 1000);

    const upcomingEvents = await prisma.post.findMany({
        where: {
            type: "EVENT",
            isDraft: false,
            hidden: false, // moderated events must not send "starting soon"
            startAt: { gte: windowStart, lte: windowEnd },
        },
        include: {
            rsvps: {
                include: {
                    user: { select: { id: true, pushToken: true, pushNotifs: true, language: true } },
                },
            },
            club: { select: { clubName: true } },
        },
    });

    for (const event of upcomingEvents) {
        const title = (event.locales as any)?.en?.title ?? (event.locales as any)?.fr?.title ?? "Upcoming event";
        const clubName = event.club?.clubName ?? "a club";
        // Stored rows are English; the app localizes them at display time.
        const stored = eventReminderPush("en", title, clubName);

        const usersToNotify = event.rsvps.map((r) => r.user);
        if (!usersToNotify.length) continue;

        // Check which users already got a reminder for this event
        const existing = await prisma.notification.findMany({
            where: {
                type: "REMINDER",
                metadata: { path: ["postId"], equals: event.id },
                userId: { in: usersToNotify.map((u) => u.id) },
            },
            select: { userId: true },
        });
        const alreadyNotified = new Set(existing.map((n) => n.userId));
        const toNotify = usersToNotify.filter((u) => !alreadyNotified.has(u.id));
        if (!toNotify.length) continue;

        // Create in-app notifications
        await prisma.notification.createMany({
            data: toNotify.map((u) => ({
                userId: u.id,
                type: "REMINDER" as const,
                title: stored.title,
                body: stored.body,
                metadata: { postId: event.id, postType: "EVENT" },
            })),
            skipDuplicates: true,
        });

        // Send Expo push notifications (respecting the user's push setting;
        // the in-app notification above is always created). Composed per
        // recipient — the OS renders these, so they can't be localized later.
        const pushes = toNotify
            .filter((u) => u.pushNotifs && u.pushToken)
            .map((u) => {
                const copy = eventReminderPush(toLang(u.language), title, clubName);
                return {
                    to: u.pushToken!,
                    title: copy.title,
                    body: copy.body,
                    data: { postId: event.id, postType: "EVENT" },
                    sound: "default" as const,
                };
            });
        if (pushes.length) sendExpoPush(pushes);
    }
}
