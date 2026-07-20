/**
 * seed-demo.ts — "show off every feature" showcase seed
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDITIVE + IDEMPOTENT. Layers a curated, feature-complete demo set on top of
 * whatever is already in the database. Nothing is deleted. Safe to re-run —
 * users are upserted by email and every other row uses a deterministic id or a
 * composite/unique key, so `createMany({ skipDuplicates: true })` skips anything
 * already inserted.
 *
 * It creates two accounts you present from (both password `password123`):
 *   • demo.club@uottawa.ca — "uEvents Demo Society" (CLUB owner). Owns a curated
 *     post set that exercises every creator feature.
 *   • temor010@uottawa.ca — the existing primary STUDENT, enriched so every
 *     student-facing screen has real data.
 *
 * Feature coverage (every one is represented by real seeded data):
 *   Clubs            bilingual name/description, logo, socials, contact, approved
 *   Events           past + upcoming, capacity, free food, address, categories
 *   Pinned post      a hero pinned event on the club profile
 *   Carousel         a multi-image post (media tab + swipeable gallery)
 *   Recurring        a weekly EventSeries with 6 generated occurrences
 *   Waitlist         a full event with RSVPs at capacity + waitlisted users
 *   Announcements    plain + with image
 *   Polls            single-choice OPEN, multiple-choice OPEN, and CLOSED
 *   Drafts           an unpublished draft (club Drafts screen)
 *   Scheduled        a future-dated scheduled post
 *   Recap            approved + pending recap photos, star ratings, check-ins
 *   Comments         threads with replies and per-user comment upvotes (likes)
 *   Engagement       views, likes, bookmarks (drives analytics)
 *   Notifications    every NotifType, read + unread, for both accounts
 *   Interests        category interest-follows (For You personalization)
 *   Blocking         a blocked user (Blocked users screen)
 *   Follows          with varied notification preferences (ALL / EVENTS / NONE)
 *
 * Run locally from the backend/ directory (uses DATABASE_URL from your .env):
 *   npm run db:seed-demo
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── Deterministic RNG so re-runs produce identical data ─────────────────────
function makeRng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rng = makeRng(0xDE3701);
const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length) % arr.length];
function sample<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    n = Math.min(n, copy.length);
    for (let i = 0; i < n; i++) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
    return out;
}

const now = new Date();
const DAY = 86400000;
const HOUR = 3600000;
const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now.getTime() + dayOffset * DAY);
    d.setHours(h, m, 0, 0);
    return d;
};
const clampPast = (d: Date) => (d.getTime() > now.getTime() ? new Date(now.getTime() - HOUR) : d);
const img = (seed: string, w = 800, h = 500) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

// ── Attendee pool: fills RSVPs, comments, votes, check-ins, waitlist ────────
const ATTENDEES = [
    { email: "demo.ava@uottawa.ca",    firstName: "Ava",     lastName: "Nguyen",   program: "Computer Science",        year: "2nd Year" },
    { email: "demo.liam@uottawa.ca",   firstName: "Liam",    lastName: "Patel",    program: "Software Engineering",    year: "3rd Year" },
    { email: "demo.emma@uottawa.ca",   firstName: "Emma",    lastName: "Rousseau",  program: "Communications",          year: "1st Year" },
    { email: "demo.noah@uottawa.ca",   firstName: "Noah",    lastName: "Kim",      program: "Data Science",            year: "2nd Year" },
    { email: "demo.olivia@uottawa.ca", firstName: "Olivia",  lastName: "Santos",   program: "Biomedical Engineering",  year: "4th Year" },
    { email: "demo.ethan@uottawa.ca",  firstName: "Ethan",   lastName: "Brown",    program: "Mechanical Engineering",  year: "3rd Year" },
    { email: "demo.mia@uottawa.ca",    firstName: "Mia",     lastName: "Okonkwo",  program: "Health Sciences",         year: "1st Year" },
    { email: "demo.lucas@uottawa.ca",  firstName: "Lucas",   lastName: "Ferrari",  program: "Economics",               year: "2nd Year" },
    { email: "demo.zoe@uottawa.ca",    firstName: "Zoe",     lastName: "Anderson", program: "Psychology",              year: "3rd Year" },
    { email: "demo.omar@uottawa.ca",   firstName: "Omar",    lastName: "Haddad",   program: "Civil Engineering",       year: "4th Year" },
    { email: "demo.grace@uottawa.ca",  firstName: "Grace",   lastName: "Lam",      program: "Biology",                 year: "2nd Year" },
    { email: "demo.leo@uottawa.ca",    firstName: "Leo",     lastName: "Martins",  program: "Architecture",            year: "3rd Year" },
    { email: "demo.sara@uottawa.ca",   firstName: "Sara",    lastName: "Ibrahim",  program: "Nursing",                 year: "1st Year" },
    { email: "demo.jack@uottawa.ca",   firstName: "Jack",    lastName: "Sullivan", program: "Finance",                 year: "2nd Year" },
    { email: "demo.nina@uottawa.ca",   firstName: "Nina",    lastName: "Petrov",   program: "Environmental Science",   year: "3rd Year" },
    { email: "demo.raj@uottawa.ca",    firstName: "Raj",     lastName: "Mehta",    program: "Electrical Engineering",  year: "4th Year" },
];

const COMMENTS = [
    "This looks amazing, count me in!",
    "Finally, exactly what I've been waiting for.",
    "Will there be a recording for those who can't make it?",
    "Brought two friends last time — we loved it.",
    "Is this beginner friendly?",
    "The last one was so well organized. Thank you!",
    "Do we need to bring anything or is it all provided?",
    "Already added it to my calendar 🎉",
    "Can't wait for this one.",
    "Any chance you'll run it again later in the term?",
];

async function main() {
    console.log("Showcase demo seed — additive, idempotent.\n");
    const hash = bcrypt.hashSync("password123", 10);

    // ── Accounts ────────────────────────────────────────────────────────────
    const club = await prisma.user.upsert({
        where: { email: "demo.club@uottawa.ca" },
        update: { clubStatus: "APPROVED", emailVerified: new Date() },
        create: {
            email: "demo.club@uottawa.ca", passwordHash: hash, type: "CLUB",
            clubName: "uEvents Demo Society", clubNameFr: "Société Démo uEvents",
            slug: "uevents-demo-society", category: "Technology",
            description: "The official showcase club — every kind of event, poll, and announcement lives here. Follow along to see the app in action.",
            descriptionFr: "Le club vitrine officiel — chaque type d'événement, de sondage et d'annonce se trouve ici.",
            logoUrl: img("demosocietylogo", 400, 400),
            instagram: "uevents_demo", twitter: "uevents_demo", contactEmail: "demo.club@uottawa.ca",
            clubStatus: "APPROVED", emailVerified: new Date(),
        },
    });
    const clubId = club.id;

    const temor = await prisma.user.upsert({
        where: { email: "temor010@uottawa.ca" },
        update: { emailVerified: new Date() },
        create: {
            email: "temor010@uottawa.ca", passwordHash: hash, type: "STUDENT",
            firstName: "Temi", lastName: "Moruwa", program: "Computer Science", year: "3rd Year",
            avatarUrl: img("temor010", 200, 200), emailVerified: new Date(),
        },
    });
    const temorId = temor.id;

    const attendeeIds: string[] = [];
    for (const a of ATTENDEES) {
        const u = await prisma.user.upsert({
            where: { email: a.email },
            update: {},
            create: {
                email: a.email, passwordHash: hash, type: "STUDENT",
                firstName: a.firstName, lastName: a.lastName, program: a.program, year: a.year,
                avatarUrl: img(a.email.split("@")[0], 200, 200), emailVerified: new Date(),
            },
        });
        attendeeIds.push(u.id);
    }
    console.log(`  Accounts ready: demo club + temor010 + ${attendeeIds.length} attendees`);

    // ── Posts (deterministic ids, prefix demo_) ───────────────────────────────
    const postRows: any[] = [];
    const pollOptionRows: any[] = [];
    const seriesRows: any[] = [];
    const ADDR = { name: "STEM Complex, Room 201", addr: "150 Louis-Pasteur Pvt, Ottawa" };

    const evPost = (o: {
        id: string; title: string; body: string; dayOffset: number; hour: number;
        durationH?: number; capacity?: number | null; freeFood?: boolean; poster?: string;
        images?: string[]; categories?: string[]; isPinned?: boolean;
    }) => {
        const startAt = at(o.dayOffset, o.hour);
        const endAt = new Date(startAt.getTime() + (o.durationH ?? 2) * HOUR);
        const createdAt = clampPast(new Date(startAt.getTime() - 6 * DAY));
        postRows.push({
            id: o.id, clubId, type: "EVENT", isDraft: false, publishAt: createdAt, createdAt,
            locales: { en: { title: o.title, body: o.body, posterUrl: o.poster ?? img(o.id) } },
            startAt, endAt, locationName: ADDR.name, address: ADDR.addr,
            categories: o.categories ?? ["Technology", "Social"],
            images: o.images ?? [], capacity: o.capacity ?? null, freeFood: !!o.freeFood,
            isPinned: !!o.isPinned,
        });
        return { id: o.id, startAt, endAt, isPast: o.dayOffset < 0 };
    };

    // 1) Pinned upcoming flagship event (hero pinned card on the club profile)
    const evPinned = evPost({
        id: "demo_ev_pinned", title: "Demo Day: Every Feature, Live",
        body: "Our flagship showcase. Talks, demos, food, and prizes. Come see what the club has been building all term.",
        dayOffset: 9, hour: 17, durationH: 3, capacity: 120, freeFood: true,
        poster: img("demopinned"), categories: ["Technology", "Networking"], isPinned: true,
    });
    // 2) Full event → drives RSVP-at-capacity + waitlist
    const evFull = evPost({
        id: "demo_ev_full", title: "Hands-on Workshop (Limited Seats)",
        body: "A small-group, hands-on session. Seats are limited — RSVP to grab one, or join the waitlist.",
        dayOffset: 5, hour: 18, capacity: 6, categories: ["Workshop", "Technology"],
    });
    // 3) Free-food upcoming event (banner)
    const evFood = evPost({
        id: "demo_ev_food", title: "Pizza & Project Night",
        body: "Bring your laptop and your appetite. Free pizza while we hack on side projects together.",
        dayOffset: 3, hour: 19, freeFood: true, capacity: 60, categories: ["Social", "Food"],
    });
    // 4) Past event with a photo CAROUSEL (media tab + gallery) + recap
    const evCarousel = evPost({
        id: "demo_ev_carousel", title: "Fall Hackathon 2025",
        body: "36 hours, 40 teams, one unforgettable weekend. Swipe through the highlights.",
        dayOffset: -21, hour: 9, durationH: 8, capacity: 200,
        poster: img("demohack0"),
        images: [img("demohack0"), img("demohack1"), img("demohack2"), img("demohack3")],
        categories: ["Technology", "Competition"],
    });
    // 5) Past event with recap photos (approved + pending) + ratings
    const evRecap = evPost({
        id: "demo_ev_recap", title: "End-of-Term Social",
        body: "We closed out the term in style. Thanks to everyone who came out!",
        dayOffset: -12, hour: 18, capacity: 80, poster: img("demosocial"),
        categories: ["Social"],
    });
    // 6) A couple more for feed/history density
    const evPast1 = evPost({ id: "demo_ev_past1", title: "Intro to Git & GitHub", body: "A beginner-friendly walkthrough of version control, from clone to pull request.", dayOffset: -30, hour: 16, categories: ["Workshop", "Technology"] });
    const evUp1  = evPost({ id: "demo_ev_up1",  title: "Resume Review Drop-in", body: "Bring your resume; upper-years and alumni give you live feedback. No sign-up needed.", dayOffset: 14, hour: 15, capacity: 40, categories: ["Career"] });

    // ── Recurring event series (weekly, 6 occurrences) ────────────────────────
    const seriesId = "demo_series";
    const seriesStart = at(-14, 18); // started two weeks ago
    const seriesDuration = 90 * 60 * 1000;
    const seriesTemplate = {
        locales: { en: { title: "Weekly Coding Night", body: "Every Tuesday: co-working, pair programming, and snacks. Drop in anytime.", posterUrl: img("democoding") } },
        locationName: ADDR.name, address: ADDR.addr, categories: ["Technology", "Social"],
        capacity: 30, freeFood: false, images: [] as string[], durationMs: seriesDuration,
    };
    seriesRows.push({
        id: seriesId, clubId, freq: "WEEKLY", interval: 1, byWeekday: [seriesStart.getDay()],
        startDate: seriesStart, endDate: null, count: 6, template: seriesTemplate,
    });
    const seriesOccPosts: { id: string; startAt: Date; isPast: boolean }[] = [];
    for (let i = 0; i < 6; i++) {
        const startAt = new Date(seriesStart.getTime() + i * 7 * DAY);
        const endAt = new Date(startAt.getTime() + seriesDuration);
        const oid = `demo_series_occ${i}`;
        const isPast = startAt.getTime() < now.getTime();
        postRows.push({
            id: oid, clubId, type: "EVENT", isDraft: false,
            publishAt: clampPast(new Date(seriesStart.getTime() - 3 * DAY)),
            createdAt: clampPast(new Date(seriesStart.getTime() - 3 * DAY)),
            locales: seriesTemplate.locales, startAt, endAt,
            locationName: ADDR.name, address: ADDR.addr, categories: seriesTemplate.categories,
            images: [], capacity: 30, freeFood: false, seriesId, occurrenceDate: startAt,
        });
        seriesOccPosts.push({ id: oid, startAt, isPast });
    }

    // ── Announcements (plain + with image) ────────────────────────────────────
    postRows.push({
        id: "demo_an_plain", clubId, type: "ANNOUNCEMENT", isDraft: false,
        publishAt: at(-4, 10), createdAt: at(-4, 10),
        locales: { en: { title: "New members: start here", body: "Just joined? Welcome! Here's how we run things, what we do, and when we meet. Say hi in the comments." } },
        startAt: null, endAt: null, categories: [], images: [], freeFood: false,
    });
    postRows.push({
        id: "demo_an_image", clubId, type: "ANNOUNCEMENT", isDraft: false,
        publishAt: at(-2, 12), createdAt: at(-2, 12),
        locales: { en: { title: "Our new meeting space", body: "We've moved to a bigger room to fit our growing crew. Here's a look at the new spot.", posterUrl: img("demoroom") } },
        startAt: null, endAt: null, categories: [], images: [img("demoroom")], freeFood: false,
    });

    // ── Polls: open single, open multiple, closed ─────────────────────────────
    const pollPost = (o: { id: string; title: string; options: string[]; expiresDayOffset: number; allowMultiple?: boolean; createdDayOffset: number }) => {
        postRows.push({
            id: o.id, clubId, type: "POLL", isDraft: false,
            publishAt: at(o.createdDayOffset, 11), createdAt: at(o.createdDayOffset, 11),
            locales: { en: { title: o.title, body: "" } },
            startAt: null, endAt: null, categories: [], images: [], freeFood: false,
            pollExpiresAt: at(o.expiresDayOffset, 23, 59), pollAllowMultiple: !!o.allowMultiple,
        });
        o.options.forEach((opt, k) => pollOptionRows.push({ id: `${o.id}_o${k}`, postId: o.id, textEn: opt }));
    };
    pollPost({ id: "demo_poll_open", title: "What should our next big event be?", options: ["A hackathon", "A networking gala", "A game night", "A skills workshop"], createdDayOffset: -2, expiresDayOffset: 6 });
    pollPost({ id: "demo_poll_multi", title: "Which workshops interest you? (pick all)", options: ["Web dev", "Machine learning", "UI/UX design", "Cybersecurity", "Cloud & DevOps"], createdDayOffset: -3, expiresDayOffset: 8, allowMultiple: true });
    pollPost({ id: "demo_poll_closed", title: "Best day for weekly meetings?", options: ["Monday", "Tuesday", "Wednesday", "Thursday"], createdDayOffset: -10, expiresDayOffset: -1 });

    // ── Draft + scheduled (club-owner-only screens) ───────────────────────────
    postRows.push({
        id: "demo_draft", clubId, type: "EVENT", isDraft: true, publishAt: null,
        createdAt: at(-1, 9),
        locales: { en: { title: "[Draft] Spring Kickoff Mixer", body: "Still finalizing details — venue and time TBD. This one lives in the Drafts screen." } },
        startAt: at(40, 18), endAt: at(40, 21), locationName: ADDR.name, address: ADDR.addr,
        categories: ["Social"], images: [], capacity: 100, freeFood: true,
    });
    postRows.push({
        id: "demo_scheduled", clubId, type: "ANNOUNCEMENT", isDraft: true, publishAt: at(2, 9),
        createdAt: at(-1, 9),
        locales: { en: { title: "Scheduled: Registration opens Monday", body: "This announcement is scheduled to publish automatically — a preview of the scheduling feature." } },
        startAt: null, endAt: null, categories: [], images: [], freeFood: false,
    });

    // Insert series first (FK), then posts + poll options.
    await chunkedCreateMany("eventSeries", seriesRows);
    await chunkedCreateMany("post", postRows);
    await chunkedCreateMany("pollOption", pollOptionRows);
    console.log(`  Posts: ${postRows.length} (incl. ${seriesOccPosts.length} series occurrences), poll options: ${pollOptionRows.length}`);

    // ── Interactions ──────────────────────────────────────────────────────────
    const viewRows: any[] = [];
    const likeRows: any[] = [];
    const bookmarkRows: any[] = [];
    const rsvpRows: any[] = [];
    const waitlistRows: any[] = [];
    const checkInRows: any[] = [];
    const ratingRows: any[] = [];
    const photoRows: any[] = [];
    const pollVoteRows: any[] = [];
    const commentRows: any[] = [];
    const replyRows: any[] = [];
    const commentUpvoteRows: any[] = [];
    const followRows: any[] = [];
    const interestRows: any[] = [];
    const notifRows: any[] = [];
    const blockedRows: any[] = [];

    const publishedEventIds = [
        evPinned.id, evFull.id, evFood.id, evCarousel.id, evRecap.id, evPast1.id, evUp1.id,
        ...seriesOccPosts.map((o) => o.id),
    ];
    const allEngageableIds = [
        ...publishedEventIds, "demo_an_plain", "demo_an_image",
        "demo_poll_open", "demo_poll_multi", "demo_poll_closed",
    ];
    const allEngagers = [temorId, ...attendeeIds];

    // Views + likes + bookmarks across everything (drives analytics + counts).
    for (const pid of allEngageableIds) {
        for (const uid of sample(allEngagers, 8 + Math.floor(rng() * (allEngagers.length - 8)))) {
            viewRows.push({ userId: uid, postId: pid, createdAt: clampPast(new Date(now.getTime() - rng() * 10 * DAY)) });
        }
        for (const uid of sample(allEngagers, 4 + Math.floor(rng() * 8))) {
            likeRows.push({ userId: uid, postId: pid, createdAt: clampPast(new Date(now.getTime() - rng() * 8 * DAY)) });
        }
        for (const uid of sample(allEngagers, 1 + Math.floor(rng() * 4))) {
            bookmarkRows.push({ userId: uid, postId: pid, createdAt: clampPast(new Date(now.getTime() - rng() * 8 * DAY)) });
        }
    }

    // RSVPs to upcoming events; check-ins + ratings + recap photos on past ones.
    const upcomingEventIds = [evPinned.id, evFood.id, evUp1.id, ...seriesOccPosts.filter((o) => !o.isPast).map((o) => o.id)];
    const pastEventIds = [evCarousel.id, evRecap.id, evPast1.id, ...seriesOccPosts.filter((o) => o.isPast).map((o) => o.id)];

    for (const pid of upcomingEventIds) {
        for (const uid of sample(allEngagers, 10 + Math.floor(rng() * 6))) {
            rsvpRows.push({ userId: uid, postId: pid, createdAt: clampPast(new Date(now.getTime() - rng() * 5 * DAY)) });
        }
    }
    for (const pid of pastEventIds) {
        const attended = sample(allEngagers, 8 + Math.floor(rng() * 6));
        for (const uid of attended) {
            rsvpRows.push({ userId: uid, postId: pid, createdAt: clampPast(new Date(now.getTime() - 10 * DAY)) });
            checkInRows.push({ postId: pid, userId: uid, checkedAt: clampPast(new Date(now.getTime() - 9 * DAY)) });
            if (rng() < 0.7) ratingRows.push({ postId: pid, userId: uid, rating: 4 + Math.floor(rng() * 2) });
        }
    }

    // Recap photos: approved on both past events, plus PENDING (moderation) on the recap event.
    ["demo_ev_carousel", "demo_ev_recap"].forEach((pid, gi) => {
        sample(allEngagers, 4).forEach((uid, k) => {
            photoRows.push({ id: `demo_photo_${gi}_${k}`, postId: pid, userId: uid, url: img(`${pid}_ph${k}`, 800, 600), status: "APPROVED", createdAt: clampPast(new Date(now.getTime() - 8 * DAY)) });
        });
    });
    // Two pending photos awaiting the club's moderation.
    photoRows.push({ id: "demo_photo_pending_0", postId: "demo_ev_recap", userId: attendeeIds[0], url: img("demopend0", 800, 600), status: "PENDING", createdAt: clampPast(new Date(now.getTime() - 2 * DAY)) });
    photoRows.push({ id: "demo_photo_pending_1", postId: "demo_ev_recap", userId: attendeeIds[1], url: img("demopend1", 800, 600), status: "PENDING", createdAt: clampPast(new Date(now.getTime() - 1 * DAY)) });

    // ── Waitlist: fill demo_ev_full to capacity (6), then waitlist the rest ────
    // temor010 was promoted off the waitlist (gets an RSVP + a WAITLIST_PROMOTED
    // notification); five attendees fill the remaining seats; three more wait.
    const fullSeated = [temorId, ...attendeeIds.slice(0, 5)]; // 6 = capacity
    for (const uid of fullSeated) rsvpRows.push({ userId: uid, postId: evFull.id, createdAt: clampPast(new Date(now.getTime() - 4 * DAY)) });
    const fullWaiting = attendeeIds.slice(5, 8);
    fullWaiting.forEach((uid, i) => waitlistRows.push({ id: `demo_wait_${i}`, userId: uid, postId: evFull.id, createdAt: clampPast(new Date(now.getTime() - (3 - i) * DAY)) }));

    // ── Poll votes ────────────────────────────────────────────────────────────
    // Single-choice open: one vote each. temor010 votes too.
    for (const uid of sample(allEngagers, 12)) {
        const k = Math.floor(rng() * 4);
        pollVoteRows.push({ userId: uid, optionId: `demo_poll_open_o${k}` });
    }
    pollVoteRows.push({ userId: temorId, optionId: "demo_poll_open_o0" });
    // Multiple-choice open: each voter picks 1–3 options.
    for (const uid of sample(allEngagers, 13)) {
        const picks = sample([0, 1, 2, 3, 4], 1 + Math.floor(rng() * 3));
        for (const k of picks) pollVoteRows.push({ userId: uid, optionId: `demo_poll_multi_o${k}` });
    }
    pollVoteRows.push({ userId: temorId, optionId: "demo_poll_multi_o0" });
    pollVoteRows.push({ userId: temorId, optionId: "demo_poll_multi_o2" });
    // Closed poll: has results (voted before it closed).
    for (const uid of sample(allEngagers, 14)) {
        const k = Math.floor(rng() * 4);
        pollVoteRows.push({ userId: uid, optionId: `demo_poll_closed_o${k}` });
    }
    pollVoteRows.push({ userId: temorId, optionId: "demo_poll_closed_o1" });

    // ── Comments (threads + replies + upvotes) ────────────────────────────────
    let cSeq = 0;
    for (const pid of [evPinned.id, evCarousel.id, evFood.id, "demo_an_plain", "demo_poll_open"]) {
        const commenters = sample(allEngagers, 3 + Math.floor(rng() * 3));
        commenters.forEach((uid, i) => {
            const cid = `demo_c_${cSeq++}`;
            commentRows.push({ id: cid, userId: uid, postId: pid, content: pick(COMMENTS), upvotes: 0, createdAt: clampPast(new Date(now.getTime() - rng() * 6 * DAY)) });
            // The club replies to the first comment on each post.
            if (i === 0) {
                const rid = `demo_r_${cid}`;
                replyRows.push({ id: rid, userId: clubId, postId: pid, parentId: cid, content: "Great question — yes! See you there 🙌", upvotes: 0, createdAt: clampPast(new Date(now.getTime() - rng() * 5 * DAY)) });
            }
            // A few users upvote (like) this comment; keep the denormalized count in sync.
            const upvoters = sample(allEngagers, Math.floor(rng() * 5));
            for (const vid of upvoters) commentUpvoteRows.push({ userId: vid, commentId: cid });
            const row = commentRows.find((c) => c.id === cid);
            if (row) row.upvotes = upvoters.length;
        });
    }
    // temor010 leaves a comment on the pinned event and gets a reply from the club.
    commentRows.push({ id: "demo_c_temor", userId: temorId, postId: evPinned.id, content: "This is exactly the kind of event I've been waiting for. Bringing friends!", upvotes: 2, createdAt: clampPast(new Date(now.getTime() - 2 * DAY)) });
    replyRows.push({ id: "demo_r_temor", userId: clubId, postId: evPinned.id, parentId: "demo_c_temor", content: "Love to hear it, Temi — see you and your crew there!", upvotes: 0, createdAt: clampPast(new Date(now.getTime() - 1 * DAY)) });
    commentUpvoteRows.push({ userId: attendeeIds[0], commentId: "demo_c_temor" });
    commentUpvoteRows.push({ userId: attendeeIds[1], commentId: "demo_c_temor" });

    // ── Follows (varied notification preferences) ─────────────────────────────
    followRows.push({ userId: temorId, clubId, notifPref: "ALL", createdAt: at(-20, 10) });
    attendeeIds.forEach((uid, i) => {
        const pref = i % 3 === 0 ? "EVENTS" : i % 3 === 1 ? "ALL" : "NONE";
        followRows.push({ userId: uid, clubId, notifPref: pref, createdAt: at(-18 + i, 10) });
    });

    // ── Interest follows (For You personalization) ────────────────────────────
    for (const cat of ["Technology", "Social", "Career"]) interestRows.push({ userId: temorId, category: cat });

    // ── Blocked user (Blocked users screen) ───────────────────────────────────
    blockedRows.push({ blockerId: temorId, blockedId: attendeeIds[attendeeIds.length - 1], createdAt: at(-6, 14) });

    // ── Notifications — every type, for both accounts, read + unread ──────────
    const nowMs = now.getTime();
    const N = (id: string, userId: string, type: string, title: string, body: string, meta: any, ageH: number, isRead: boolean) =>
        notifRows.push({ id, userId, type, title, body, metadata: meta, isRead, createdAt: new Date(nowMs - ageH * HOUR) });

    // temor010's inbox
    N("demo_n_event",   temorId, "EVENT",    "New event from uEvents Demo Society", "Demo Day: Every Feature, Live", { postId: evPinned.id, postType: "EVENT" }, 3, false);
    N("demo_n_reminder",temorId, "REMINDER", "Starting soon: Pizza & Project Night", "Your event starts in 2 hours.", { postId: evFood.id, postType: "EVENT" }, 6, false);
    N("demo_n_waitlist",temorId, "WAITLIST_PROMOTED", "You're in! A seat opened up", "You've been moved off the waitlist for Hands-on Workshop.", { postId: evFull.id, postType: "EVENT" }, 20, false);
    N("demo_n_reply",   temorId, "REPLY",    "uEvents Demo Society replied to your comment", "Love to hear it, Temi — see you and your crew there!", { postId: evPinned.id, postType: "EVENT", commentId: "demo_c_temor" }, 24, true);
    N("demo_n_like",    temorId, "LIKE",     "Your comment got some love", "2 people liked your comment.", { postId: evPinned.id, postType: "EVENT" }, 30, true);
    N("demo_n_post",    temorId, "POST",     "New announcement from uEvents Demo Society", "New members: start here", { postId: "demo_an_plain", postType: "ANNOUNCEMENT" }, 48, true);
    N("demo_n_digest",  temorId, "DIGEST",   "Your weekly digest", "3 events match your interests this week, and you have 2 upcoming RSVPs.", { rsvpCount: 2, matchCount: 3 }, 72, true);

    // demo club's inbox
    N("demo_n_follow",  clubId, "FOLLOW",  "You have a new follower", "Temi Moruwa started following your club.", {}, 5, false);
    N("demo_n_comment", clubId, "COMMENT", "Temi Moruwa commented on Demo Day: Every Feature, Live", "This is exactly the kind of event I've been waiting for. Bringing friends!", { postId: evPinned.id, postType: "EVENT", commentId: "demo_c_temor" }, 2, false);

    // ── Insert (order matters for FKs: comments before replies/upvotes) ───────
    await chunkedCreateMany("postView", viewRows);
    await chunkedCreateMany("like", likeRows);
    await chunkedCreateMany("bookmark", bookmarkRows);
    await chunkedCreateMany("rsvp", rsvpRows);
    await chunkedCreateMany("waitlist", waitlistRows);
    await chunkedCreateMany("checkIn", checkInRows);
    await chunkedCreateMany("eventRating", ratingRows);
    await chunkedCreateMany("eventPhoto", photoRows);
    await chunkedCreateMany("pollVote", pollVoteRows);
    await chunkedCreateMany("comment", commentRows);
    await chunkedCreateMany("comment", replyRows);
    await chunkedCreateMany("commentUpvote", commentUpvoteRows);
    await chunkedCreateMany("follow", followRows);
    await chunkedCreateMany("interestFollow", interestRows);
    await chunkedCreateMany("blockedUser", blockedRows);
    await chunkedCreateMany("notification", notifRows);

    console.log("\nShowcase demo seed complete:");
    console.log(`  posts:          ${postRows.length}  (events, announcements, polls, draft, scheduled, series)`);
    console.log(`  poll options:   ${pollOptionRows.length}`);
    console.log(`  event series:   ${seriesRows.length}  (${seriesOccPosts.length} occurrences)`);
    console.log(`  views:          ${viewRows.length}`);
    console.log(`  likes:          ${likeRows.length}`);
    console.log(`  bookmarks:      ${bookmarkRows.length}`);
    console.log(`  rsvps:          ${rsvpRows.length}`);
    console.log(`  waitlist:       ${waitlistRows.length}`);
    console.log(`  check-ins:      ${checkInRows.length}`);
    console.log(`  ratings:        ${ratingRows.length}`);
    console.log(`  recap photos:   ${photoRows.length}  (incl. 2 pending moderation)`);
    console.log(`  poll votes:     ${pollVoteRows.length}`);
    console.log(`  comments:       ${commentRows.length + replyRows.length}  (incl. ${replyRows.length} replies)`);
    console.log(`  comment likes:  ${commentUpvoteRows.length}`);
    console.log(`  follows:        ${followRows.length}`);
    console.log(`  interests:      ${interestRows.length}`);
    console.log(`  notifications:  ${notifRows.length}  (every type)`);
    console.log("\n  Present from:");
    console.log("    club     demo.club@uottawa.ca / password123  (drafts, scheduled, pinned, series, waitlist, analytics)");
    console.log("    student  temor010@uottawa.ca  / password123  (feed, RSVPs, attendance, notifications, blocked users)");
}

// Insert in chunks with skipDuplicates so re-runs are safe and payloads stay small.
async function chunkedCreateMany(model: string, rows: any[], size = 500) {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += size) {
        const slice = rows.slice(i, i + size);
        // @ts-ignore — dynamic model access
        await (prisma as any)[model].createMany({ data: slice, skipDuplicates: true });
    }
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
