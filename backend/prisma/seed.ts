import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding...");

    // ── Clubs ────────────────────────────────────────────────────────────────
    const clubsData = [
        {
            email: "cssa@uevents.dev",
            clubName: "CSSA / AEI",
            slug: "cssa",
            category: "Academic",
            description: "The Computer Science Student Association represents CS students and organizes academic and social events throughout the year.",
            logoUrl: "https://picsum.photos/seed/cssa/200/200",
        },
        {
            email: "csclub@uevents.dev",
            clubName: "CS Club",
            slug: "cs-club",
            category: "Technology",
            description: "Weekly coding sessions, hackathons, and tech talks for students passionate about software.",
            logoUrl: "https://picsum.photos/seed/csclub/200/200",
        },
        {
            email: "fitness@uevents.dev",
            clubName: "Campus Fitness",
            slug: "campus-fitness",
            category: "Health & Wellness",
            description: "Group workouts, yoga sessions, and wellness challenges open to all students.",
            logoUrl: "https://picsum.photos/seed/fitness/200/200",
        },
        {
            email: "gamedev@uevents.dev",
            clubName: "Game Dev Society",
            slug: "game-dev",
            category: "Technology",
            description: "Build games, learn engines like Unity & Godot, and ship projects every semester.",
            logoUrl: "https://picsum.photos/seed/gamedev/200/200",
        },
        {
            email: "debate@uevents.dev",
            clubName: "Debate Club",
            slug: "debate",
            category: "Arts & Culture",
            description: "Sharpen your argumentation and public speaking at weekly practice rounds and tournaments.",
            logoUrl: "https://picsum.photos/seed/debate/200/200",
        },
        {
            email: "music@uevents.dev",
            clubName: "Music Collective",
            slug: "music",
            category: "Arts & Culture",
            description: "A community of musicians, producers, and music lovers. Open mics, jam sessions, and end-of-semester concerts.",
            logoUrl: "https://picsum.photos/seed/music/200/200",
        },
        {
            email: "entrepreneurship@uevents.dev",
            clubName: "Entrepreneurship Hub",
            slug: "entrep",
            category: "Business",
            description: "From idea to launch. We run pitch nights, startup workshops, and connect students with mentors in the startup ecosystem.",
            logoUrl: "https://picsum.photos/seed/entrep/200/200",
        },
        {
            email: "photo@uevents.dev",
            clubName: "Photography Society",
            slug: "photo",
            category: "Arts & Culture",
            description: "Weekly photo walks, darkroom access, critique sessions, and an annual gallery show. All skill levels welcome.",
            logoUrl: "https://picsum.photos/seed/photo/200/200",
        },
    ];

    const hash = await bcrypt.hash("password123", 12);

    const clubs: Record<string, { id: string }> = {};
    for (const c of clubsData) {
        const club = await prisma.user.upsert({
            where: { email: c.email },
            update: {},
            create: {
                email: c.email,
                passwordHash: hash,
                type: "CLUB",
                clubName: c.clubName,
                slug: c.slug,
                category: c.category,
                description: c.description,
                logoUrl: c.logoUrl,
            },
        });
        clubs[c.slug] = club;
        console.log(`  Club: ${c.clubName}`);
    }

    // ── Student ──────────────────────────────────────────────────────────────
    const student = await prisma.user.upsert({
        where: { email: "student@uevents.dev" },
        update: {},
        create: {
            email: "student@uevents.dev",
            passwordHash: hash,
            type: "STUDENT",
            firstName: "Alex",
            lastName: "Chen",
            program: "Computer Science",
            year: "3rd Year",
            avatarUrl: "https://picsum.photos/seed/student/200/200",
        },
    });
    console.log(`  Student: ${student.firstName} ${student.lastName}`);

    // ── Follows ──────────────────────────────────────────────────────────────
    const followedSlugs = ["cssa", "cs-club", "campus-fitness", "game-dev", "music"];
    for (const slug of followedSlugs) {
        await prisma.follow.upsert({
            where: { userId_clubId: { userId: student.id, clubId: clubs[slug].id } },
            update: {},
            create: { userId: student.id, clubId: clubs[slug].id, notifPref: "ALL" },
        });
    }
    console.log(`  Follows: student follows ${followedSlugs.join(", ")}`);

    // ── Posts ────────────────────────────────────────────────────────────────
    const now = new Date();
    const day = (n: number) => new Date(now.getTime() + n * 86400000);
    const at = (n: number, h: number, m = 0) => new Date(new Date(day(n)).setHours(h, m, 0, 0));

    const posts = [
        // ── TODAY (day 0) ──────────────────────────────────────────────────
        {
            clubId: clubs["campus-fitness"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Morning Yoga Session", body: "Unwind and recharge with a guided yoga flow. Bring your mat and a bottle of water. All levels welcome.", posterUrl: "https://picsum.photos/seed/yoga/800/500" } },
            startAt: at(0, 7, 30),
            endAt: at(0, 8, 30),
            locationName: "Gym Room 3",
            address: "Sports Complex",
            categories: ["Wellness", "Fitness"],
        },
        {
            clubId: clubs["music"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Open Mic Night", body: "All genres, all instruments, all voices. Sign up at the door — slots fill fast. Come early to grab a seat.", posterUrl: "https://picsum.photos/seed/openmic/800/500" } },
            startAt: at(0, 19, 0),
            endAt: at(0, 22, 0),
            locationName: "Bronfman Atrium",
            address: "MB Building",
            categories: ["Music", "Social"],
        },

        // ── TOMORROW (day 1) ───────────────────────────────────────────────
        {
            clubId: clubs["campus-fitness"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "HIIT Bootcamp", body: "High-intensity interval training with our certified instructors. Come ready to sweat. Mats and towels provided.", posterUrl: "https://picsum.photos/seed/hiit/800/500" } },
            startAt: at(1, 7, 30),
            endAt: at(1, 8, 30),
            locationName: "Sports Complex",
            address: "Room 14",
            categories: ["Fitness", "Health"],
        },
        {
            clubId: clubs["cs-club"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Hackathon Kickoff", body: "Build something incredible in 24 hours. All skill levels welcome — form a team or fly solo. Prizes for top 3 teams.", posterUrl: "https://picsum.photos/seed/hack/800/500" } },
            startAt: at(1, 9, 0),
            endAt: at(2, 9, 0),
            locationName: "STEM Building",
            address: "STEM 101",
            categories: ["Hackathon", "Technology"],
        },
        {
            clubId: clubs["cssa"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Midterm Study Jam", body: "Group study session with peer tutors available for algorithms, data structures, and discrete math. Snacks included.", posterUrl: "https://picsum.photos/seed/studyjam/800/500" } },
            startAt: at(1, 11, 0),
            endAt: at(1, 14, 0),
            locationName: "Webster Library",
            address: "LB 2nd Floor",
            categories: ["Academic", "Study"],
        },
        {
            clubId: clubs["cssa"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Tech Industry Panel", body: "Hear directly from engineers at top tech companies. Q&A session open to all students. Networking reception to follow.", posterUrl: "https://picsum.photos/seed/panel/800/500" } },
            startAt: at(1, 13, 0),
            endAt: at(1, 15, 0),
            locationName: "MB 5.255",
            address: "John Molson Building",
            categories: ["Academic", "Networking"],
        },
        {
            clubId: clubs["debate"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Public Speaking Workshop", body: "Practical techniques for confident speaking under pressure. Interactive exercises and live feedback from experienced debaters.", posterUrl: "https://picsum.photos/seed/speaking/800/500" } },
            startAt: at(1, 17, 0),
            endAt: at(1, 19, 0),
            locationName: "Hall Building",
            address: "H-537",
            categories: ["Workshop", "Arts"],
        },
        {
            clubId: clubs["game-dev"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Indie Dev Mixer", body: "Connect with indie developers, play demos, and pitch your game ideas. Light refreshments provided. All welcome.", posterUrl: "https://picsum.photos/seed/mixer/800/500" } },
            startAt: at(1, 19, 0),
            endAt: at(1, 21, 0),
            locationName: "EV Atrium",
            address: "EV Building",
            categories: ["Networking", "Game Dev"],
        },

        // ── DAY 2 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["entrep"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Pitch Night: Spring Edition", body: "Got an idea? This is your stage. 3-minute pitches, live audience voting, and feedback from a panel of founders and investors.", posterUrl: "https://picsum.photos/seed/pitch/800/500" } },
            startAt: at(2, 18, 0),
            endAt: at(2, 21, 0),
            locationName: "John Molson Building",
            address: "MB 14.255",
            categories: ["Business", "Networking"],
        },
        {
            clubId: clubs["photo"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Golden Hour Photo Walk", body: "Meet at the main steps and we'll walk through campus capturing the evening light. Bring any camera — phone cameras welcome.", posterUrl: "https://picsum.photos/seed/photowalk/800/500" } },
            startAt: at(2, 17, 30),
            endAt: at(2, 19, 30),
            locationName: "Main Campus Steps",
            address: "de Maisonneuve Blvd",
            categories: ["Photography", "Outdoors"],
        },
        {
            clubId: clubs["music"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Music Theory Workshop", body: "This week: chord progressions and how to write a hook. No prior theory knowledge needed. Bring a notebook.", posterUrl: "https://picsum.photos/seed/theory/800/500" } },
            startAt: at(2, 16, 0),
            endAt: at(2, 17, 30),
            locationName: "FG Building",
            address: "FG B070",
            categories: ["Music", "Workshop"],
        },

        // ── DAY 3 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["campus-fitness"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Lunchtime Run Club", body: "30-minute easy run around campus. Pace groups for all speeds — 5K, 10K, and first-timers. Meet outside the gym.", posterUrl: "https://picsum.photos/seed/runclub/800/500" } },
            startAt: at(3, 12, 0),
            endAt: at(3, 12, 45),
            locationName: "Campus Gym Entrance",
            address: "Sports Complex",
            categories: ["Fitness", "Running"],
        },
        {
            clubId: clubs["cssa"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Resume & LinkedIn Workshop", body: "Get your resume reviewed by upper-year students and recruiters. Bring a printed copy and a laptop. Spots are limited.", posterUrl: "https://picsum.photos/seed/resume/800/500" } },
            startAt: at(3, 14, 0),
            endAt: at(3, 16, 0),
            locationName: "H Building",
            address: "H-820",
            categories: ["Academic", "Career"],
        },
        {
            clubId: clubs["debate"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Weekly Practice Round", body: "Oxford-style debate format this week. Motion announced 30 minutes before start. New members always welcome.", posterUrl: "https://picsum.photos/seed/debate2/800/500" } },
            startAt: at(3, 18, 0),
            endAt: at(3, 20, 0),
            locationName: "Hall Building",
            address: "H-420",
            categories: ["Debate", "Arts"],
        },

        // ── DAY 4 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["entrep"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Founder Fireside: Building in Public", body: "A candid conversation with a founder who built and sold their first startup before graduation. Q&A follows.", posterUrl: "https://picsum.photos/seed/fireside/800/500" } },
            startAt: at(4, 17, 30),
            endAt: at(4, 19, 0),
            locationName: "EV 2.184",
            address: "EV Building",
            categories: ["Business", "Talks"],
        },
        {
            clubId: clubs["photo"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Darkroom Intro Session", body: "Learn to develop black-and-white film from scratch. All materials provided. Limited to 8 participants — register early.", posterUrl: "https://picsum.photos/seed/darkroom/800/500" } },
            startAt: at(4, 15, 0),
            endAt: at(4, 17, 0),
            locationName: "VA Building Darkroom",
            address: "VA 114",
            categories: ["Photography", "Workshop"],
        },

        // ── DAY 5 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["game-dev"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Game Jam: 48h Sprint", body: "Theme reveal at noon Friday. You have 48 hours to make a game from scratch. Any engine, any genre. Show up and ship.", posterUrl: "https://picsum.photos/seed/gamejam/800/500" } },
            startAt: at(5, 12, 0),
            endAt: at(7, 12, 0),
            locationName: "EV Building Lab",
            address: "EV 011.119",
            categories: ["Game Dev", "Technology"],
        },
        {
            clubId: clubs["music"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Beat Battle – Producer Edition", body: "Producers go head to head. 2 minutes to make a beat live, audience votes live. Sign up in advance or at the door.", posterUrl: "https://picsum.photos/seed/beatbattle/800/500" } },
            startAt: at(5, 20, 0),
            endAt: at(5, 23, 0),
            locationName: "Bronfman Atrium",
            address: "MB Building",
            categories: ["Music", "Competition"],
        },

        // ── DAY 7 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["campus-fitness"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Weekend Hike – Mont Royal", body: "Easy-to-moderate trail. Meet at the Peel metro exit at 9 AM. Bring water and layers — weather-dependent.", posterUrl: "https://picsum.photos/seed/hike/800/500" } },
            startAt: at(7, 9, 0),
            endAt: at(7, 13, 0),
            locationName: "Peel Metro Exit",
            address: "Rue Peel",
            categories: ["Outdoors", "Fitness"],
        },

        // ── DAY 10 ─────────────────────────────────────────────────────────
        {
            clubId: clubs["cssa"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Winter Wonderland Ball", body: "Join us for an unforgettable evening of dancing, music, and winter magic. Formal attire required. Tickets are limited — grab yours before they sell out!", posterUrl: "https://picsum.photos/seed/winter/800/500" } },
            startAt: at(10, 19, 0),
            endAt: at(10, 23, 59),
            locationName: "Student Centre Ballroom",
            address: "1455 De Maisonneuve W",
            categories: ["Social", "Formal"],
        },
        {
            clubId: clubs["photo"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Annual Spring Gallery Show", body: "End-of-semester showcase of student photography. Opening night with light refreshments. All are welcome.", posterUrl: "https://picsum.photos/seed/gallery/800/500" } },
            startAt: at(10, 18, 0),
            endAt: at(10, 21, 0),
            locationName: "VA Atrium Gallery",
            address: "VA Building",
            categories: ["Photography", "Arts"],
        },

        // ── DAY 14 ─────────────────────────────────────────────────────────
        {
            clubId: clubs["entrep"].id,
            type: "EVENT" as const,
            isDraft: false,
            locales: { en: { title: "Startup Weekend Concordia", body: "54 hours to build a startup from scratch. Teams form Friday night, demo Sunday afternoon. All disciplines welcome.", posterUrl: "https://picsum.photos/seed/startupwknd/800/500" } },
            startAt: at(14, 18, 0),
            endAt: at(16, 17, 0),
            locationName: "EV Building",
            address: "EV Atrium",
            categories: ["Business", "Hackathon"],
        },

        // ── ANNOUNCEMENTS & UPDATES ────────────────────────────────────────
        {
            clubId: clubs["cssa"].id,
            type: "ANNOUNCEMENT" as const,
            isDraft: false,
            locales: { en: { title: "New Semester, New Exec Team", body: "We're excited to introduce our new executive team for Winter 2026! Stay tuned for a packed semester of events, workshops, and opportunities." } },
            categories: [],
        },
        {
            clubId: clubs["cs-club"].id,
            type: "UPDATE" as const,
            isDraft: false,
            locales: { en: { title: "Weekly Meeting – This Friday", body: "This week we're doing a deep-dive into system design interviews. Room EV 3.309, 5:30 PM. Bring your laptop!" } },
            categories: [],
        },
        {
            clubId: clubs["game-dev"].id,
            type: "ANNOUNCEMENT" as const,
            isDraft: false,
            locales: { en: { title: "Our game hit 500 downloads!", body: "The game we shipped last semester just crossed 500 downloads on itch.io. Huge shoutout to everyone who contributed. More to come this semester!" } },
            categories: [],
        },
        {
            clubId: clubs["music"].id,
            type: "ANNOUNCEMENT" as const,
            isDraft: false,
            locales: { en: { title: "End-of-Semester Concert – Save the Date", body: "We're planning our biggest concert yet. More details coming soon. In the meantime, auditions for featured performers open next week." } },
            categories: [],
        },
        {
            clubId: clubs["entrep"].id,
            type: "ANNOUNCEMENT" as const,
            isDraft: false,
            locales: { en: { title: "Applications Open: Startup Mentorship Program", body: "We've partnered with 12 local founders to offer 1-on-1 mentorship this semester. Applications close in two weeks. Apply on our website." } },
            categories: [],
        },
        {
            clubId: clubs["photo"].id,
            type: "UPDATE" as const,
            isDraft: false,
            locales: { en: { title: "New Equipment Available in the Lab", body: "We just received two new mirrorless cameras available to members on loan. Come by during open lab hours to sign one out." } },
            categories: [],
        },
        {
            clubId: clubs["debate"].id,
            type: "ANNOUNCEMENT" as const,
            isDraft: false,
            locales: { en: { title: "Regional Tournament Qualifiers – Registration Open", body: "We're sending two teams to the intercollegiate regional tournament in April. Tryout rounds are this week — come prepared." } },
            categories: [],
        },
        {
            clubId: clubs["cssa"].id,
            type: "UPDATE" as const,
            isDraft: false,
            locales: { en: { title: "Course Review Packages Now Available", body: "Upper-year students have compiled review packages for COMP 352, 346, and 371. Download them from the CSSA portal before finals." } },
            categories: [],
        },

        // ── POLLS ──────────────────────────────────────────────────────────
        {
            clubId: clubs["campus-fitness"].id,
            type: "POLL" as const,
            isDraft: false,
            locales: { en: { title: "What class should we add next semester?", body: "Vote for the fitness class you'd most like to see added to our schedule." } },
            pollExpiresAt: day(7),
            pollAllowMultiple: false,
            categories: [],
            pollOptions: [
                { textEn: "Spin / Cycling", textFr: "Vélo / Spinning" },
                { textEn: "Pilates", textFr: "Pilates" },
                { textEn: "HIIT", textFr: "HIIT" },
                { textEn: "Boxing", textFr: "Boxe" },
            ],
        },
        {
            clubId: clubs["music"].id,
            type: "POLL" as const,
            isDraft: false,
            locales: { en: { title: "What genre should we focus on for the spring concert?", body: "Help us pick the theme — your vote shapes the setlist." } },
            pollExpiresAt: day(5),
            pollAllowMultiple: false,
            categories: [],
            pollOptions: [
                { textEn: "R&B / Soul", textFr: "R&B / Soul" },
                { textEn: "Indie / Alternative", textFr: "Indie / Alternatif" },
                { textEn: "Hip-Hop", textFr: "Hip-Hop" },
                { textEn: "Classical / Jazz", textFr: "Classique / Jazz" },
            ],
        },
        {
            clubId: clubs["cs-club"].id,
            type: "POLL" as const,
            isDraft: false,
            locales: { en: { title: "Best time for our weekly general meeting?", body: "We're adjusting the schedule this semester — let us know what works." } },
            pollExpiresAt: day(3),
            pollAllowMultiple: false,
            categories: [],
            pollOptions: [
                { textEn: "Monday 5–6 PM", textFr: "Lundi 17h–18h" },
                { textEn: "Wednesday 5–6 PM", textFr: "Mercredi 17h–18h" },
                { textEn: "Thursday 5–6 PM", textFr: "Jeudi 17h–18h" },
                { textEn: "Friday 12–1 PM", textFr: "Vendredi 12h–13h" },
            ],
        },
    ];

    for (const p of posts) {
        const { pollOptions, ...postData } = p as any;
        await prisma.post.create({
            data: {
                ...postData,
                pollOptions: pollOptions?.length ? { create: pollOptions } : undefined,
            },
        });
        const title = (p.locales as any).en.title;
        console.log(`  Post: [${p.type}] ${title}`);
    }

    console.log("\nDone! Login with:");
    console.log("  Student → student@uevents.dev / password123");
    console.log("  Any club → e.g. cssa@uevents.dev / password123");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
