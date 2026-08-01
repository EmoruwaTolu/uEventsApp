import { prisma } from "../lib/prisma";
import { sendExpoPush } from "../lib/push";
import { toLang, newPostPush, type Lang } from "../lib/notifCopy";

async function notifyFollowers(
    clubId: string,
    postType: string,
    clubName: string,
    postTitle: string,
    postId: string,
    categories: string[] = [],
) {
    // pushNotifs gates the push only — in-app notifications are always created.
    // userId -> push token (null = no push) + the language to compose it in
    const recipients = new Map<string, { token: string | null; lang: Lang }>();

    const follows = await prisma.follow.findMany({
        where: {
            clubId,
            notifPref: postType === "EVENT" ? { in: ["ALL", "EVENTS"] } : "ALL",
        },
        select: { userId: true, user: { select: { pushToken: true, pushNotifs: true, language: true } } },
    });
    for (const f of follows) {
        recipients.set(f.userId, {
            token: f.user.pushNotifs ? f.user.pushToken ?? null : null,
            lang: toLang(f.user.language),
        });
    }

    if (categories.length > 0) {
        const topicFollows = await prisma.interestFollow.findMany({
            where: { category: { in: categories } },
            select: { userId: true, user: { select: { pushToken: true, pushNotifs: true, language: true } } },
        });
        for (const tf of topicFollows) {
            if (!recipients.has(tf.userId)) {
                recipients.set(tf.userId, {
                    token: tf.user.pushNotifs ? tf.user.pushToken ?? null : null,
                    lang: toLang(tf.user.language),
                });
            }
        }
    }

    recipients.delete(clubId);
    if (recipients.size === 0) return;

    // Stored rows are English; the app localizes them at display time.
    const { title: notifTitle } = newPostPush("en", postType, clubName, postTitle);
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

    // Push is rendered by the OS, so compose it per recipient's language.
    const pushes = [...recipients.values()]
        .filter((r) => r.token)
        .map((r) => {
            const copy = newPostPush(r.lang, postType, clubName, postTitle);
            return {
                to: r.token!,
                title: copy.title,
                body: copy.body,
                data: { postId, postType },
                sound: "default" as const,
            };
        });
    if (pushes.length) sendExpoPush(pushes);
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
