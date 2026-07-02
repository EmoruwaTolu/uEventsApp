import { prisma } from "../lib/prisma";
import { sendExpoPush } from "../lib/push";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DIGEST_TITLE = "Your weekly uEvents digest";

/**
 * Weekly digest (intended for Sunday evening). For each student we summarise the
 * week ahead — "Your week: 2 RSVPs, 3 events matching your interests." — reusing
 * the same signals the For You ranker leans on (interest follows + club follows).
 *
 * Idempotent: a student who already received a digest in the last 6 days is
 * skipped, so it's safe to invoke more than once in the send window. Students
 * with nothing to report are skipped entirely.
 */
export async function runWeeklyDigest(now = new Date(), opts: { userIds?: string[] } = {}) {
    const weekAhead  = new Date(now.getTime() + WEEK_MS);
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    // Published events happening in the coming week.
    const upcoming = await prisma.post.findMany({
        where: { type: "EVENT", isDraft: false, hidden: false, startAt: { gte: now, lte: weekAhead } },
        select: { id: true, clubId: true, categories: true },
    });
    if (upcoming.length === 0) return { sent: 0 };
    const upcomingIds = upcoming.map((e) => e.id);

    const students = await prisma.user.findMany({
        where: { type: "STUDENT", ...(opts.userIds ? { id: { in: opts.userIds } } : {}) },
        select: { id: true, pushToken: true, pushNotifs: true },
    });
    if (students.length === 0) return { sent: 0 };
    const studentIds = students.map((s) => s.id);

    const [rsvps, interests, follows, recentDigests] = await Promise.all([
        prisma.rsvp.findMany({ where: { userId: { in: studentIds }, postId: { in: upcomingIds } }, select: { userId: true, postId: true } }),
        prisma.interestFollow.findMany({ where: { userId: { in: studentIds } }, select: { userId: true, category: true } }),
        prisma.follow.findMany({ where: { userId: { in: studentIds } }, select: { userId: true, clubId: true } }),
        prisma.notification.findMany({ where: { userId: { in: studentIds }, type: "DIGEST", createdAt: { gte: sixDaysAgo } }, select: { userId: true } }),
    ]);

    const addTo = <T>(map: Map<string, Set<T>>, key: string, val: T) => {
        let set = map.get(key);
        if (!set) { set = new Set<T>(); map.set(key, set); }
        set.add(val);
    };
    const rsvpByUser     = new Map<string, Set<string>>();
    const catsByUser     = new Map<string, Set<string>>();
    const clubsByUser    = new Map<string, Set<string>>();
    for (const r of rsvps)     addTo(rsvpByUser, r.userId, r.postId);
    for (const i of interests) addTo(catsByUser, i.userId, i.category);
    for (const f of follows)   addTo(clubsByUser, f.userId, f.clubId);
    const alreadyDigested = new Set(recentDigests.map((n) => n.userId));

    const notifications: { userId: string; type: "DIGEST"; title: string; body: string; metadata: object }[] = [];
    const pushes: { to: string; title: string; body: string; sound: "default"; data: object }[] = [];

    for (const s of students) {
        if (alreadyDigested.has(s.id)) continue;

        const myRsvps = rsvpByUser.get(s.id) ?? new Set<string>();
        const myCats  = catsByUser.get(s.id) ?? new Set<string>();
        const myClubs = clubsByUser.get(s.id) ?? new Set<string>();

        const rsvpCount = myRsvps.size;
        // Upcoming events the user hasn't RSVP'd that match a followed interest or club.
        let matchCount = 0;
        for (const e of upcoming) {
            if (myRsvps.has(e.id)) continue;
            if (myClubs.has(e.clubId) || e.categories.some((c) => myCats.has(c))) matchCount++;
        }

        if (rsvpCount === 0 && matchCount === 0) continue;

        const parts: string[] = [];
        if (rsvpCount > 0)  parts.push(`${rsvpCount} RSVP${rsvpCount === 1 ? "" : "s"}`);
        if (matchCount > 0) parts.push(`${matchCount} event${matchCount === 1 ? "" : "s"} matching your interests`);
        const body = `Your week: ${parts.join(", ")}.`;

        notifications.push({ userId: s.id, type: "DIGEST", title: DIGEST_TITLE, body, metadata: { rsvpCount, matchCount } });
        if (s.pushNotifs && s.pushToken) {
            pushes.push({ to: s.pushToken, title: DIGEST_TITLE, body, sound: "default", data: { type: "DIGEST" } });
        }
    }

    if (notifications.length) {
        await prisma.notification.createMany({ data: notifications });
    }
    sendExpoPush(pushes);

    return { sent: notifications.length };
}
