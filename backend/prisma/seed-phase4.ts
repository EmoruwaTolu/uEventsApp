import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Unsplash images (same source the main seed uses)
const IMG = {
    study:   "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&fit=crop",
    panel:   "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&fit=crop",
    wellness:"https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&fit=crop",
    fair:    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&fit=crop",
};
// Recap gallery photos
const PHOTOS = [
    "https://picsum.photos/seed/uevents-recap-1/800/800",
    "https://picsum.photos/seed/uevents-recap-2/800/800",
    "https://picsum.photos/seed/uevents-recap-3/800/800",
    "https://picsum.photos/seed/uevents-recap-4/800/800",
    "https://picsum.photos/seed/uevents-recap-5/800/800",
];

function daysAgo(d: number, h = 18) {
    const x = new Date(Date.now() - d * 86_400_000);
    x.setHours(h, 0, 0, 0);
    return x;
}
function daysAhead(d: number, h = 18) {
    const x = new Date(Date.now() + d * 86_400_000);
    x.setHours(h, 0, 0, 0);
    return x;
}

async function main() {
    const hash = await bcrypt.hash("password123", 12);
    const verified = new Date();

    const club = await prisma.user.upsert({
        where: { email: "democlub@uottawa.ca" },
        update: { emailVerified: verified },
        create: {
            email: "democlub@uottawa.ca", passwordHash: hash, type: "CLUB",
            clubName: "Pre-Med Society", slug: "pre-med-demo", category: "Academic",
            description: "Your home for everything pre-medicine at uOttawa.",
            logoUrl: "https://picsum.photos/seed/premed-logo/200/200",
            emailVerified: verified,
        },
    });

    const student = await prisma.user.upsert({
        where: { email: "demo@uottawa.ca" },
        update: { emailVerified: verified },
        create: {
            email: "demo@uottawa.ca", passwordHash: hash, type: "STUDENT",
            firstName: "Demo", lastName: "Student", program: "Health Sciences", year: "2",
            avatarUrl: "https://picsum.photos/seed/demo-student/200/200",
            emailVerified: verified,
        },
    });

    // A few extra attendees so the recap has multiple ratings/photos
    const raters = [];
    for (const r of [
        { email: "aisha@uottawa.ca", firstName: "Aisha" },
        { email: "liam@uottawa.ca", firstName: "Liam" },
        { email: "noah@uottawa.ca", firstName: "Noah" },
    ]) {
        raters.push(await prisma.user.upsert({
            where: { email: r.email }, update: {},
            create: { email: r.email, passwordHash: hash, type: "STUDENT", firstName: r.firstName, emailVerified: verified },
        }));
    }

    // A larger crowd for realistic like counts + a popular conversation
    const crowd = [];
    const crowdNames = ["Maya", "Omar", "Sofia", "Ethan", "Priya", "Lucas", "Hana", "Diego", "Amara", "Ben", "Chloe", "Ravi", "Zara", "Theo"];
    for (let i = 0; i < crowdNames.length; i++) {
        crowd.push(await prisma.user.upsert({
            where: { email: `crowd${i}@uottawa.ca` }, update: {},
            create: { email: `crowd${i}@uottawa.ca`, passwordHash: hash, type: "STUDENT", firstName: crowdNames[i], emailVerified: verified },
        }));
    }

    // Clean any prior demo posts (cascades to check-ins, ratings, photos, rsvps)
    await prisma.post.deleteMany({ where: { clubId: club.id } });

    // ── Showcase PAST event (this is the one with a full recap) ──
    const showcase = await prisma.post.create({
        data: {
            clubId: club.id, type: "EVENT", isDraft: false,
            locales: { en: { title: "MCAT Study Boot Camp", body: "An all-day guided study sprint with practice sections, peer tutors, and snacks. Bring your laptop and your questions.", posterUrl: IMG.study, imageUrl: IMG.study } },
            startAt: daysAgo(3, 9), endAt: daysAgo(3, 17),
            locationName: "Room 204, Roger Guindon Hall", address: "451 Smyth Rd, Ottawa, ON",
            categories: ["Academic", "Health & Wellness"], images: [IMG.study],
            freeFood: true, capacity: 60,
        },
    });

    // Two more past events the student attended (for attendance history/count)
    const past2 = await prisma.post.create({
        data: {
            clubId: club.id, type: "EVENT", isDraft: false,
            locales: { en: { title: "Anatomy Review Jam", body: "Group review of major systems before midterms.", posterUrl: IMG.study } },
            startAt: daysAgo(9, 16), endAt: daysAgo(9, 18),
            locationName: "Morisset Library", address: "65 University Pvt, Ottawa, ON",
            categories: ["Academic"], images: [IMG.study],
        },
    });
    const past3 = await prisma.post.create({
        data: {
            clubId: club.id, type: "EVENT", isDraft: false,
            locales: { en: { title: "Health Sciences Volunteer Fair", body: "Meet hospitals and clinics recruiting student volunteers.", posterUrl: IMG.fair } },
            startAt: daysAgo(16, 12), endAt: daysAgo(16, 15),
            locationName: "Jock-Turcot University Centre", address: "85 University Pvt, Ottawa, ON",
            categories: ["Career", "Community"], images: [IMG.fair],
        },
    });

    // Upcoming events the student RSVP'd to (for "My Week")
    const up1 = await prisma.post.create({
        data: {
            clubId: club.id, type: "EVENT", isDraft: false,
            locales: { en: { title: "Med School Admissions Panel", body: "Current med students answer your application questions.", posterUrl: IMG.panel } },
            startAt: daysAhead(1, 18), endAt: daysAhead(1, 20),
            locationName: "Lecture Hall A, Roger Guindon Hall", address: "451 Smyth Rd, Ottawa, ON",
            categories: ["Academic", "Career"], images: [IMG.panel], capacity: 120,
        },
    });
    const up2 = await prisma.post.create({
        data: {
            clubId: club.id, type: "EVENT", isDraft: false,
            locales: { en: { title: "Wellness Walk + Coffee", body: "A relaxed campus walk and free coffee before exams.", posterUrl: IMG.wellness } },
            startAt: daysAhead(3, 9), endAt: daysAhead(3, 10),
            locationName: "Tabaret Hall Steps", address: "75 Laurier Ave E, Ottawa, ON",
            categories: ["Health & Wellness", "Social"], images: [IMG.wellness], freeFood: true,
        },
    });

    // Check-ins → attendance history + recap-contribution eligibility
    await prisma.checkIn.createMany({
        data: [
            { postId: showcase.id, userId: student.id },
            { postId: past2.id, userId: student.id },
            { postId: past3.id, userId: student.id },
            ...raters.map((r) => ({ postId: showcase.id, userId: r.id })),
        ],
        skipDuplicates: true,
    });

    // Ratings on the showcase event (student 5 + raters 5/4/5 → avg 4.75)
    await prisma.eventRating.createMany({
        data: [
            { postId: showcase.id, userId: student.id, rating: 5 },
            { postId: showcase.id, userId: raters[0].id, rating: 5 },
            { postId: showcase.id, userId: raters[1].id, rating: 4 },
            { postId: showcase.id, userId: raters[2].id, rating: 5 },
        ],
        skipDuplicates: true,
    });

    // Recap photos (mix of the student's and others')
    await prisma.eventPhoto.createMany({
        data: PHOTOS.map((url, i) => ({
            postId: showcase.id,
            userId: (i % 2 === 0 ? student : raters[i % raters.length]).id,
            url,
        })),
    });

    // RSVPs for upcoming (My Week)
    await prisma.rsvp.createMany({
        data: [{ postId: up1.id, userId: student.id }, { postId: up2.id, userId: student.id }],
        skipDuplicates: true,
    });

    // ── Make past2 + past3 full recaps too (ratings, check-ins, photos) ──
    await prisma.eventRating.createMany({
        data: [
            { postId: past2.id, userId: student.id, rating: 4 },
            { postId: past2.id, userId: raters[0].id, rating: 5 },
            { postId: past2.id, userId: raters[1].id, rating: 4 },
            { postId: past3.id, userId: student.id, rating: 5 },
            { postId: past3.id, userId: raters[2].id, rating: 5 },
        ],
        skipDuplicates: true,
    });
    await prisma.checkIn.createMany({
        data: [
            { postId: past2.id, userId: raters[0].id }, { postId: past2.id, userId: raters[1].id },
            { postId: past3.id, userId: raters[2].id },
        ],
        skipDuplicates: true,
    });
    await prisma.eventPhoto.createMany({
        data: [
            ...PHOTOS.slice(0, 3).map((url, i) => ({ postId: past2.id, userId: (i % 2 === 0 ? student : raters[0]).id, url: url.replace("recap-", "p2-") })),
            ...PHOTOS.slice(0, 4).map((url, i) => ({ postId: past3.id, userId: (i % 2 === 0 ? student : raters[1]).id, url: url.replace("recap-", "p3-") })),
        ],
    });

    // ── Comments → "TOP COMMENT" previews in the For You feed ──
    await prisma.comment.createMany({
        data: [
            { postId: showcase.id, userId: raters[0].id, content: "This was incredible — the practice sections actually moved my score up." },
            { postId: showcase.id, userId: raters[1].id, content: "Best prep session I've been to all year. The tutors were so patient." },
            { postId: past2.id, userId: raters[2].id, content: "The systems review made midterms so much less scary 🙏" },
            { postId: past3.id, userId: student.id, content: "Met two hospitals recruiting volunteers — already landed an interview!" },
        ],
    });

    // ── A second club with a popular recap event matching a followed topic ──
    const club2 = await prisma.user.upsert({
        where: { email: "musicclub@uottawa.ca" },
        update: { emailVerified: verified },
        create: {
            email: "musicclub@uottawa.ca", passwordHash: hash, type: "CLUB",
            clubName: "Music Society", slug: "music-demo", category: "Arts",
            description: "Live music, jams, and socials across campus.",
            logoUrl: "https://picsum.photos/seed/music-logo/200/200",
            emailVerified: verified,
        },
    });
    await prisma.post.deleteMany({ where: { clubId: club2.id } });
    const battle = await prisma.post.create({
        data: {
            clubId: club2.id, type: "EVENT", isDraft: false,
            locales: { en: { title: "Beat Battle — Producer Edition", body: "Producers went head to head — 2 minutes to make a beat live, crowd voted the winner.", posterUrl: IMG.fair, imageUrl: IMG.fair } },
            startAt: daysAgo(5, 19), endAt: daysAgo(5, 22),
            locationName: "Montpetit Atrium", categories: ["Social", "Music"], images: [IMG.fair],
        },
    });
    await prisma.checkIn.createMany({ data: raters.map((r) => ({ postId: battle.id, userId: r.id })), skipDuplicates: true });
    await prisma.eventRating.createMany({
        data: [
            { postId: battle.id, userId: raters[0].id, rating: 5 },
            { postId: battle.id, userId: raters[1].id, rating: 5 },
            { postId: battle.id, userId: raters[2].id, rating: 4 },
        ],
        skipDuplicates: true,
    });
    await prisma.eventPhoto.createMany({
        data: PHOTOS.slice(0, 5).map((url, i) => ({ postId: battle.id, userId: raters[i % raters.length].id, url: url.replace("recap-", "battle-") })),
    });
    await prisma.comment.createMany({
        data: [
            { postId: battle.id, userId: raters[1].id, content: "The final beat went so hard 🔥🔥 crowd lost it" },
            { postId: battle.id, userId: student.id, content: "Energy in the atrium was unreal." },
        ],
    });
    // Likes across attendees → pushes "Popular this week"
    await prisma.like.createMany({ data: [student, ...raters, ...crowd].map((u) => ({ postId: battle.id, userId: u.id })), skipDuplicates: true });
    await prisma.like.createMany({ data: [student, ...raters].map((u) => ({ postId: showcase.id, userId: u.id })), skipDuplicates: true });

    // Med School Panel — a popular UPCOMING conversation that clears the
    // top-comment like threshold (so it shows a TOP COMMENT; recaps never do).
    await prisma.like.createMany({ data: crowd.map((u) => ({ postId: up1.id, userId: u.id })), skipDuplicates: true });
    await prisma.rsvp.createMany({ data: crowd.slice(0, 11).map((u) => ({ postId: up1.id, userId: u.id })), skipDuplicates: true });
    const t = Date.now();
    await prisma.comment.create({ data: { postId: up1.id, userId: crowd[1].id, content: "Came last year — the Q&A was the best part. Bring real questions.", createdAt: new Date(t - 120000), upvotes: 5 } });
    await prisma.comment.create({ data: { postId: up1.id, userId: student.id, content: "Already RSVP'd, see everyone there 🙌", createdAt: new Date(t - 60000), upvotes: 3 } });
    const topC = await prisma.comment.create({ data: { postId: up1.id, userId: crowd[4].id, content: "Is there a waitlist if it fills up? Really want to make this one.", createdAt: new Date(t), upvotes: 12 } });
    // Replies to the top comment → shows "4 replies"
    await prisma.comment.createMany({
        data: [
            { postId: up1.id, parentId: topC.id, userId: student.id, content: "Same — following this!" },
            { postId: up1.id, parentId: topC.id, userId: crowd[2].id, content: "Pre-meds get priority I heard." },
            { postId: up1.id, parentId: topC.id, userId: crowd[6].id, content: "There was a waitlist last year, it moved fast." },
            { postId: up1.id, parentId: topC.id, userId: raters[0].id, content: "Just RSVP early to be safe 👍" },
        ],
    });

    // Follow the club + a few topics (so the feed + topic-following are populated)
    await prisma.follow.createMany({ data: [{ userId: student.id, clubId: club.id }], skipDuplicates: true });
    await prisma.interestFollow.createMany({
        data: ["Health & Wellness", "Academic", "Social"].map((category) => ({ userId: student.id, category })),
        skipDuplicates: true,
    });

    console.log("\n✅ Phase 4 + For You demo ready.");
    console.log("   Log in as:  demo@uottawa.ca  /  password123");
    console.log("   • Home → 'For You' tab shows recommendation reasons, RECAP badges,");
    console.log("     photo grids, in-feed star ratings, and TOP COMMENT previews");
    console.log("   • 3 past recap events (Pre-Med) + 1 popular recap (Music Society)");
    console.log("   • Profile → 'Events' = 3 attended; Events tab → 'My Week' = 2 upcoming RSVPs\n");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
