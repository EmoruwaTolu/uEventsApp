import { prisma } from "../lib/prisma";
import { sendExpoPush } from "../lib/push";

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
            startAt: { gte: windowStart, lte: windowEnd },
        },
        include: {
            rsvps: {
                include: {
                    user: { select: { id: true, pushToken: true } },
                },
            },
            club: { select: { clubName: true } },
        },
    });

    for (const event of upcomingEvents) {
        const title = (event.locales as any)?.en?.title ?? (event.locales as any)?.fr?.title ?? "Upcoming event";
        const notifTitle = `Starting soon: ${title}`;
        const notifBody  = `Your event from ${event.club?.clubName ?? "a club"} starts in about 1 hour.`;

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
                title: notifTitle,
                body: notifBody,
                metadata: { postId: event.id, postType: "EVENT" },
            })),
            skipDuplicates: true,
        });

        // Send Expo push notifications
        const pushTokens = toNotify.map((u) => u.pushToken).filter(Boolean) as string[];
        sendExpoPush(pushTokens.map((token) => ({
            to: token,
            title: notifTitle,
            body: notifBody,
            data: { postId: event.id, postType: "EVENT" },
            sound: "default" as const,
        })));
    }
}
