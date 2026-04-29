import { prisma } from "../lib/prisma";

async function notifyFollowers(
    clubId: string,
    postType: string,
    clubName: string,
    postTitle: string,
    postId: string,
) {
    const follows = await prisma.follow.findMany({
        where: {
            clubId,
            notifPref: postType === "EVENT" ? { in: ["ALL", "EVENTS"] } : "ALL",
        },
        select: { userId: true, user: { select: { pushToken: true } } },
    });
    if (!follows.length) return;

    const titleMap: Record<string, string> = {
        EVENT:        `New event from ${clubName}`,
        ANNOUNCEMENT: `${clubName} posted an announcement`,
        POLL:         `${clubName} posted a new poll`,
        UPDATE:       `Update from ${clubName}`,
    };
    const notifTitle = titleMap[postType] ?? `New post from ${clubName}`;
    const notifType = postType === "EVENT" ? "EVENT" : "POST";

    await prisma.notification.createMany({
        data: follows.map((f) => ({
            userId: f.userId,
            type: notifType,
            title: notifTitle,
            body: postTitle,
            metadata: { postId, postType },
        })),
        skipDuplicates: true,
    });

    const pushTokens = follows.map((f) => f.user.pushToken).filter(Boolean) as string[];
    if (!pushTokens.length) return;

    fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(pushTokens.map((token) => ({
            to: token,
            title: notifTitle,
            body: postTitle,
            data: { postId, postType },
            sound: "default" as const,
        }))),
    }).catch(console.error);
}

export async function runScheduledPublish() {
    const now = new Date();

    const due = await prisma.post.findMany({
        where: {
            isDraft: true,
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
        notifyFollowers(post.clubId, post.type, post.club.clubName ?? "", title, post.id).catch(console.error);
    }
}
