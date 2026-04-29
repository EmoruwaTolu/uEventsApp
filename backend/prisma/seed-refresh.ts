/**
 * seed-refresh.ts
 * 1. Deletes test/garbage posts
 * 2. Re-dates all events to be spread across the next 21 days (preserving time-of-day)
 * 3. Fills missing likes, RSVPs, comments, and poll votes on posts that have none
 *
 * Safe to re-run — all writes use upsert/createMany with skipDuplicates.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Realistic comments per post type ────────────────────────────────────────

const EVENT_COMMENTS = [
    "Can't wait for this — adding it to my calendar right now!",
    "Will there be food? Last time was great.",
    "Is this open to all students or just club members?",
    "Looks like such a fun event, I'll be bringing a friend.",
    "Do we need to register in advance or just show up?",
    "Finally an event that fits in my schedule. See you all there!",
    "This is exactly what I needed this week. Count me in.",
    "Will this be recorded or streamed? I have a lab conflict.",
    "Huge fan of these events — they always have a great vibe.",
    "Is there a capacity limit? Want to make sure I get a spot.",
    "Super excited for this one, the last one was amazing.",
    "Going with my whole study group — see you there!",
    "Appreciate you all organizing this, these events mean a lot.",
    "Any dress code for this? Just want to come prepared.",
    "Looked up the venue — great location. Easy to get to by metro.",
];

const POLL_COMMENTS = [
    "Voted! Really curious to see how the results turn out.",
    "Tough choice — went with my gut on this one.",
    "Can't believe this is even a question, the answer is obvious 😄",
    "Voted the unpopular option but I stand by it.",
    "These polls are a great way to get our voices heard, keep it up!",
    "Is there a way to see results before the poll closes?",
    "Shared this with my friends, get them to vote too!",
    "The options feel a bit limited — any chance of adding more?",
    "Great initiative. Would love more polls like this.",
];

const ANNOUNCEMENT_COMMENTS = [
    "This is so exciting! Looking forward to what's coming.",
    "Great news — thanks for keeping us in the loop.",
    "Really appreciate the transparency and updates.",
    "Congrats! Well deserved by everyone involved.",
    "Any more details on timing and next steps?",
    "Shared this with my whole class — really important info.",
    "Thank you for all the hard work behind the scenes.",
    "Love seeing the club this active. Keep it up!",
];

function pickRandom<T>(arr: T[], n: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("── Refresh seed starting ──\n");

    // ── 1. Delete garbage test posts ─────────────────────────────────────────
    const garbageTitles = [
        "Ikea dates with my girlffirend",
        "We Need To Impregnate The President",
        "Mix it Up Homie",
    ];

    for (const title of garbageTitles) {
        // locales is JSON so we search via raw
        const matches = await prisma.post.findMany({
            where: { locales: { path: ["en", "title"], equals: title } },
            select: { id: true },
        });
        for (const { id } of matches) {
            await prisma.post.delete({ where: { id } });
            console.log(`  Deleted: "${title}"`);
        }
    }

    // ── 2. Re-date all events to span the next 21 days ───────────────────────
    const events = await prisma.post.findMany({
        where: { isDraft: false, type: "EVENT", startAt: { not: null } },
        select: { id: true, startAt: true, endAt: true },
        orderBy: { startAt: "asc" },
    });

    if (events.length > 0) {
        const earliest = events[0].startAt!.getTime();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Shift so the earliest event starts 2 days from today
        const targetStart = today.getTime() + 2 * 86400000;
        const shiftMs = targetStart - earliest;

        let rescheduled = 0;
        for (const ev of events) {
            const newStart = new Date(ev.startAt!.getTime() + shiftMs);
            const newEnd = ev.endAt ? new Date(ev.endAt.getTime() + shiftMs) : null;
            await prisma.post.update({
                where: { id: ev.id },
                data: { startAt: newStart, endAt: newEnd ?? undefined },
            });
            rescheduled++;
        }
        const newEarliest = new Date(earliest + shiftMs);
        const newLatest = new Date(events[events.length - 1].startAt!.getTime() + shiftMs);
        console.log(`  Re-dated ${rescheduled} events`);
        console.log(`  Range: ${newEarliest.toDateString()} → ${newLatest.toDateString()}\n`);
    }

    // ── 3. Fill interactions ─────────────────────────────────────────────────
    const students = await prisma.user.findMany({
        where: { type: "STUDENT" },
        select: { id: true, email: true },
    });

    if (students.length === 0) {
        console.log("  No students found — skipping interactions.");
        await prisma.$disconnect();
        return;
    }

    const posts = await prisma.post.findMany({
        where: { isDraft: false },
        select: {
            id: true,
            type: true,
            locales: true,
            _count: { select: { likes: true, comments: true, rsvps: true } },
        },
    });

    // Existing like/rsvp pairs to avoid dup violations
    const existingLikes = new Set(
        (await prisma.like.findMany({ select: { userId: true, postId: true } }))
            .map((l) => `${l.userId}:${l.postId}`)
    );
    const existingRsvps = new Set(
        (await prisma.rsvp.findMany({ select: { userId: true, postId: true } }))
            .map((r) => `${r.userId}:${r.postId}`)
    );

    let likesAdded = 0;
    let rsvpsAdded = 0;
    let commentsAdded = 0;
    let votesAdded = 0;

    for (const post of posts) {
        const commentPool =
            post.type === "POLL"
                ? POLL_COMMENTS
                : post.type === "EVENT"
                ? EVENT_COMMENTS
                : ANNOUNCEMENT_COMMENTS;

        // ── Likes: bring every post to at least 8 likes ──────────────────────
        const likeTarget = post.type === "EVENT" ? 12 : 6;
        if (post._count.likes < likeTarget) {
            const needed = likeTarget - post._count.likes;
            const candidates = students.filter(
                (s) => !existingLikes.has(`${s.id}:${post.id}`)
            );
            const toAdd = pickRandom(candidates, needed);
            if (toAdd.length > 0) {
                await prisma.like.createMany({
                    data: toAdd.map((s) => ({ userId: s.id, postId: post.id })),
                    skipDuplicates: true,
                });
                toAdd.forEach((s) => existingLikes.add(`${s.id}:${post.id}`));
                likesAdded += toAdd.length;
            }
        }

        // ── RSVPs: bring events to at least 10 RSVPs ─────────────────────────
        if (post.type === "EVENT" && post._count.rsvps < 10) {
            const needed = 10 - post._count.rsvps;
            const candidates = students.filter(
                (s) => !existingRsvps.has(`${s.id}:${post.id}`)
            );
            const toAdd = pickRandom(candidates, needed);
            if (toAdd.length > 0) {
                await prisma.rsvp.createMany({
                    data: toAdd.map((s) => ({ userId: s.id, postId: post.id })),
                    skipDuplicates: true,
                });
                toAdd.forEach((s) => existingRsvps.add(`${s.id}:${post.id}`));
                rsvpsAdded += toAdd.length;
            }
        }

        // ── Comments: bring every post to at least 2 comments ────────────────
        if (post._count.comments < 2) {
            const needed = 2 - post._count.comments;
            const commenters = pickRandom(students, needed);
            for (const student of commenters) {
                await prisma.comment.create({
                    data: {
                        userId: student.id,
                        postId: post.id,
                        content: pick(commentPool),
                    },
                });
                commentsAdded++;
            }
        }
    }

    // ── Poll votes: ensure every poll option has at least 3 votes ────────────
    const pollOptions = await prisma.pollOption.findMany({
        include: { votes: { select: { userId: true } } },
    });

    const existingVotes = new Set(
        pollOptions.flatMap((o) => o.votes.map((v) => `${v.userId}:${o.id}`))
    );

    for (const option of pollOptions) {
        if (option.votes.length < 3) {
            const needed = 3 - option.votes.length;
            const candidates = students.filter(
                (s) => !existingVotes.has(`${s.id}:${option.id}`)
            );
            const toAdd = pickRandom(candidates, needed);
            if (toAdd.length > 0) {
                await prisma.pollVote.createMany({
                    data: toAdd.map((s) => ({ userId: s.id, optionId: option.id })),
                    skipDuplicates: true,
                });
                toAdd.forEach((s) => existingVotes.add(`${s.id}:${option.id}`));
                votesAdded += toAdd.length;
            }
        }
    }

    console.log(`  Likes added:    ${likesAdded}`);
    console.log(`  RSVPs added:    ${rsvpsAdded}`);
    console.log(`  Comments added: ${commentsAdded}`);
    console.log(`  Poll votes added: ${votesAdded}`);
    console.log("\n── Refresh complete ──");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
