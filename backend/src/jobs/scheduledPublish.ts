import { prisma } from "../lib/prisma";
import { sendExpoPush } from "../lib/push";

async function notifyFollowers(
    clubId: string,
    postType: string,
    clubName: string,
    postTitle: string,
    postId: string,
    categories: string[] = [],
) {
    // pushNotifs gates the push only — in-app notifications are always created.
    const recipients = new Map<string, string | null>(); // userId -> pushToken (null = no push)

    const follows = await prisma.follow.findMany({
        where: {
            clubId,
            notifPref: postType === "EVENT" ? { in: ["ALL", "EVENTS"] } : "ALL",
        },
        select: { userId: true, user: { select: { pushToken: true, pushNotifs: true } } },
    });
    for (const f of follows) {
        recipients.set(f.userId, f.user.pushNotifs ? f.user.pushToken ?? null : null);
    }

    if (categories.length > 0) {
        const topicFollows = await prisma.interestFollow.findMany({
            where: { category: { in: categories } },
            select: { userId: true, user: { select: { pushToken: true, pushNotifs: true } } },
        });
        for (const tf of topicFollows) {
            if (!recipients.has(tf.userId)) {
                recipients.set(tf.userId, tf.user.pushNotifs ? tf.user.pushToken ?? null : null);
            }
        }
    }

    recipients.delete(clubId);
    if (recipients.size === 0) return;

    const titleMap: Record<string, string> = {
        EVENT:        `New event from ${clubName}`,
        ANNOUNCEMENT: `${clubName} posted an announcement`,
        POLL:         `${clubName} posted a new poll`,
        UPDATE:       `Update from ${clubName}`,
    };
    const notifTitle = titleMap[postType] ?? `New post from ${clubName}`;
    const notifType = postType === "EVENT" ? "EVENT" : "POST";

    await prisma.notification.createMany({
        data: [...recipients.keys()].map((userId) => ({
            userId,
            type: notifType,
            title: notifTitle,
            body: postTitle,
            metadata: { postId, postType },
        })),
        skipDuplicates: true,
    });

    const pushTokens = [...recipients.values()].filter(Boolean) as string[];
    sendExpoPush(pushTokens.map((token) => ({
        to: token,
        title: notifTitle,
        body: postTitle,
        data: { postId, postType },
        sound: "default" as const,
    })));
}

export async function runScheduledPublish() {
    const now = new Date();

    const due = await prisma.post.findMany({
        where: {
            isDraft: true,
            hidden: false, // never auto-publish (or announce) moderated posts
            publishAt: { lte: now },
        },
        include: { club: { select: { clubName: true } } },
    });

    for (const post of due) {
        await prisma.post.update({
            where: { id: post.id },
            data: { isDraft: false, publishAt: null },
        });

        const title = (post.locales as any)?.en?.title ?? (post.locales as any)?.fr?.title ?? "New post";
        notifyFollowers(post.clubId, post.type, post.club.clubName ?? "", title, post.id, post.categories ?? []).catch(console.error);
    }
}
