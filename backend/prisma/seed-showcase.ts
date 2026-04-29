/**
 * seed-showcase.ts
 * Adds 6 new clubs, 50+ posts spread across -3 to +21 days,
 * and rich interactions for a showcase-ready database.
 * Safe to re-run — uses upsert/skipDuplicates throughout.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding showcase data...\n");
    const hash = await bcrypt.hash("password123", 12);

    // ── New clubs ────────────────────────────────────────────────────────────
    const newClubsData = [
        {
            email: "robotics@uevents.dev",
            clubName: "Robotics Club",
            slug: "robotics",
            category: "Technology",
            description: "We design, build, and program robots. From line-followers to full autonomous systems — if it moves and thinks, we build it.",
            logoUrl: "https://picsum.photos/seed/robotics/200/200",
        },
        {
            email: "cinema@uevents.dev",
            clubName: "Cinema Society",
            slug: "cinema",
            category: "Arts & Culture",
            description: "Weekly screenings, director Q&As, and a short film festival every semester. Members get free entry to all events.",
            logoUrl: "https://picsum.photos/seed/cinema/200/200",
        },
        {
            email: "sustainability@uevents.dev",
            clubName: "Sustainability Collective",
            slug: "sustain",
            category: "Community",
            description: "Climate action, zero-waste initiatives, campus garden, and policy advocacy. Small actions, campus-wide impact.",
            logoUrl: "https://picsum.photos/seed/sustain/200/200",
        },
        {
            email: "chess@uevents.dev",
            clubName: "Chess Club",
            slug: "chess",
            category: "Academic",
            description: "Casual games to tournament prep. All levels welcome — from first-timers to rated players. Weekly meetups, monthly tournaments.",
            logoUrl: "https://picsum.photos/seed/chess/200/200",
        },
        {
            email: "volleyball@uevents.dev",
            clubName: "Volleyball Club",
            slug: "volleyball",
            category: "Health & Wellness",
            description: "Recreational and competitive volleyball. Indoor sessions three times a week and a beach tournament every spring.",
            logoUrl: "https://picsum.photos/seed/volleyball/200/200",
        },
        {
            email: "culinary@uevents.dev",
            clubName: "Culinary Arts Club",
            slug: "culinary",
            category: "Community",
            description: "Cooking workshops, international food festivals, and pop-up dinners. Come hungry, leave inspired.",
            logoUrl: "https://picsum.photos/seed/culinary/200/200",
        },
    ];

    const clubs: Record<string, { id: string }> = {};

    // Load existing clubs
    const existing = await prisma.user.findMany({ where: { type: "CLUB" }, select: { id: true, slug: true } });
    for (const c of existing) clubs[c.slug ?? c.id] = { id: c.id };

    for (const c of newClubsData) {
        const club = await prisma.user.upsert({
            where: { email: c.email },
            update: {},
            create: {
                email: c.email, passwordHash: hash, type: "CLUB",
                clubName: c.clubName, slug: c.slug, category: c.category,
                description: c.description, logoUrl: c.logoUrl,
            },
        });
        clubs[c.slug] = club;
        console.log(`  Club: ${c.clubName}`);
    }

    // ── Helper ───────────────────────────────────────────────────────────────
    const now = new Date();
    const at = (n: number, h: number, m = 0) =>
        new Date(new Date(now.getTime() + n * 86400000).setHours(h, m, 0, 0));

    // ── Additional students ──────────────────────────────────────────────────
    const extraStudents = [
        { firstName: "Amara",   lastName: "Diallo",    year: "1st Year", program: "Robotics",           email: "amara.diallo@uevents.dev"    },
        { firstName: "Felix",   lastName: "Huang",     year: "2nd Year", program: "Mechanical Engineering", email: "felix.huang@uevents.dev"   },
        { firstName: "Nadia",   lastName: "Kowalski",  year: "3rd Year", program: "Environmental Science",  email: "nadia.kowalski@uevents.dev" },
        { firstName: "Theo",    lastName: "Marchand",  year: "2nd Year", program: "Film Studies",        email: "theo.marchand@uevents.dev"   },
        { firstName: "Prisha",  lastName: "Sharma",    year: "1st Year", program: "Nutrition",           email: "prisha.sharma@uevents.dev"   },
        { firstName: "Antoine", lastName: "Leblanc",   year: "4th Year", program: "Computer Science",    email: "antoine.leblanc@uevents.dev" },
    ];

    const students: Record<string, string> = {};
    // Load existing students
    const existingStudents = await prisma.user.findMany({ where: { type: "STUDENT" }, select: { id: true, email: true } });
    for (const s of existingStudents) students[s.email] = s.id;

    for (const s of extraStudents) {
        const user = await prisma.user.upsert({
            where: { email: s.email },
            update: {},
            create: {
                email: s.email, passwordHash: hash, type: "STUDENT",
                firstName: s.firstName, lastName: s.lastName, year: s.year, program: s.program,
                avatarUrl: `https://picsum.photos/seed/${s.firstName.toLowerCase()}/200/200`,
            },
        });
        students[s.email] = user.id;
        console.log(`  Student: ${s.firstName} ${s.lastName}`);
    }

    // ── Posts ────────────────────────────────────────────────────────────────
    // Spread across -3 to +21 days for a full calendar feel

    const posts = [
        // ── PAST EVENTS (already happened — no RSVP prompt, shows history) ──
        {
            clubId: clubs["cssa"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Career Fair Prep Workshop", body: "Practise your elevator pitch and polish your resume with recruiters from 4 top firms. Recorded for members.", posterUrl: "https://picsum.photos/seed/careerfair/800/500" } },
            startAt: at(-3, 14, 0), endAt: at(-3, 16, 0),
            locationName: "MB Atrium", address: "John Molson Building", categories: ["Career", "Academic"],
        },
        {
            clubId: clubs["cinema"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Director Spotlight: Bong Joon-ho", body: "Screening of Parasite followed by a panel discussion on class, cinema, and storytelling. Popcorn provided.", posterUrl: "https://picsum.photos/seed/parasite/800/500" } },
            startAt: at(-2, 18, 0), endAt: at(-2, 21, 30),
            locationName: "D-Building Auditorium", address: "D-101", categories: ["Film", "Arts"],
        },
        {
            clubId: clubs["sustain"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Campus Clean-Up Day", body: "Gloves, bags, and snacks provided. Let's make the campus spotless. Volunteers get a sustainability badge on their student profile.", posterUrl: "https://picsum.photos/seed/cleanup/800/500" } },
            startAt: at(-1, 10, 0), endAt: at(-1, 13, 0),
            locationName: "Main Quad", address: "Campus Grounds", categories: ["Community", "Environment"],
        },
        {
            clubId: clubs["chess"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Monthly Blitz Tournament", body: "3+2 format. 8-round Swiss. Bring your own clock if you have one. Prizes for top 3. Open to all ratings.", posterUrl: "https://picsum.photos/seed/chess2/800/500" } },
            startAt: at(-1, 13, 0), endAt: at(-1, 17, 0),
            locationName: "H-527", address: "Hall Building", categories: ["Tournament", "Academic"],
        },

        // ── TODAY ──────────────────────────────────────────────────────────
        {
            clubId: clubs["robotics"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Intro to Arduino Workshop", body: "Build your first sensor-actuator system from scratch. Kits provided. No prior hardware experience needed.", posterUrl: "https://picsum.photos/seed/arduino/800/500" } },
            startAt: at(0, 14, 0), endAt: at(0, 17, 0),
            locationName: "EV 11.119", address: "EV Building", categories: ["Workshop", "Technology"],
        },
        {
            clubId: clubs["culinary"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Dumpling Making Workshop", body: "Learn to fold four styles of dumplings with Chef Li. All ingredients included. Vegetarian and meat options available.", posterUrl: "https://picsum.photos/seed/dumplings/800/500" } },
            startAt: at(0, 16, 0), endAt: at(0, 18, 30),
            locationName: "FG Kitchen Lab", address: "FG Building", categories: ["Cooking", "Community"],
        },
        {
            clubId: clubs["volleyball"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Tuesday Open Gym", body: "Casual recreational play, all skill levels. No experience needed. Just show up and have fun.", posterUrl: "https://picsum.photos/seed/volleyball2/800/500" } },
            startAt: at(0, 19, 0), endAt: at(0, 21, 0),
            locationName: "Gym Court 2", address: "Sports Complex", categories: ["Fitness", "Recreational"],
        },

        // ── DAY 1 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["robotics"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Robot Sumo Qualifier", body: "Your sumo bot vs the world. 3kg limit, 20cm x 20cm footprint. Weigh-in starts at 9 AM. Top 4 advance to the final.", posterUrl: "https://picsum.photos/seed/sumo/800/500" } },
            startAt: at(1, 10, 0), endAt: at(1, 15, 0),
            locationName: "EV Atrium", address: "EV Building", categories: ["Competition", "Technology"],
        },
        {
            clubId: clubs["sustain"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Zero Waste 101", body: "A practical workshop on reducing household waste. Learn composting, bulk shopping, and plastic-free swaps. Free starter kit for attendees.", posterUrl: "https://picsum.photos/seed/zerowaste/800/500" } },
            startAt: at(1, 12, 0), endAt: at(1, 13, 30),
            locationName: "H-663", address: "Hall Building", categories: ["Environment", "Workshop"],
        },
        {
            clubId: clubs["cinema"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Short Film Night", body: "Five student-directed shorts, 10 minutes each. Q&A with directors after each screening. Vote for audience favourite.", posterUrl: "https://picsum.photos/seed/shortfilm/800/500" } },
            startAt: at(1, 19, 0), endAt: at(1, 21, 30),
            locationName: "D-101 Auditorium", address: "D Building", categories: ["Film", "Arts"],
        },
        {
            clubId: clubs["chess"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Beginner Night", body: "Never played chess? This is your night. Learn the rules, basic tactics, and play your first real game. No experience needed.", posterUrl: "https://picsum.photos/seed/chess3/800/500" } },
            startAt: at(1, 18, 0), endAt: at(1, 20, 0),
            locationName: "H-527", address: "Hall Building", categories: ["Academic", "Beginner-Friendly"],
        },

        // ── DAY 2 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["culinary"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "International Food Festival", body: "12 student chefs, 12 countries, one afternoon. Sample dishes from Morocco, Japan, Colombia, India, and more. Free entry.", posterUrl: "https://picsum.photos/seed/foodfest/800/500" } },
            startAt: at(2, 11, 0), endAt: at(2, 15, 0),
            locationName: "MB Atrium", address: "John Molson Building", categories: ["Food", "Community"],
        },
        {
            clubId: clubs["volleyball"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "3v3 Tournament", body: "Register a team of 3 or let us place you. Round-robin format, top 2 play for the cup. Prizes and bragging rights.", posterUrl: "https://picsum.photos/seed/vball3v3/800/500" } },
            startAt: at(2, 13, 0), endAt: at(2, 17, 0),
            locationName: "Gym Court 1", address: "Sports Complex", categories: ["Tournament", "Fitness"],
        },

        // ── DAY 3 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["sustain"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Panel: Climate Action on Campus", body: "Professors, a city councillor, and student advocates discuss what a truly sustainable university looks like. Open Q&A.", posterUrl: "https://picsum.photos/seed/climateaction/800/500" } },
            startAt: at(3, 16, 0), endAt: at(3, 18, 0),
            locationName: "H-110", address: "Hall Building", categories: ["Environment", "Talks"],
        },
        {
            clubId: clubs["robotics"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Drone Racing Workshop", body: "Learn to build and fly FPV drones. We supply the parts, you supply the focus. Safety briefing mandatory for all participants.", posterUrl: "https://picsum.photos/seed/drone/800/500" } },
            startAt: at(3, 13, 0), endAt: at(3, 16, 0),
            locationName: "Sports Complex Parking", address: "Sports Complex", categories: ["Workshop", "Technology"],
        },
        {
            clubId: clubs["cinema"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Screenwriting Masterclass", body: "A 90-minute deep dive into three-act structure, character arcs, and dialogue. Workshopping student scripts in the second half.", posterUrl: "https://picsum.photos/seed/screenwriting/800/500" } },
            startAt: at(3, 14, 0), endAt: at(3, 16, 0),
            locationName: "FG B060", address: "FG Building", categories: ["Film", "Workshop"],
        },

        // ── DAY 4 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["culinary"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Sourdough Bread Workshop", body: "Start your starter culture and learn long-fermentation baking. Take home a jar of live starter and your first loaf.", posterUrl: "https://picsum.photos/seed/sourdough/800/500" } },
            startAt: at(4, 10, 0), endAt: at(4, 12, 30),
            locationName: "FG Kitchen Lab", address: "FG Building", categories: ["Cooking", "Workshop"],
        },
        {
            clubId: clubs["volleyball"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Thursday Open Gym", body: "Drop-in play, no registration needed. Nets are up at 7, we go until 9. Bring your own water bottle.", posterUrl: "https://picsum.photos/seed/volleyball3/800/500" } },
            startAt: at(4, 19, 0), endAt: at(4, 21, 0),
            locationName: "Gym Court 2", address: "Sports Complex", categories: ["Fitness", "Recreational"],
        },

        // ── DAY 5 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["chess"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Intercollegiate Match: Concordia vs McGill", body: "Our top 5 players face McGill in a classical format match. Come support the team. Spectators welcome.", posterUrl: "https://picsum.photos/seed/chessvsmc/800/500" } },
            startAt: at(5, 14, 0), endAt: at(5, 18, 0),
            locationName: "H-527", address: "Hall Building", categories: ["Competition", "Tournament"],
        },
        {
            clubId: clubs["cinema"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Classic Cinema Night: Kubrick Double Feature", body: "2001: A Space Odyssey + Dr. Strangelove back to back. Intermission with free coffee. Optional pre-show lecture at 6:30.", posterUrl: "https://picsum.photos/seed/kubrick/800/500" } },
            startAt: at(5, 18, 30), endAt: at(5, 23, 30),
            locationName: "D-101 Auditorium", address: "D Building", categories: ["Film", "Arts"],
        },
        {
            clubId: clubs["sustain"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Campus Garden Spring Planting", body: "Help us plant this semester's crops. No gardening experience needed. Gloves and tools provided. Snacks and lemonade after.", posterUrl: "https://picsum.photos/seed/garden/800/500" } },
            startAt: at(5, 9, 0), endAt: at(5, 12, 0),
            locationName: "Campus Garden Plot", address: "Behind EV Building", categories: ["Environment", "Community"],
        },

        // ── DAY 6 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["culinary"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Pop-Up Brunch: Saturday Edition", body: "Student chefs take over the kitchen. Eggs benny, crêpes, açaí bowls, and more. Pay what you can.", posterUrl: "https://picsum.photos/seed/brunch/800/500" } },
            startAt: at(6, 10, 30), endAt: at(6, 13, 0),
            locationName: "FG Building Lobby", address: "FG Building", categories: ["Food", "Community"],
        },
        {
            clubId: clubs["volleyball"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Outdoor Sand Court Day", body: "We're taking it outside. Beach volleyball at the sand courts — casual games all day. Bring sunscreen.", posterUrl: "https://picsum.photos/seed/sandcourt/800/500" } },
            startAt: at(6, 12, 0), endAt: at(6, 16, 0),
            locationName: "Sand Courts", address: "Campus Grounds", categories: ["Fitness", "Outdoors"],
        },

        // ── DAY 8 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["robotics"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "End-of-Semester Robot Showcase", body: "Every team presents their semester project. Demos, judging panel, and an audience choice award. Open to the whole campus.", posterUrl: "https://picsum.photos/seed/robotshowcase/800/500" } },
            startAt: at(8, 13, 0), endAt: at(8, 17, 0),
            locationName: "EV Atrium", address: "EV Building", categories: ["Showcase", "Technology"],
        },
        {
            clubId: clubs["cinema"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Cinematography Workshop: Lighting for Film", body: "A hands-on session covering natural light, three-point setup, and motivated lighting. Bring a camera or use ours.", posterUrl: "https://picsum.photos/seed/lighting/800/500" } },
            startAt: at(8, 14, 0), endAt: at(8, 17, 0),
            locationName: "VA 212", address: "VA Building", categories: ["Film", "Workshop"],
        },

        // ── DAY 9 ──────────────────────────────────────────────────────────
        {
            clubId: clubs["sustain"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Swap Shop — Clothing Exchange", body: "Bring up to 5 items, take up to 5. Everything must be clean and wearable. What you don't swap gets donated.", posterUrl: "https://picsum.photos/seed/swapshop/800/500" } },
            startAt: at(9, 11, 0), endAt: at(9, 15, 0),
            locationName: "MB Lobby", address: "John Molson Building", categories: ["Community", "Environment"],
        },
        {
            clubId: clubs["chess"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Rapid Championship — Spring Edition", body: "15+10 format, 7 rounds Swiss. Rated event. Medals and cash prizes for top 3. Registration closes day before.", posterUrl: "https://picsum.photos/seed/chessrapid/800/500" } },
            startAt: at(9, 10, 0), endAt: at(9, 17, 0),
            locationName: "H-527", address: "Hall Building", categories: ["Tournament", "Competition"],
        },

        // ── DAY 11 ─────────────────────────────────────────────────────────
        {
            clubId: clubs["culinary"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Ramen From Scratch", body: "Tonkotsu broth, hand-pulled noodles, and all the toppings. A 3-hour deep dive into Japanese comfort food. Limited to 12 spots.", posterUrl: "https://picsum.photos/seed/ramen/800/500" } },
            startAt: at(11, 14, 0), endAt: at(11, 17, 0),
            locationName: "FG Kitchen Lab", address: "FG Building", categories: ["Cooking", "Workshop"],
        },
        {
            clubId: clubs["volleyball"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Intercollegiate League Match", body: "We're hosting UQAM this week. Come support the competitive team — the gym gets loud and it's always a great atmosphere.", posterUrl: "https://picsum.photos/seed/vballleague/800/500" } },
            startAt: at(11, 18, 0), endAt: at(11, 20, 0),
            locationName: "Gym Court 1", address: "Sports Complex", categories: ["Competition", "Fitness"],
        },

        // ── DAY 13 ─────────────────────────────────────────────────────────
        {
            clubId: clubs["cinema"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Annual Short Film Festival", body: "26 films, 3 categories: Drama, Documentary, Animation. Red carpet arrivals at 5 PM. Awards ceremony to close.", posterUrl: "https://picsum.photos/seed/filmfest/800/500" } },
            startAt: at(13, 17, 0), endAt: at(13, 23, 0),
            locationName: "D-101 Auditorium", address: "D Building", categories: ["Film", "Festival"],
        },
        {
            clubId: clubs["sustain"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Bike Repair Clinic", body: "Bring your bike, leave with it fixed. Our certified mechanics will walk you through repairs you can do yourself next time.", posterUrl: "https://picsum.photos/seed/bikerepair/800/500" } },
            startAt: at(13, 10, 0), endAt: at(13, 13, 0),
            locationName: "Campus Garage", address: "EV Parking Level B", categories: ["Community", "Environment"],
        },

        // ── DAY 15 ─────────────────────────────────────────────────────────
        {
            clubId: clubs["robotics"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Machine Learning Study Group", body: "Covering CNNs this week. Bring your laptop and questions. We're working through fast.ai together. All levels welcome.", posterUrl: "https://picsum.photos/seed/mlstudy/800/500" } },
            startAt: at(15, 17, 0), endAt: at(15, 19, 0),
            locationName: "EV 3.309", address: "EV Building", categories: ["Academic", "Technology"],
        },
        {
            clubId: clubs["culinary"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Street Tacos Popup", body: "Birria, al pastor, and vegetarian options made fresh. $5 for 3 tacos, proceeds support the food bank. While supplies last.", posterUrl: "https://picsum.photos/seed/tacos/800/500" } },
            startAt: at(15, 11, 30), endAt: at(15, 14, 0),
            locationName: "Main Steps", address: "de Maisonneuve Blvd W", categories: ["Food", "Community"],
        },

        // ── DAY 17 ─────────────────────────────────────────────────────────
        {
            clubId: clubs["chess"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Simultaneous Exhibition", body: "Our top player takes on 15 challengers at once. Think you can beat them? Sign up — spots fill fast.", posterUrl: "https://picsum.photos/seed/simul/800/500" } },
            startAt: at(17, 15, 0), endAt: at(17, 18, 0),
            locationName: "H-527", address: "Hall Building", categories: ["Competition", "Academic"],
        },
        {
            clubId: clubs["volleyball"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "End-of-Semester Social + Awards Night", body: "Celebrate the season with the team. MVP, Best Rookie, and Spirit awards presented. Food and drinks provided.", posterUrl: "https://picsum.photos/seed/vballsocial/800/500" } },
            startAt: at(17, 19, 0), endAt: at(17, 22, 0),
            locationName: "MB 5.255", address: "John Molson Building", categories: ["Social", "Fitness"],
        },

        // ── DAY 18 ─────────────────────────────────────────────────────────
        {
            clubId: clubs["sustain"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Earth Day Campus Fair", body: "30 eco-friendly brands, free giveaways, a seed library, and live music. Bring a reusable bag — you'll need it.", posterUrl: "https://picsum.photos/seed/earthday/800/500" } },
            startAt: at(18, 10, 0), endAt: at(18, 16, 0),
            locationName: "Main Quad", address: "Campus Grounds", categories: ["Environment", "Community"],
        },
        {
            clubId: clubs["cinema"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Midnight Movie: The Shining", body: "Classic 35mm print projection. Pre-show trivia at 11:30. Dress code: anything horror. Best costume wins a prize.", posterUrl: "https://picsum.photos/seed/shining/800/500" } },
            startAt: at(18, 23, 55), endAt: at(19, 2, 30),
            locationName: "D-101 Auditorium", address: "D Building", categories: ["Film", "Social"],
        },

        // ── DAY 20 ─────────────────────────────────────────────────────────
        {
            clubId: clubs["culinary"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "End-of-Semester Gala Dinner", body: "A five-course meal prepared entirely by club members. Formal attire, plated service, curated playlist. Tickets limited to 40.", posterUrl: "https://picsum.photos/seed/galadinner/800/500" } },
            startAt: at(20, 19, 0), endAt: at(20, 22, 30),
            locationName: "FG Terrace", address: "FG Building", categories: ["Food", "Formal"],
        },
        {
            clubId: clubs["robotics"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Open House: Come Build With Us", body: "See what we've been working on all semester. Try a robot, talk to members, and find out how to join next year.", posterUrl: "https://picsum.photos/seed/robotopen/800/500" } },
            startAt: at(20, 13, 0), endAt: at(20, 16, 0),
            locationName: "EV 11.119", address: "EV Building", categories: ["Showcase", "Technology"],
        },
        {
            clubId: clubs["chess"].id, type: "EVENT" as const, isDraft: false,
            locales: { en: { title: "Spring Grand Prix — Final Round", body: "The last leg of our semester series. Standings are tight. Any of 4 players can take the overall title. Don't miss this one.", posterUrl: "https://picsum.photos/seed/grandprix/800/500" } },
            startAt: at(20, 10, 0), endAt: at(20, 16, 0),
            locationName: "H-527", address: "Hall Building", categories: ["Tournament", "Competition"],
        },

        // ── ANNOUNCEMENTS ──────────────────────────────────────────────────
        {
            clubId: clubs["robotics"].id, type: "ANNOUNCEMENT" as const, isDraft: false,
            locales: { en: { title: "We won the provincial robotics competition!", body: "Our autonomous navigation bot took first place in the Navigation Challenge category at Québec Robotics 2026. Huge thank you to everyone who put in late nights. We're going to nationals." } },
            categories: [],
        },
        {
            clubId: clubs["cinema"].id, type: "ANNOUNCEMENT" as const, isDraft: false,
            locales: { en: { title: "Our short film was accepted to a festival", body: "\"Through the Static\", directed by Theo Marchand and produced by our club, has been selected for the Montreal Independent Film Festival. Screening date TBA — we'll announce when tickets go live." } },
            categories: [],
        },
        {
            clubId: clubs["sustain"].id, type: "ANNOUNCEMENT" as const, isDraft: false,
            locales: { en: { title: "University approves our composting proposal", body: "After two years of advocacy, Facilities has approved a campus-wide composting program starting in the fall. This is the result of petitions, letters, and showing up. Thank you to every member who helped make this real." } },
            categories: [],
        },
        {
            clubId: clubs["chess"].id, type: "UPDATE" as const, isDraft: false,
            locales: { en: { title: "New rating system launching next month", body: "We're switching to an Elo-based internal rating system for all club members starting next semester. Initial ratings will be assigned based on your tournament results this year." } },
            categories: [],
        },
        {
            clubId: clubs["volleyball"].id, type: "ANNOUNCEMENT" as const, isDraft: false,
            locales: { en: { title: "Beach volleyball court secured for the summer", body: "We've locked in exclusive access to the sand courts every Saturday morning from May through August. Summer memberships available — details in the next post." } },
            categories: [],
        },
        {
            clubId: clubs["culinary"].id, type: "ANNOUNCEMENT" as const, isDraft: false,
            locales: { en: { title: "New partnership with Campus Kitchen", body: "Starting next month, leftover ingredients from our workshops go directly to Campus Kitchen, which prepares meals for students experiencing food insecurity. Proud to make this happen." } },
            categories: [],
        },
        {
            clubId: clubs["robotics"].id, type: "UPDATE" as const, isDraft: false,
            locales: { en: { title: "Club kits now available to borrow", body: "We've stocked 8 Arduino kits, 4 Raspberry Pi sets, and a drone chassis kit available to borrow for up to one week. Sign out form on our Discord." } },
            categories: [],
        },
        {
            clubId: clubs["sustain"].id, type: "UPDATE" as const, isDraft: false,
            locales: { en: { title: "Campus garden plot assignments ready", body: "If you signed up for a garden plot this semester, assignments are posted on our bulletin board in H-110. Come pick up your starter seeds from the club room any weekday 12–2 PM." } },
            categories: [],
        },

        // ── POLLS ──────────────────────────────────────────────────────────
        {
            clubId: clubs["cinema"].id, type: "POLL" as const, isDraft: false,
            locales: { en: { title: "Which director should we spotlight next semester?", body: "We do one deep-dive per semester. Vote for who you want to study." } },
            pollExpiresAt: at(6, 23, 59),
            pollAllowMultiple: false, categories: [],
            pollOptions: [
                { textEn: "Wong Kar-wai", textFr: "Wong Kar-wai" },
                { textEn: "Agnès Varda", textFr: "Agnès Varda" },
                { textEn: "Akira Kurosawa", textFr: "Akira Kurosawa" },
                { textEn: "Ava DuVernay", textFr: "Ava DuVernay" },
            ],
        },
        {
            clubId: clubs["sustain"].id, type: "POLL" as const, isDraft: false,
            locales: { en: { title: "What should our next big initiative be?", body: "We can only run one major campaign this semester — your vote decides." } },
            pollExpiresAt: at(4, 23, 59),
            pollAllowMultiple: false, categories: [],
            pollOptions: [
                { textEn: "Plastic-free cafeteria pilot", textFr: "Cafétéria sans plastique" },
                { textEn: "Solar panel fundraiser", textFr: "Collecte pour panneaux solaires" },
                { textEn: "Campus bike-share program", textFr: "Programme de vélos partagés" },
                { textEn: "Meatless Monday campaign", textFr: "Lundi sans viande" },
            ],
        },
        {
            clubId: clubs["culinary"].id, type: "POLL" as const, isDraft: false,
            locales: { en: { title: "What cuisine should we do for the next popup?", body: "We're planning the next street food popup — you pick the theme." } },
            pollExpiresAt: at(3, 23, 59),
            pollAllowMultiple: false, categories: [],
            pollOptions: [
                { textEn: "Korean BBQ", textFr: "BBQ coréen" },
                { textEn: "Jamaican Jerk", textFr: "Jerk jamaïcain" },
                { textEn: "Lebanese Street Food", textFr: "Street food libanais" },
                { textEn: "Peruvian Ceviche", textFr: "Ceviche péruvien" },
            ],
        },
        {
            clubId: clubs["volleyball"].id, type: "POLL" as const, isDraft: false,
            locales: { en: { title: "Preferred practice time next semester?", body: "Help us set the schedule — we'll go with the majority." } },
            pollExpiresAt: at(5, 23, 59),
            pollAllowMultiple: false, categories: [],
            pollOptions: [
                { textEn: "Monday + Wednesday evenings", textFr: "Lundi + mercredi soir" },
                { textEn: "Tuesday + Thursday evenings", textFr: "Mardi + jeudi soir" },
                { textEn: "Weekend afternoons", textFr: "Week-end après-midi" },
                { textEn: "Weekday lunch hours", textFr: "Midi en semaine" },
            ],
        },
    ];

    let postCount = 0;
    for (const p of posts) {
        const { pollOptions, ...postData } = p as any;
        await prisma.post.create({
            data: { ...postData, pollOptions: pollOptions?.length ? { create: pollOptions } : undefined },
        });
        const title = (p.locales as any).en.title;
        console.log(`  Post: [${p.type}] ${title}`);
        postCount++;
    }

    // ── Follows for new clubs ───────────────────────────────────────────────
    const allStudents = await prisma.user.findMany({ where: { type: "STUDENT" }, select: { id: true, email: true } });
    const studentById: Record<string, string> = {};
    for (const s of allStudents) studentById[s.email] = s.id;

    const newFollowMap: Record<string, string[]> = {
        "amara.diallo@uevents.dev":   ["robotics", "cs-club"],
        "felix.huang@uevents.dev":    ["robotics", "volleyball"],
        "nadia.kowalski@uevents.dev": ["sustain", "campus-fitness"],
        "theo.marchand@uevents.dev":  ["cinema", "music"],
        "prisha.sharma@uevents.dev":  ["culinary", "campus-fitness"],
        "antoine.leblanc@uevents.dev":["chess", "cssa", "cs-club"],
        "marcus.chen@uevents.dev":    ["robotics", "chess"],
        "sarah.jenkins@uevents.dev":  ["culinary", "sustain"],
        "emma.rivera@uevents.dev":    ["cinema"],
        "zoe.tremblay@uevents.dev":   ["cinema", "culinary"],
        "kai.nakamura@uevents.dev":   ["robotics"],
        "isabelle.lavoie@uevents.dev":["cinema", "sustain"],
        "samuel.adeyemi@uevents.dev": ["robotics", "chess"],
        "chloe.bergeron@uevents.dev": ["cinema", "culinary"],
        "mateo.gonzalez@uevents.dev": ["volleyball", "robotics"],
        "elijah.brown@uevents.dev":   ["chess"],
        "lily.chen@uevents.dev":      ["culinary", "sustain"],
        "jordan.scott@uevents.dev":   ["chess", "cinema"],
        "noah.williams@uevents.dev":  ["robotics", "volleyball"],
    };

    let followCount = 0;
    for (const [email, slugs] of Object.entries(newFollowMap)) {
        const userId = studentById[email];
        if (!userId) continue;
        for (const slug of slugs) {
            const club = clubs[slug];
            if (!club) continue;
            await prisma.follow.upsert({
                where: { userId_clubId: { userId, clubId: club.id } },
                update: {},
                create: { userId, clubId: club.id, notifPref: "ALL" },
            });
            followCount++;
        }
    }

    // ── RSVPs for new events ────────────────────────────────────────────────
    const newPosts = await prisma.post.findMany({
        where: { type: "EVENT", isDraft: false, clubId: { in: Object.values(clubs).map(c => c.id) } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, locales: true },
    });
    const postByTitle: Record<string, string> = {};
    for (const p of newPosts) {
        const title = (p.locales as any)?.en?.title ?? "";
        if (title) postByTitle[title] = p.id;
    }

    const rsvpMap: Record<string, string[]> = {
        "Intro to Arduino Workshop":         ["amara.diallo@uevents.dev","felix.huang@uevents.dev","kai.nakamura@uevents.dev","marcus.chen@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Dumpling Making Workshop":          ["prisha.sharma@uevents.dev","zoe.tremblay@uevents.dev","chloe.bergeron@uevents.dev","sarah.jenkins@uevents.dev","lily.chen@uevents.dev"],
        "International Food Festival":       ["prisha.sharma@uevents.dev","chloe.bergeron@uevents.dev","theo.marchand@uevents.dev","zoe.tremblay@uevents.dev","mateo.gonzalez@uevents.dev","amara.diallo@uevents.dev"],
        "Short Film Night":                  ["theo.marchand@uevents.dev","emma.rivera@uevents.dev","isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev"],
        "End-of-Semester Robot Showcase":    ["amara.diallo@uevents.dev","felix.huang@uevents.dev","kai.nakamura@uevents.dev","samuel.adeyemi@uevents.dev","marcus.chen@uevents.dev","mateo.gonzalez@uevents.dev"],
        "Annual Short Film Festival":        ["theo.marchand@uevents.dev","emma.rivera@uevents.dev","isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev","jordan.scott@uevents.dev"],
        "Earth Day Campus Fair":             ["nadia.kowalski@uevents.dev","sarah.jenkins@uevents.dev","lily.chen@uevents.dev","prisha.sharma@uevents.dev","isabelle.lavoie@uevents.dev","mateo.gonzalez@uevents.dev"],
        "Intercollegiate Match: Concordia vs McGill": ["antoine.leblanc@uevents.dev","samuel.adeyemi@uevents.dev","elijah.brown@uevents.dev","jordan.scott@uevents.dev","marcus.chen@uevents.dev"],
        "Robot Sumo Qualifier":              ["amara.diallo@uevents.dev","felix.huang@uevents.dev","kai.nakamura@uevents.dev","samuel.adeyemi@uevents.dev"],
        "3v3 Tournament":                    ["felix.huang@uevents.dev","mateo.gonzalez@uevents.dev","noah.williams@uevents.dev","james.okafor@uevents.dev"],
        "Classic Cinema Night: Kubrick Double Feature": ["theo.marchand@uevents.dev","emma.rivera@uevents.dev","chloe.bergeron@uevents.dev","isabelle.lavoie@uevents.dev"],
        "Ramen From Scratch":                ["prisha.sharma@uevents.dev","zoe.tremblay@uevents.dev","chloe.bergeron@uevents.dev","sarah.jenkins@uevents.dev"],
        "End-of-Semester Gala Dinner":       ["prisha.sharma@uevents.dev","chloe.bergeron@uevents.dev","theo.marchand@uevents.dev","lily.chen@uevents.dev","antoine.leblanc@uevents.dev"],
        "Campus Garden Spring Planting":     ["nadia.kowalski@uevents.dev","sarah.jenkins@uevents.dev","isabelle.lavoie@uevents.dev","mateo.gonzalez@uevents.dev"],
        "Rapid Championship — Spring Edition":["antoine.leblanc@uevents.dev","elijah.brown@uevents.dev","jordan.scott@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Panel: Climate Action on Campus":   ["nadia.kowalski@uevents.dev","lily.chen@uevents.dev","aisha.mensah@uevents.dev","isabelle.lavoie@uevents.dev"],
        "Swap Shop — Clothing Exchange":     ["nadia.kowalski@uevents.dev","sarah.jenkins@uevents.dev","prisha.sharma@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev"],
        "Pop-Up Brunch: Saturday Edition":   ["prisha.sharma@uevents.dev","theo.marchand@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev","mateo.gonzalez@uevents.dev"],
    };

    let rsvpCount = 0;
    for (const [title, emails] of Object.entries(rsvpMap)) {
        const postId = postByTitle[title];
        if (!postId) continue;
        for (const email of emails) {
            const userId = studentById[email];
            if (!userId) continue;
            await prisma.rsvp.upsert({
                where: { userId_postId: { userId, postId } },
                update: {},
                create: { userId, postId },
            });
            rsvpCount++;
        }
    }

    // ── Likes ───────────────────────────────────────────────────────────────
    const likeMap: Record<string, string[]> = {
        "We won the provincial robotics competition!": ["amara.diallo@uevents.dev","felix.huang@uevents.dev","kai.nakamura@uevents.dev","samuel.adeyemi@uevents.dev","marcus.chen@uevents.dev","antoine.leblanc@uevents.dev","noah.williams@uevents.dev"],
        "Our short film was accepted to a festival":   ["theo.marchand@uevents.dev","emma.rivera@uevents.dev","isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev","jordan.scott@uevents.dev"],
        "University approves our composting proposal": ["nadia.kowalski@uevents.dev","lily.chen@uevents.dev","sarah.jenkins@uevents.dev","isabelle.lavoie@uevents.dev","mateo.gonzalez@uevents.dev","prisha.sharma@uevents.dev"],
        "Intro to Arduino Workshop":                   ["amara.diallo@uevents.dev","felix.huang@uevents.dev","kai.nakamura@uevents.dev","marcus.chen@uevents.dev"],
        "International Food Festival":                 ["prisha.sharma@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev","theo.marchand@uevents.dev","lily.chen@uevents.dev","sarah.jenkins@uevents.dev"],
        "Annual Short Film Festival":                  ["theo.marchand@uevents.dev","emma.rivera@uevents.dev","isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev"],
        "Earth Day Campus Fair":                       ["nadia.kowalski@uevents.dev","sarah.jenkins@uevents.dev","lily.chen@uevents.dev","prisha.sharma@uevents.dev","isabelle.lavoie@uevents.dev"],
        "End-of-Semester Robot Showcase":              ["amara.diallo@uevents.dev","felix.huang@uevents.dev","kai.nakamura@uevents.dev","samuel.adeyemi@uevents.dev","marcus.chen@uevents.dev"],
        "New partnership with Campus Kitchen":         ["prisha.sharma@uevents.dev","lily.chen@uevents.dev","sarah.jenkins@uevents.dev","chloe.bergeron@uevents.dev","nadia.kowalski@uevents.dev"],
        "End-of-Semester Gala Dinner":                 ["prisha.sharma@uevents.dev","chloe.bergeron@uevents.dev","theo.marchand@uevents.dev","lily.chen@uevents.dev"],
        "Classic Cinema Night: Kubrick Double Feature":["theo.marchand@uevents.dev","emma.rivera@uevents.dev","chloe.bergeron@uevents.dev","jordan.scott@uevents.dev"],
        "Rapid Championship — Spring Edition":         ["antoine.leblanc@uevents.dev","elijah.brown@uevents.dev","jordan.scott@uevents.dev","samuel.adeyemi@uevents.dev"],
    };

    let likeCount = 0;
    const allNewPosts = await prisma.post.findMany({
        where: { clubId: { in: Object.values(clubs).map(c => c.id) }, isDraft: false },
        select: { id: true, locales: true },
    });
    const allPostByTitle: Record<string, string> = {};
    for (const p of allNewPosts) {
        const title = (p.locales as any)?.en?.title ?? "";
        if (title) allPostByTitle[title] = p.id;
    }

    for (const [title, emails] of Object.entries(likeMap)) {
        const postId = allPostByTitle[title];
        if (!postId) continue;
        for (const email of emails) {
            const userId = studentById[email];
            if (!userId) continue;
            await prisma.like.upsert({
                where: { userId_postId: { userId, postId } },
                update: {},
                create: { userId, postId },
            });
            likeCount++;
        }
    }

    // ── Comments ────────────────────────────────────────────────────────────
    const commentData: { title: string; email: string; content: string }[] = [
        { title: "We won the provincial robotics competition!", email: "kai.nakamura@uevents.dev",   content: "This is insane. I watched the livestream — the navigation run was flawless." },
        { title: "We won the provincial robotics competition!", email: "marcus.chen@uevents.dev",    content: "Nationals! Can't believe it. Already planning my schedule around the competition dates." },
        { title: "We won the provincial robotics competition!", email: "felix.huang@uevents.dev",    content: "The late nights in the lab were 100% worth it. Congrats to everyone." },
        { title: "Our short film was accepted to a festival",   email: "theo.marchand@uevents.dev", content: "Words can't describe what this means. Thank you to everyone who showed up to our shoots at 6 AM." },
        { title: "Our short film was accepted to a festival",   email: "emma.rivera@uevents.dev",   content: "I cried a little. Huge congrats to the whole crew." },
        { title: "Our short film was accepted to a festival",   email: "isabelle.lavoie@uevents.dev",content: "Will there be a public screening before the festival? Would love to bring friends." },
        { title: "University approves our composting proposal", email: "nadia.kowalski@uevents.dev", content: "Two years of work. This is what persistence looks like. Genuinely proud of this club." },
        { title: "University approves our composting proposal", email: "lily.chen@uevents.dev",      content: "This was not easy to get approved. Huge respect for everyone who kept pushing." },
        { title: "International Food Festival",                  email: "prisha.sharma@uevents.dev", content: "The Moroccan lamb was unreal. Please bring that chef back every semester." },
        { title: "International Food Festival",                  email: "chloe.bergeron@uevents.dev",content: "I tried seven things I'd never had before. This is exactly what campus needs more of." },
        { title: "Intro to Arduino Workshop",                   email: "amara.diallo@uevents.dev",   content: "I built my first blinking LED! Sounds simple but I'm genuinely hooked now." },
        { title: "Intro to Arduino Workshop",                   email: "marcus.chen@uevents.dev",    content: "The instructors were patient and really clear. Highly recommend for anyone curious about hardware." },
        { title: "End-of-Semester Robot Showcase",              email: "samuel.adeyemi@uevents.dev", content: "The line-follower our team built placed second! Wild to see it all come together." },
        { title: "New partnership with Campus Kitchen",         email: "prisha.sharma@uevents.dev",  content: "This is the kind of initiative that makes me proud to be part of this club." },
        { title: "New partnership with Campus Kitchen",         email: "nadia.kowalski@uevents.dev", content: "Reducing food waste AND helping students in need. Both at once. Love this." },
        { title: "Earth Day Campus Fair",                       email: "nadia.kowalski@uevents.dev", content: "The seed library booth was amazing. I'm going home with 12 varieties of tomato seeds." },
        { title: "Earth Day Campus Fair",                       email: "sarah.jenkins@uevents.dev",  content: "Best campus event of the semester. The live music made the whole vibe perfect." },
        { title: "Classic Cinema Night: Kubrick Double Feature",email: "theo.marchand@uevents.dev",  content: "Seeing 2001 on the big screen is genuinely a different experience. Loved every second." },
        { title: "Classic Cinema Night: Kubrick Double Feature",email: "jordan.scott@uevents.dev",   content: "Dr. Strangelove at midnight with a crowd that gets it? Cinema doesn't get better than that." },
        { title: "Rapid Championship — Spring Edition",        email: "antoine.leblanc@uevents.dev", content: "Went 5.5/7 — best tournament result I've had. The competition this semester has been incredible." },
    ];

    let commentCount = 0;
    for (const { title, email, content } of commentData) {
        const postId = allPostByTitle[title];
        const userId = studentById[email];
        if (!postId || !userId) continue;
        const existing = await prisma.comment.findFirst({ where: { postId, userId, content } });
        if (!existing) {
            await prisma.comment.create({ data: { postId, userId, content } });
            commentCount++;
        }
    }

    // ── Poll votes ───────────────────────────────────────────────────────────
    const pollTitles = [
        "Which director should we spotlight next semester?",
        "What should our next big initiative be?",
        "What cuisine should we do for the next popup?",
        "Preferred practice time next semester?",
    ];
    const pollPosts = await prisma.post.findMany({
        where: { type: "POLL" },
        include: { pollOptions: true },
    });

    const pollVotes: { postTitle: string; votes: { email: string; optionIndex: number }[] }[] = [
        {
            postTitle: "Which director should we spotlight next semester?",
            votes: [
                { email: "theo.marchand@uevents.dev",  optionIndex: 0 },
                { email: "emma.rivera@uevents.dev",    optionIndex: 1 },
                { email: "isabelle.lavoie@uevents.dev",optionIndex: 1 },
                { email: "chloe.bergeron@uevents.dev", optionIndex: 3 },
                { email: "zoe.tremblay@uevents.dev",   optionIndex: 0 },
                { email: "jordan.scott@uevents.dev",   optionIndex: 2 },
            ],
        },
        {
            postTitle: "What should our next big initiative be?",
            votes: [
                { email: "nadia.kowalski@uevents.dev", optionIndex: 2 },
                { email: "lily.chen@uevents.dev",      optionIndex: 0 },
                { email: "sarah.jenkins@uevents.dev",  optionIndex: 0 },
                { email: "isabelle.lavoie@uevents.dev",optionIndex: 3 },
                { email: "mateo.gonzalez@uevents.dev", optionIndex: 2 },
            ],
        },
        {
            postTitle: "What cuisine should we do for the next popup?",
            votes: [
                { email: "prisha.sharma@uevents.dev",  optionIndex: 2 },
                { email: "chloe.bergeron@uevents.dev", optionIndex: 0 },
                { email: "zoe.tremblay@uevents.dev",   optionIndex: 1 },
                { email: "lily.chen@uevents.dev",      optionIndex: 2 },
                { email: "theo.marchand@uevents.dev",  optionIndex: 3 },
            ],
        },
        {
            postTitle: "Preferred practice time next semester?",
            votes: [
                { email: "felix.huang@uevents.dev",    optionIndex: 1 },
                { email: "mateo.gonzalez@uevents.dev", optionIndex: 0 },
                { email: "noah.williams@uevents.dev",  optionIndex: 1 },
                { email: "james.okafor@uevents.dev",   optionIndex: 2 },
            ],
        },
    ];

    let voteCount = 0;
    for (const { postTitle, votes } of pollVotes) {
        const poll = pollPosts.find((p) => ((p.locales as any)?.en?.title ?? "") === postTitle);
        if (!poll) continue;
        for (const { email, optionIndex } of votes) {
            const userId = studentById[email];
            const option = poll.pollOptions[optionIndex];
            if (!userId || !option) continue;
            await prisma.pollVote.upsert({
                where: { userId_optionId: { userId, optionId: option.id } },
                update: {},
                create: { userId, optionId: option.id },
            });
            voteCount++;
        }
    }

    console.log(`\nShowcase seed complete:`);
    console.log(`  ${newClubsData.length} new clubs`);
    console.log(`  ${extraStudents.length} new students`);
    console.log(`  ${postCount} new posts`);
    console.log(`  ${followCount} new follows`);
    console.log(`  ${rsvpCount} new RSVPs`);
    console.log(`  ${likeCount} new likes`);
    console.log(`  ${commentCount} new comments`);
    console.log(`  ${voteCount} new poll votes`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
