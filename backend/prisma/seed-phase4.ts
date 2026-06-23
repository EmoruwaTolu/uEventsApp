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

    // Follow the club + a few topics (so the feed + topic-following are populated)
    await prisma.follow.createMany({ data: [{ userId: student.id, clubId: club.id }], skipDuplicates: true });
    await prisma.interestFollow.createMany({
        data: ["Health & Wellness", "Academic", "Social"].map((category) => ({ userId: student.id, category })),
        skipDuplicates: true,
    });

    console.log("\n✅ Phase 4 demo ready.");
    console.log("   Log in as:  demo@uottawa.ca  /  password123");
    console.log("   • Profile → 'Events' = 3 attended, with the semester recap line");
    console.log(`   • Open the past event "MCAT Study Boot Camp" → EVENT RECAP (4.75★, ${PHOTOS.length} photos, your 5★)`);
    console.log("   • Events tab → 'My Week' shows 2 upcoming RSVPs");
    console.log("   • Discover → followed topics; feed has Pre-Med Society posts\n");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
