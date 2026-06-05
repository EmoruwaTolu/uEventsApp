import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding...");

    const hash = await bcrypt.hash("password123", 12);

    // ── Wipe existing data ───────────────────────────────────────────────────
    await prisma.pollVote.deleteMany();
    await prisma.pollOption.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.like.deleteMany();
    await prisma.rsvp.deleteMany();
    await prisma.bookmark.deleteMany();
    await prisma.postView.deleteMany();
    await prisma.checkIn.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.follow.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    console.log("  Wiped existing data");

    // ── Clubs ────────────────────────────────────────────────────────────────
    const clubsData = [
        { email: "cssa@uottawa.ca", clubName: "CSSA / AEI", slug: "cssa", category: "Academic", description: "The Computer Science Student Association represents CS students and organizes academic and social events throughout the year.", logoUrl: "https://picsum.photos/seed/cssa/200/200", instagram: "uottawa_cssa", twitter: "uottawa_cssa", contactEmail: "cssa@uottawa.ca" },
        { email: "csclub@uottawa.ca", clubName: "CS Club", slug: "cs-club", category: "Technology", description: "Weekly coding sessions, hackathons, and tech talks for students passionate about software.", logoUrl: "https://picsum.photos/seed/csclub/200/200", instagram: "uottawa_csclub", contactEmail: "csclub@uottawa.ca" },
        { email: "fitness@uottawa.ca", clubName: "Campus Fitness", slug: "campus-fitness", category: "Health & Wellness", description: "Group workouts, yoga sessions, and wellness challenges open to all students.", logoUrl: "https://picsum.photos/seed/fitness/200/200", instagram: "uottawa_fitness" },
        { email: "gamedev@uottawa.ca", clubName: "Game Dev Society", slug: "game-dev", category: "Technology", description: "Build games, learn engines like Unity & Godot, and ship projects every semester.", logoUrl: "https://picsum.photos/seed/gamedev/200/200", instagram: "uottawa_gamedev" },
        { email: "debate@uottawa.ca", clubName: "Debate Club", slug: "debate", category: "Arts & Culture", description: "Sharpen your argumentation and public speaking at weekly practice rounds and tournaments.", logoUrl: "https://picsum.photos/seed/debate/200/200", contactEmail: "debate@uottawa.ca" },
        { email: "music@uottawa.ca", clubName: "Music Collective", slug: "music", category: "Arts & Culture", description: "A community of musicians, producers, and music lovers. Open mics, jam sessions, and end-of-semester concerts.", logoUrl: "https://picsum.photos/seed/music/200/200", instagram: "uottawa_music" },
        { email: "entrepreneurship@uottawa.ca", clubName: "Entrepreneurship Hub", slug: "entrep", category: "Business", description: "From idea to launch. We run pitch nights, startup workshops, and connect students with mentors in the startup ecosystem.", logoUrl: "https://picsum.photos/seed/entrep/200/200", instagram: "uottawa_entrep", contactEmail: "entrepreneurship@uottawa.ca" },
        { email: "photo@uottawa.ca", clubName: "Photography Society", slug: "photo", category: "Arts & Culture", description: "Weekly photo walks, darkroom access, critique sessions, and an annual gallery show. All skill levels welcome.", logoUrl: "https://picsum.photos/seed/photo/200/200", instagram: "uottawa_photo" },
        { email: "ess@uottawa.ca", clubName: "Engineering Students Society", slug: "ess", category: "Engineering", description: "Representing all engineering students at uOttawa with social events, career fairs, and academic support.", logoUrl: "https://picsum.photos/seed/ess/200/200", instagram: "uottawa_ess", contactEmail: "ess@uottawa.ca" },
        { email: "iso@uottawa.ca", clubName: "International Students Organization", slug: "iso", category: "Cultural", description: "Connecting international students across campus through cultural exchanges, buddy programs, and community events.", logoUrl: "https://picsum.photos/seed/iso/200/200", instagram: "uottawa_iso", contactEmail: "iso@uottawa.ca" },
        { email: "lsa@uottawa.ca", clubName: "Law Students Association", slug: "lsa", category: "Academic", description: "Supporting law students with events, networking, and academic resources at uOttawa.", logoUrl: "https://picsum.photos/seed/lsa/200/200", contactEmail: "lsa@uottawa.ca" },
        { email: "bsa@uottawa.ca", clubName: "Black Students Association", slug: "bsa", category: "Cultural", description: "Building community, celebrating culture, and advocating for Black students at uOttawa.", logoUrl: "https://picsum.photos/seed/bsa/200/200", instagram: "uottawa_bsa", contactEmail: "bsa@uottawa.ca" },
        { email: "premed@uottawa.ca", clubName: "Pre-Med Society", slug: "premed", category: "Academic", description: "Preparing future physicians with MCAT resources, hospital shadowing opportunities, and peer support.", logoUrl: "https://picsum.photos/seed/premed/200/200", instagram: "uottawa_premed", contactEmail: "premed@uottawa.ca" },
        { email: "film@uottawa.ca", clubName: "uOttawa Film Club", slug: "film", category: "Arts & Culture", description: "Screening, discussing, and creating film on campus. From blockbusters to student shorts.", logoUrl: "https://picsum.photos/seed/film/200/200", instagram: "uottawa_film" },
        { email: "eag@uottawa.ca", clubName: "Environmental Action Group", slug: "eag", category: "Social", description: "Advocating for sustainability and climate action at uOttawa through campaigns, events, and community organizing.", logoUrl: "https://picsum.photos/seed/eag/200/200", instagram: "uottawa_eag", contactEmail: "eag@uottawa.ca" },
        { email: "winstem@uottawa.ca", clubName: "Women in STEM", slug: "winstem", category: "Technology", description: "Empowering women and non-binary students in science and tech through mentorship, workshops, and networking.", logoUrl: "https://picsum.photos/seed/winstem/200/200", instagram: "uottawa_winstem", contactEmail: "winstem@uottawa.ca" },
        { email: "acsa@uottawa.ca", clubName: "Afro-Caribbean Students Association", slug: "acsa", category: "Cultural", description: "Celebrating Afro-Caribbean heritage through culture, food, music, and community at uOttawa.", logoUrl: "https://picsum.photos/seed/acsa/200/200", instagram: "uottawa_acsa" },
        { email: "ifc@uottawa.ca", clubName: "Investment & Finance Club", slug: "ifc", category: "Business", description: "Hands-on investing, market analysis, and finance networking for students at uOttawa.", logoUrl: "https://picsum.photos/seed/ifc/200/200", instagram: "uottawa_ifc", contactEmail: "ifc@uottawa.ca" },
    ];

    const clubs: Record<string, { id: string }> = {};
    for (const c of clubsData) {
        const club = await prisma.user.create({
            data: {
                email: c.email,
                passwordHash: hash,
                type: "CLUB",
                clubName: c.clubName,
                slug: c.slug,
                category: c.category,
                description: c.description,
                logoUrl: c.logoUrl,
                instagram: (c as any).instagram ?? null,
                twitter: (c as any).twitter ?? null,
                contactEmail: (c as any).contactEmail ?? null,
            },
        });
        clubs[c.slug] = club;
    }
    console.log(`  Created ${clubsData.length} clubs`);

    // ── Students ─────────────────────────────────────────────────────────────
    const studentsData = [
        { email: "student@uottawa.ca", firstName: "Alex", lastName: "Chen", program: "Computer Science", year: "3rd Year", avatarUrl: "https://picsum.photos/seed/student/200/200" },
        { email: "priya@uottawa.ca", firstName: "Priya", lastName: "Sharma", program: "Biomedical Engineering", year: "2nd Year", avatarUrl: "https://picsum.photos/seed/priya/200/200" },
        { email: "marcus@uottawa.ca", firstName: "Marcus", lastName: "Williams", program: "Political Science", year: "4th Year", avatarUrl: "https://picsum.photos/seed/marcus/200/200" },
        { email: "sophie@uottawa.ca", firstName: "Sophie", lastName: "Tremblay", program: "Common Law", year: "1st Year", avatarUrl: "https://picsum.photos/seed/sophie/200/200" },
        { email: "kwame@uottawa.ca", firstName: "Kwame", lastName: "Asante", program: "Computer Science", year: "2nd Year", avatarUrl: "https://picsum.photos/seed/kwame/200/200" },
        { email: "isabelle@uottawa.ca", firstName: "Isabelle", lastName: "Martin", program: "Business", year: "3rd Year", avatarUrl: "https://picsum.photos/seed/isabelle/200/200" },
        { email: "ryan@uottawa.ca", firstName: "Ryan", lastName: "O'Brien", program: "Mechanical Engineering", year: "2nd Year", avatarUrl: "https://picsum.photos/seed/ryan/200/200" },
        { email: "aisha@uottawa.ca", firstName: "Aisha", lastName: "Ndiaye", program: "International Development", year: "3rd Year", avatarUrl: "https://picsum.photos/seed/aisha/200/200" },
        { email: "lucas@uottawa.ca", firstName: "Lucas", lastName: "Bergeron", program: "Software Engineering", year: "1st Year", avatarUrl: "https://picsum.photos/seed/lucas/200/200" },
        { email: "fatima@uottawa.ca", firstName: "Fatima", lastName: "Al-Hassan", program: "Nursing", year: "2nd Year", avatarUrl: "https://picsum.photos/seed/fatima/200/200" },
        { email: "daniel@uottawa.ca", firstName: "Daniel", lastName: "Park", program: "Computer Science", year: "4th Year", avatarUrl: "https://picsum.photos/seed/daniel/200/200" },
        { email: "camille@uottawa.ca", firstName: "Camille", lastName: "Dubois", program: "Communications", year: "2nd Year", avatarUrl: "https://picsum.photos/seed/camille/200/200" },
        { email: "jordan@uottawa.ca", firstName: "Jordan", lastName: "Thompson", program: "Psychology", year: "3rd Year", avatarUrl: "https://picsum.photos/seed/jordan/200/200" },
        { email: "mei@uottawa.ca", firstName: "Mei", lastName: "Zhang", program: "Biochemistry", year: "1st Year", avatarUrl: "https://picsum.photos/seed/mei/200/200" },
        { email: "tariq@uottawa.ca", firstName: "Tariq", lastName: "Hassan", program: "Civil Engineering", year: "3rd Year", avatarUrl: "https://picsum.photos/seed/tariq/200/200" },
    ];

    const students: Record<string, { id: string }> = {};
    for (const s of studentsData) {
        const st = await prisma.user.create({
            data: { email: s.email, passwordHash: hash, type: "STUDENT", firstName: s.firstName, lastName: s.lastName, program: s.program, year: s.year, avatarUrl: s.avatarUrl },
        });
        students[s.email] = st;
    }
    console.log(`  Created ${studentsData.length} students`);

    // ── Image URLs ───────────────────────────────────────────────────────────
    const IMG = {
        gala:        "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&fit=crop",
        hackathon:   "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&fit=crop",
        fitness:     "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&fit=crop",
        concert:     "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&fit=crop",
        campus:      "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=800&fit=crop",
        food:        "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&fit=crop",
        networking:  "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&fit=crop",
        law:         "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&fit=crop",
        photo:       "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=800&fit=crop",
        engineering: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&fit=crop",
        film:        "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&fit=crop",
        nature:      "https://images.unsplash.com/photo-1542601906897-edc1a62d6b5a?w=800&fit=crop",
        winstem:     "https://images.unsplash.com/photo-1573164713712-03790a178651?w=800&fit=crop",
        carnival:    "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&fit=crop",
        finance:     "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&fit=crop",
        medical:     "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&fit=crop",
        englab:      "https://images.unsplash.com/photo-1581092335397-9583eb92d232?w=800&fit=crop",
        intlfood:    "https://images.unsplash.com/photo-1516714435131-44d6b64dc6a2?w=800&fit=crop",
        dance:       "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&fit=crop",
        study:       "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&fit=crop",
    };

    // ── Posts ────────────────────────────────────────────────────────────────
    const now = new Date();
    const day = (n: number) => new Date(now.getTime() + n * 86400000);
    const at = (n: number, h: number, m = 0) => new Date(new Date(day(n)).setHours(h, m, 0, 0));
    const img = (url: string) => ({ posterUrl: url });

    type PostSeed = {
        clubId: string;
        type: "EVENT" | "ANNOUNCEMENT" | "UPDATE" | "POLL";
        isDraft: boolean;
        locales: any;
        startAt?: Date;
        endAt?: Date;
        locationName?: string;
        address?: string;
        categories: string[];
        images?: string[];
        isPinned?: boolean;
        capacity?: number;
        pollExpiresAt?: Date;
        pollAllowMultiple?: boolean;
        pollOptions?: { textEn: string; textFr?: string }[];
    };

    const posts: PostSeed[] = [
        // ── EXISTING EVENTS (kept, with real images added) ─────────────────
        { clubId: clubs["campus-fitness"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Morning Yoga Session", body: "Unwind and recharge with a guided yoga flow. Bring your mat and a bottle of water. All levels welcome.", ...img(IMG.fitness) } }, startAt: at(0, 7, 30), endAt: at(0, 8, 30), locationName: "Gym Room 3", address: "Sports Complex", categories: ["Wellness", "Fitness"], images: [IMG.fitness] },
        { clubId: clubs["music"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Open Mic Night", body: "All genres, all instruments, all voices. Sign up at the door — slots fill fast. Come early to grab a seat.", ...img(IMG.concert) } }, startAt: at(0, 19, 0), endAt: at(0, 22, 0), locationName: "Bronfman Atrium", address: "MB Building", categories: ["Music", "Social"], images: [IMG.concert] },
        { clubId: clubs["campus-fitness"].id, type: "EVENT", isDraft: false, locales: { en: { title: "HIIT Bootcamp", body: "High-intensity interval training with our certified instructors. Come ready to sweat. Mats and towels provided.", ...img(IMG.fitness) } }, startAt: at(1, 7, 30), endAt: at(1, 8, 30), locationName: "Sports Complex", address: "Room 14", categories: ["Fitness", "Health"], images: [IMG.fitness] },
        { clubId: clubs["cs-club"].id, type: "EVENT", isDraft: false, isPinned: true, locales: { en: { title: "Hackathon Kickoff", body: "Build something incredible in 24 hours. All skill levels welcome — form a team or fly solo. Prizes for top 3 teams.", ...img(IMG.hackathon) } }, startAt: at(1, 9, 0), endAt: at(2, 9, 0), locationName: "STEM Building", address: "STEM 101", categories: ["Hackathon", "Technology"], images: [IMG.hackathon], capacity: 120 },
        { clubId: clubs["cssa"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Midterm Study Jam", body: "Group study session with peer tutors available for algorithms, data structures, and discrete math. Snacks included.", ...img(IMG.study) } }, startAt: at(1, 11, 0), endAt: at(1, 14, 0), locationName: "Morisset Library", address: "65 University Pvt", categories: ["Academic", "Study"], images: [IMG.study] },
        { clubId: clubs["cssa"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Tech Industry Panel", body: "Hear directly from engineers at top tech companies. Q&A session open to all students. Networking reception to follow.", ...img(IMG.networking) } }, startAt: at(1, 13, 0), endAt: at(1, 15, 0), locationName: "DMS 1150", address: "Desmarais Building", categories: ["Academic", "Networking"], images: [IMG.networking] },
        { clubId: clubs["debate"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Public Speaking Workshop", body: "Practical techniques for confident speaking under pressure. Interactive exercises and live feedback from experienced debaters.", ...img(IMG.campus) } }, startAt: at(1, 17, 0), endAt: at(1, 19, 0), locationName: "UCU Room 203", address: "University Centre", categories: ["Workshop", "Arts"], images: [IMG.campus] },
        { clubId: clubs["game-dev"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Indie Dev Mixer", body: "Connect with indie developers, play demos, and pitch your game ideas. Light refreshments provided. All welcome.", ...img(IMG.networking) } }, startAt: at(1, 19, 0), endAt: at(1, 21, 0), locationName: "SITE Building", address: "800 King Edward", categories: ["Networking", "Game Dev"], images: [IMG.networking] },
        { clubId: clubs["entrep"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Pitch Night: Spring Edition", body: "Got an idea? This is your stage. 3-minute pitches, live audience voting, and feedback from a panel of founders and investors.", ...img(IMG.networking) } }, startAt: at(2, 18, 0), endAt: at(2, 21, 0), locationName: "Telfer School of Management", address: "55 Laurier Ave E", categories: ["Business", "Networking"], images: [IMG.networking] },
        { clubId: clubs["photo"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Golden Hour Photo Walk", body: "Meet at the main steps and we'll walk through campus capturing the evening light. Bring any camera — phone cameras welcome.", ...img(IMG.photo) } }, startAt: at(2, 17, 30), endAt: at(2, 19, 30), locationName: "Tabaret Hall Steps", address: "75 Laurier Ave E", categories: ["Photography", "Outdoors"], images: [IMG.photo] },
        { clubId: clubs["music"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Music Theory Workshop", body: "This week: chord progressions and how to write a hook. No prior theory knowledge needed. Bring a notebook.", ...img(IMG.concert) } }, startAt: at(2, 16, 0), endAt: at(2, 17, 30), locationName: "Perez Hall 123", address: "Perez Hall", categories: ["Music", "Workshop"], images: [IMG.concert] },
        { clubId: clubs["campus-fitness"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Lunchtime Run Club", body: "30-minute easy run around campus. Pace groups for all speeds — 5K, 10K, and first-timers. Meet outside the gym.", ...img(IMG.fitness) } }, startAt: at(3, 12, 0), endAt: at(3, 12, 45), locationName: "Montpetit Hall Entrance", address: "125 University Pvt", categories: ["Fitness", "Running"], images: [IMG.fitness] },
        { clubId: clubs["cssa"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Resume & LinkedIn Workshop", body: "Get your resume reviewed by upper-year students and recruiters. Bring a printed copy and a laptop. Spots are limited.", ...img(IMG.study) } }, startAt: at(3, 14, 0), endAt: at(3, 16, 0), locationName: "SITE 5084", address: "800 King Edward", categories: ["Academic", "Career"], images: [IMG.study] },
        { clubId: clubs["debate"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Weekly Practice Round", body: "Oxford-style debate format this week. Motion announced 30 minutes before start. New members always welcome.", ...img(IMG.campus) } }, startAt: at(3, 18, 0), endAt: at(3, 20, 0), locationName: "UCU Room 115", address: "University Centre", categories: ["Debate", "Arts"], images: [IMG.campus] },
        { clubId: clubs["entrep"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Founder Fireside: Building in Public", body: "A candid conversation with a founder who built and sold their first startup before graduation. Q&A follows.", ...img(IMG.networking) } }, startAt: at(4, 17, 30), endAt: at(4, 19, 0), locationName: "Desmarais 1120", address: "55 Laurier Ave E", categories: ["Business", "Talks"], images: [IMG.networking] },
        { clubId: clubs["photo"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Darkroom Intro Session", body: "Learn to develop black-and-white film from scratch. All materials provided. Limited to 8 participants — register early.", ...img(IMG.photo) } }, startAt: at(4, 15, 0), endAt: at(4, 17, 0), locationName: "Arts Hall Darkroom", address: "70 Laurier Ave E", categories: ["Photography", "Workshop"], images: [IMG.photo], capacity: 8 },
        { clubId: clubs["game-dev"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Game Jam: 48h Sprint", body: "Theme reveal at noon Friday. You have 48 hours to make a game from scratch. Any engine, any genre. Show up and ship.", ...img(IMG.hackathon) } }, startAt: at(5, 12, 0), endAt: at(7, 12, 0), locationName: "SITE Building Lab", address: "800 King Edward", categories: ["Game Dev", "Technology"], images: [IMG.hackathon] },
        { clubId: clubs["music"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Beat Battle – Producer Edition", body: "Producers go head to head. 2 minutes to make a beat live, audience votes live. Sign up in advance or at the door.", ...img(IMG.concert) } }, startAt: at(5, 20, 0), endAt: at(5, 23, 0), locationName: "Montpetit Atrium", address: "Montpetit Hall", categories: ["Music", "Competition"], images: [IMG.concert] },
        { clubId: clubs["campus-fitness"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Weekend Hike – Gatineau Park", body: "Easy-to-moderate trail. Carpool leaves from Tabaret Hall at 9 AM. Bring water and layers — weather-dependent.", ...img(IMG.nature) } }, startAt: at(7, 9, 0), endAt: at(7, 13, 0), locationName: "Tabaret Hall Entrance", address: "75 Laurier Ave E", categories: ["Outdoors", "Fitness"], images: [IMG.nature] },
        { clubId: clubs["cssa"].id, type: "EVENT", isDraft: false, isPinned: true, locales: { en: { title: "Winter Wonderland Ball", body: "Join us for an unforgettable evening of dancing, music, and winter magic. Formal attire required. Tickets are limited — grab yours before they sell out!", ...img(IMG.gala) } }, startAt: at(10, 19, 0), endAt: at(10, 23, 59), locationName: "Centre Rideau Ballroom", address: "50 Rideau St", categories: ["Social", "Formal"], images: [IMG.gala], capacity: 300 },
        { clubId: clubs["photo"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Annual Spring Gallery Show", body: "End-of-semester showcase of student photography. Opening night with light refreshments. All are welcome.", ...img(IMG.photo) } }, startAt: at(10, 18, 0), endAt: at(10, 21, 0), locationName: "Arts Hall Atrium Gallery", address: "70 Laurier Ave E", categories: ["Photography", "Arts"], images: [IMG.photo] },
        { clubId: clubs["entrep"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Startup Weekend uOttawa", body: "54 hours to build a startup from scratch. Teams form Friday night, demo Sunday afternoon. All disciplines welcome.", ...img(IMG.networking) } }, startAt: at(14, 18, 0), endAt: at(16, 17, 0), locationName: "Desmarais Building", address: "55 Laurier Ave E", categories: ["Business", "Hackathon"], images: [IMG.networking] },

        // ── NEW CLUB EVENTS ────────────────────────────────────────────────
        { clubId: clubs["ess"].id, type: "EVENT", isDraft: false, isPinned: true, locales: { en: { title: "Engineering Design Showcase", body: "The biggest showcase of the year — capstone projects, senior designs, and student innovations on display. Industry recruiters in attendance.", ...img(IMG.englab) } }, startAt: at(6, 14, 0), endAt: at(6, 18, 0), locationName: "SITE Atrium", address: "800 King Edward Ave", categories: ["Engineering", "Showcase"], images: [IMG.englab], capacity: 200 },
        { clubId: clubs["ess"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Bridge Building Competition", body: "Teams of 3 compete to build the strongest bridge using only popsicle sticks and glue. Prizes for top three teams.", ...img(IMG.engineering) } }, startAt: at(18, 13, 0), endAt: at(18, 16, 0), locationName: "CBY Building", address: "161 Louis-Pasteur Pvt", categories: ["Engineering", "Competition"], images: [IMG.engineering] },
        { clubId: clubs["iso"].id, type: "EVENT", isDraft: false, locales: { en: { title: "International Food Festival", body: "20+ countries, 20+ dishes. Come eat your way around the world right here on campus. Free entry, food samples are free while supplies last.", ...img(IMG.intlfood) } }, startAt: at(4, 11, 0), endAt: at(4, 15, 0), locationName: "UCU Atrium", address: "85 University Pvt", categories: ["Cultural", "Food"], images: [IMG.intlfood], capacity: 400 },
        { clubId: clubs["iso"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Cultural Exchange Night", body: "A night of performances, traditional dress, and storytelling from international students. Live music and a photography exhibition.", ...img(IMG.carnival) } }, startAt: at(20, 18, 0), endAt: at(20, 22, 0), locationName: "Tabaret Hall", address: "75 Laurier Ave E", categories: ["Cultural", "Social"], images: [IMG.carnival] },
        { clubId: clubs["lsa"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Mock Trial Competition", body: "Real courtroom, real roles, real pressure. Open to law and non-law students. Judges include practicing attorneys.", ...img(IMG.law) } }, startAt: at(8, 9, 0), endAt: at(8, 17, 0), locationName: "Fauteux Hall Moot Court", address: "57 Louis-Pasteur Pvt", categories: ["Academic", "Law"], images: [IMG.law] },
        { clubId: clubs["lsa"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Law & Technology Networking Mixer", body: "Meet lawyers, tech founders, and policy makers at the intersection of law and tech. Open bar for the first hour.", ...img(IMG.networking) } }, startAt: at(15, 18, 0), endAt: at(15, 21, 0), locationName: "Fauteux Hall Atrium", address: "57 Louis-Pasteur Pvt", categories: ["Networking", "Law"], images: [IMG.networking] },
        { clubId: clubs["bsa"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Black Excellence Gala", body: "An elegant celebration of Black students, culture, and achievement at uOttawa. Semi-formal attire. Tickets available at the door.", ...img(IMG.gala) } }, startAt: at(3, 19, 0), endAt: at(3, 23, 0), locationName: "UCU Ballroom", address: "85 University Pvt", categories: ["Cultural", "Social"], images: [IMG.gala], capacity: 150 },
        { clubId: clubs["bsa"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Afrobeats Dance Night", body: "DJs, dancing, and good vibes. All genres from across the diaspora. Come with your squad.", ...img(IMG.dance) } }, startAt: at(12, 21, 0), endAt: at(13, 2, 0), locationName: "Café Alt", address: "85 University Pvt", categories: ["Cultural", "Music"], images: [IMG.dance] },
        { clubId: clubs["premed"].id, type: "EVENT", isDraft: false, locales: { en: { title: "MCAT Study Boot Camp", body: "Full-day intensive prep session covering Bio, Chem, CARS, and Psych sections. Practice exams and timed drills.", ...img(IMG.medical) } }, startAt: at(5, 9, 0), endAt: at(5, 17, 0), locationName: "Morisset Library, Room 216", address: "65 University Pvt", categories: ["Academic", "Health"], images: [IMG.medical] },
        { clubId: clubs["premed"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Hospital Shadowing Info Session", body: "Learn how to apply for shadowing opportunities at The Ottawa Hospital and Montfort. Q&A with 4th-year students.", ...img(IMG.medical) } }, startAt: at(9, 17, 0), endAt: at(9, 18, 30), locationName: "RGN 2006", address: "Roger Guindon Hall", categories: ["Academic", "Health"], images: [IMG.medical] },
        { clubId: clubs["film"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Student Short Film Screening", body: "An evening of original short films made by uOttawa students. Director Q&As follow each screening. Popcorn provided.", ...img(IMG.film) } }, startAt: at(7, 19, 0), endAt: at(7, 22, 0), locationName: "FSS Auditorium", address: "120 University Pvt", categories: ["Film", "Arts"], images: [IMG.film] },
        { clubId: clubs["eag"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Campus Clean-Up Day", body: "Grab a pair of gloves and help us make campus greener. We'll collect litter, plant wildflowers, and end with a BBQ.", ...img(IMG.nature) } }, startAt: at(11, 10, 0), endAt: at(11, 13, 0), locationName: "Tabaret Lawn", address: "75 Laurier Ave E", categories: ["Environment", "Social"], images: [IMG.nature] },
        { clubId: clubs["winstem"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Mentorship Speed Networking", body: "Meet 10 mentors in 60 minutes. Industry professionals from software, biotech, and data science. All STEM students welcome.", ...img(IMG.winstem) } }, startAt: at(14, 17, 0), endAt: at(14, 19, 30), locationName: "SITE 5084", address: "800 King Edward Ave", categories: ["Networking", "Technology"], images: [IMG.winstem], capacity: 80 },
        { clubId: clubs["acsa"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Carnival Night", body: "A night of Caribbean vibes — food, music, dancing, and costumes. Costume contest with prizes.", ...img(IMG.carnival) } }, startAt: at(10, 20, 0), endAt: at(11, 1, 0), locationName: "UCU Nightclub", address: "85 University Pvt", categories: ["Cultural", "Music"], images: [IMG.carnival] },
        { clubId: clubs["ifc"].id, type: "EVENT", isDraft: false, locales: { en: { title: "Stock Pitch Competition", body: "Teams pitch a real stock — buy or sell — to a panel of finance professionals. Top team wins a Bloomberg terminal subscription.", ...img(IMG.finance) } }, startAt: at(16, 13, 0), endAt: at(16, 17, 0), locationName: "Telfer School of Management", address: "55 Laurier Ave E", categories: ["Business", "Finance"], images: [IMG.finance] },

        // ── ANNOUNCEMENTS & UPDATES ────────────────────────────────────────
        { clubId: clubs["cssa"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "New Semester, New Exec Team", body: "We're excited to introduce our new executive team for Winter 2026! Stay tuned for a packed semester of events, workshops, and opportunities." } }, categories: [] },
        { clubId: clubs["cssa"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Course Review Packages Now Available", body: "Upper-year students have compiled review packages for CSI 3105, CSI 3520, and CSI 4105. Download them from the CSSA portal before finals." } }, categories: [] },
        { clubId: clubs["cs-club"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Weekly Meeting – This Friday", body: "This week we're doing a deep-dive into system design interviews. SITE 5084, 5:30 PM. Bring your laptop!" } }, categories: [] },
        { clubId: clubs["cs-club"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Post-Hackathon Recap 🏆", body: "What a weekend. 47 teams, 12 fully shipped projects, and 3 amazing winners. Full recap and photos on our Instagram. See you at the next one.", ...img(IMG.hackathon) } }, categories: [], images: [IMG.hackathon] },
        { clubId: clubs["game-dev"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Our game hit 500 downloads!", body: "The game we shipped last semester just crossed 500 downloads on itch.io. Huge shoutout to everyone who contributed. More to come this semester!" } }, categories: [] },
        { clubId: clubs["game-dev"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Demo Day Results Are In 🎮", body: "Incredible work from all teams at last week's demo day. Check the site for scores and video recordings of every demo." } }, categories: [] },
        { clubId: clubs["music"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "End-of-Semester Concert – Save the Date", body: "We're planning our biggest concert yet. More details coming soon. In the meantime, auditions for featured performers open next week.", ...img(IMG.concert) } }, categories: [], images: [IMG.concert] },
        { clubId: clubs["music"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Ticket Presale Link is Live", body: "Presale for the Spring Concert is now open exclusively for club members. Link in bio — 48 hours only." } }, categories: [] },
        { clubId: clubs["entrep"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Applications Open: Startup Mentorship Program", body: "We've partnered with 12 local founders to offer 1-on-1 mentorship this semester. Applications close in two weeks. Apply on our website." } }, categories: [] },
        { clubId: clubs["entrep"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Pitch Night Results 🥇", body: "Congrats to the 3 winning teams from last night's Pitch Night! Full rankings and investor feedback decks will be sent to all participants." } }, categories: [] },
        { clubId: clubs["photo"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "New Equipment Available in the Lab", body: "We just received two new mirrorless cameras available to members on loan. Come by during open lab hours to sign one out." } }, categories: [] },
        { clubId: clubs["debate"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Regional Tournament Qualifiers – Registration Open", body: "We're sending two teams to the intercollegiate regional tournament in April. Tryout rounds are this week — come prepared." } }, categories: [] },
        { clubId: clubs["debate"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "We Won Regionals! 🏆", body: "Huge congratulations to our A-team for taking first place at the Ontario Intercollegiate Debate Championship. The campus is proud." } }, categories: [] },
        { clubId: clubs["campus-fitness"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "New Winter Class Schedule", body: "Updated timetable is live! We've added two new time slots for yoga and a Sunday evening HIIT. Full schedule on our website.", ...img(IMG.fitness) } }, categories: [], images: [IMG.fitness] },
        // New clubs
        { clubId: clubs["ess"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Lab Access Hours Extended", body: "The EECS student lab is now open until midnight on weekdays for ESS members. Bring your student card for after-hours access." } }, categories: [] },
        { clubId: clubs["ess"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "New Peer Tutoring Program Launched", body: "Struggling with Circuits II or Thermodynamics? We've launched a free peer tutoring program. Book a slot through our website." } }, categories: [] },
        { clubId: clubs["ess"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "ESS Engineering Week is Coming 🔧", body: "Mark your calendars — Engineering Week is the last week of March. Events, competitions, and the famous Hard Hat Ball are all on the agenda." } }, categories: [] },
        { clubId: clubs["iso"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Buddy Program Now Open", body: "Pair up with a local student who'll help you settle in — from navigating campus to exploring Ottawa. Sign up through the link in our bio." } }, categories: [] },
        { clubId: clubs["iso"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "International Student Resource Guide Updated", body: "We've refreshed our guide with new info on health coverage, co-op permits, and off-campus housing. Download it from our website." } }, categories: [] },
        { clubId: clubs["lsa"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Moot Court Team Applications Open", body: "Apply to represent uOttawa at the Jessup International Law Moot Court Competition. Deadline is Friday — applications on our website." } }, categories: [] },
        { clubId: clubs["lsa"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Bar & Bench Speaker Series – Next Up: Criminal Law", body: "Join us next Thursday for a fireside with a Crown attorney and defense counsel who'll discuss life in the courtroom. All welcome." } }, categories: [] },
        { clubId: clubs["bsa"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "New Exec Team Announced 🙌", body: "We're thrilled to introduce the 2026 BSA executive team. Say hello to your new President, VP Events, VP Finance, and more!" } }, categories: [] },
        { clubId: clubs["bsa"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Scholarship Applications Now Open", body: "The BSA bursary program is accepting applications for students in financial need. $500–$2,000 awards available. Deadline: March 15." } }, categories: [] },
        { clubId: clubs["premed"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "MCAT Resource Library Now Live", body: "We've compiled free MCAT prep materials, practice tests, and study schedules — all in one place on our website. Completely free for members." } }, categories: [] },
        { clubId: clubs["premed"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "New Club Advisor Announced", body: "We're excited to welcome Dr. Sarah Moreau, Faculty of Medicine, as our new faculty advisor. She'll be attending office hours monthly." } }, categories: [] },
        { clubId: clubs["film"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Equipment Rental Policy Updated", body: "We've streamlined the camera rental process. Members can now book equipment online up to 5 days in advance. DSLR, mirrorless, and lighting kits available." } }, categories: [] },
        { clubId: clubs["film"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Screening Room Bookings Now Open", body: "The FSS mini-screening room is now available for club project screenings and study sessions. Book your 2-hour slot through the portal." } }, categories: [] },
        { clubId: clubs["eag"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Petition Reaches 1,000 Signatures 🌿", body: "Our campus composting petition crossed 1,000 signatures this week! We're meeting with the administration on Friday. Thank you for your support." } }, categories: [] },
        { clubId: clubs["eag"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "New Composting Bins Installed on Campus", body: "After months of advocacy, the university has installed 12 new composting bins across campus. A small win for a greener uOttawa." } }, categories: [] },
        { clubId: clubs["winstem"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Welcome Back from the Exec Team 👋", body: "A new semester means new events, new mentors, and new opportunities. Follow our Instagram and check our website for the full calendar.", ...img(IMG.winstem) } }, categories: [], images: [IMG.winstem] },
        { clubId: clubs["winstem"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Mentorship Matching Now Open", body: "Apply to be matched with a mentor in your field — industry professionals from software engineering, research, and biotech. Spots are limited." } }, categories: [] },
        { clubId: clubs["acsa"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "New Merch Drop 🔥", body: "Our new ACSA hoodies and tees are finally here. Pre-order through the link in our bio before Thursday — only 50 units available." } }, categories: [] },
        { clubId: clubs["acsa"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Recap: First Social of the Year 🎉", body: "What a night! Over 200 students came out to kick off the semester with us. Photos are up on our Instagram. Thank you all for the energy.", ...img(IMG.dance) } }, categories: [], images: [IMG.dance] },
        { clubId: clubs["ifc"].id, type: "ANNOUNCEMENT", isDraft: false, locales: { en: { title: "Bloomberg Terminal Access Now Available", body: "IFC members can now access the Bloomberg Terminal in Telfer School of Management. Email us to book a 2-hour session." } }, categories: [] },
        { clubId: clubs["ifc"].id, type: "UPDATE", isDraft: false, locales: { en: { title: "Guest Speaker: Former Bay Street Analyst", body: "Join us next week for a talk from a former Goldman analyst who now runs his own fund. He'll share his journey and answer your questions." } }, categories: [] },

        // ── POLLS ──────────────────────────────────────────────────────────
        { clubId: clubs["campus-fitness"].id, type: "POLL", isDraft: false, locales: { en: { title: "What class should we add next semester?", body: "Vote for the fitness class you'd most like to see added to our schedule." } }, pollExpiresAt: day(7), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "Spin / Cycling" }, { textEn: "Pilates" }, { textEn: "HIIT" }, { textEn: "Boxing" }] },
        { clubId: clubs["music"].id, type: "POLL", isDraft: false, locales: { en: { title: "What genre should we focus on for the spring concert?", body: "Help us pick the theme — your vote shapes the setlist." } }, pollExpiresAt: day(5), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "R&B / Soul" }, { textEn: "Indie / Alternative" }, { textEn: "Hip-Hop" }, { textEn: "Classical / Jazz" }] },
        { clubId: clubs["cs-club"].id, type: "POLL", isDraft: false, locales: { en: { title: "Best time for our weekly general meeting?", body: "We're adjusting the schedule this semester — let us know what works." } }, pollExpiresAt: day(3), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "Monday 5–6 PM" }, { textEn: "Wednesday 5–6 PM" }, { textEn: "Thursday 5–6 PM" }, { textEn: "Friday 12–1 PM" }] },
        { clubId: clubs["ess"].id, type: "POLL", isDraft: false, locales: { en: { title: "What capstone project theme should we tackle next year?", body: "Help us decide the direction for the annual capstone showcase." } }, pollExpiresAt: day(10), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "Sustainable Infrastructure" }, { textEn: "Smart City Technology" }, { textEn: "Medical Devices" }, { textEn: "Robotics & Automation" }] },
        { clubId: clubs["iso"].id, type: "POLL", isDraft: false, locales: { en: { title: "Which region should we feature next semester?", body: "Each semester we spotlight a different region. You choose!" } }, pollExpiresAt: day(8), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "East Asia" }, { textEn: "Latin America" }, { textEn: "West Africa" }, { textEn: "South Asia" }, { textEn: "Middle East & North Africa" }] },
        { clubId: clubs["lsa"].id, type: "POLL", isDraft: false, locales: { en: { title: "What area of law do you want more workshops on?", body: "We're planning our workshop series — help us prioritize." } }, pollExpiresAt: day(6), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "Corporate & Commercial" }, { textEn: "Criminal Law" }, { textEn: "International Human Rights" }, { textEn: "Environmental Law" }] },
        { clubId: clubs["bsa"].id, type: "POLL", isDraft: false, locales: { en: { title: "What event format do you prefer?", body: "Help us shape our event programming for the rest of the semester." } }, pollExpiresAt: day(5), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "Panel Discussion" }, { textEn: "Social Mixer" }, { textEn: "Workshop" }, { textEn: "Cultural Show" }] },
        { clubId: clubs["film"].id, type: "POLL", isDraft: false, locales: { en: { title: "What genre should our next student film be?", body: "We're greenlit for a new short. What should we make?" } }, pollExpiresAt: day(7), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "Horror" }, { textEn: "Comedy" }, { textEn: "Drama" }, { textEn: "Sci-Fi" }] },
        { clubId: clubs["eag"].id, type: "POLL", isDraft: false, locales: { en: { title: "Which initiative should we push for this semester?", body: "We can only focus hard on one campaign — which matters most to you?" } }, pollExpiresAt: day(9), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "Solar panels on campus" }, { textEn: "Zero-waste dining halls" }, { textEn: "Protected bike lanes" }, { textEn: "Green roof program" }] },
        { clubId: clubs["ifc"].id, type: "POLL", isDraft: false, locales: { en: { title: "Preferred workshop time slot?", body: "We want to run more workshops this semester — when works best?" } }, pollExpiresAt: day(4), pollAllowMultiple: false, categories: [], pollOptions: [{ textEn: "Weekday evenings (6–8 PM)" }, { textEn: "Saturday mornings (10 AM)" }, { textEn: "Sunday afternoons (2 PM)" }, { textEn: "Lunch hours (12–1 PM)" }] },
    ];

    // Create all posts
    const createdPosts: Record<string, { id: string }> = {};
    for (const p of posts) {
        const { pollOptions, ...postData } = p as any;
        const created = await prisma.post.create({
            data: {
                ...postData,
                pollOptions: pollOptions?.length ? { create: pollOptions } : undefined,
            },
        });
        const title = (p.locales as any).en.title;
        createdPosts[title] = created;
    }
    console.log(`  Created ${posts.length} posts`);

    // ── Follows ──────────────────────────────────────────────────────────────
    const followMap: Record<string, string[]> = {
        "student@uottawa.ca": ["cssa", "cs-club", "campus-fitness", "game-dev", "music", "ess", "iso", "ifc"],
        "priya@uottawa.ca":   ["premed", "winstem", "campus-fitness", "ess", "eag", "iso"],
        "marcus@uottawa.ca":  ["bsa", "debate", "lsa", "iso", "eag", "acsa", "music"],
        "sophie@uottawa.ca":  ["lsa", "debate", "bsa", "iso", "music", "eag"],
        "kwame@uottawa.ca":   ["cs-club", "cssa", "game-dev", "ess", "winstem", "ifc", "iso"],
        "isabelle@uottawa.ca":["ifc", "entrep", "bsa", "acsa", "winstem", "music", "photo"],
        "ryan@uottawa.ca":    ["ess", "campus-fitness", "game-dev", "cs-club", "eag", "ifc"],
        "aisha@uottawa.ca":   ["iso", "bsa", "acsa", "eag", "debate", "winstem", "music"],
        "lucas@uottawa.ca":   ["cs-club", "cssa", "game-dev", "ess", "winstem", "ifc"],
        "fatima@uottawa.ca":  ["premed", "campus-fitness", "winstem", "iso", "acsa", "bsa"],
        "daniel@uottawa.ca":  ["cs-club", "cssa", "ess", "ifc", "game-dev", "entrep"],
        "camille@uottawa.ca": ["photo", "film", "music", "acsa", "bsa", "iso", "debate"],
        "jordan@uottawa.ca":  ["campus-fitness", "debate", "music", "eag", "iso", "bsa"],
        "mei@uottawa.ca":     ["premed", "winstem", "campus-fitness", "iso", "eag", "cssa"],
        "tariq@uottawa.ca":   ["ess", "campus-fitness", "eag", "ifc", "cs-club", "iso"],
    };

    for (const [email, slugs] of Object.entries(followMap)) {
        const studentRecord = students[email];
        if (!studentRecord) continue;
        for (const slug of slugs) {
            if (!clubs[slug]) continue;
            await prisma.follow.create({
                data: { userId: studentRecord.id, clubId: clubs[slug].id, notifPref: "ALL" },
            });
        }
    }
    console.log("  Created follows");

    // ── Engagement helpers ───────────────────────────────────────────────────
    const allStudentIds = Object.values(students).map((s) => s.id);

    function pickN<T>(arr: T[], n: number): T[] {
        const copy = [...arr];
        copy.sort(() => Math.random() - 0.5);
        return copy.slice(0, Math.min(n, copy.length));
    }

    function postId(title: string): string | null {
        return createdPosts[title]?.id ?? null;
    }

    // ── Likes ────────────────────────────────────────────────────────────────
    const likeTargets: [string, number][] = [
        ["Winter Wonderland Ball", 15],
        ["Hackathon Kickoff", 15],
        ["Engineering Design Showcase", 14],
        ["Black Excellence Gala", 13],
        ["International Food Festival", 14],
        ["Carnival Night", 13],
        ["Post-Hackathon Recap 🏆", 12],
        ["Beat Battle – Producer Edition", 12],
        ["Afrobeats Dance Night", 13],
        ["End-of-Semester Concert – Save the Date", 11],
        ["Pitch Night: Spring Edition", 11],
        ["Startup Weekend uOttawa", 10],
        ["Stock Pitch Competition", 10],
        ["We Won Regionals! 🏆", 12],
        ["Our game hit 500 downloads!", 10],
        ["Annual Spring Gallery Show", 9],
        ["MCAT Study Boot Camp", 10],
        ["Mentorship Speed Networking", 9],
        ["Petition Reaches 1,000 Signatures 🌿", 12],
        ["Welcome Back from the Exec Team 👋", 8],
        ["Recap: First Social of the Year 🎉", 13],
        ["New Exec Team Announced 🙌", 9],
        ["Ticket Presale Link is Live", 9],
        ["Afrobeats Dance Night", 13],
        ["Cultural Exchange Night", 10],
        ["Mock Trial Competition", 8],
        ["Law & Technology Networking Mixer", 8],
        ["MCAT Study Boot Camp", 10],
        ["Student Short Film Screening", 9],
        ["Campus Clean-Up Day", 9],
        ["New Merch Drop 🔥", 11],
        ["Moot Court Team Applications Open", 7],
        ["Scholarship Applications Now Open", 8],
        ["Bloomberg Terminal Access Now Available", 7],
        ["Lab Access Hours Extended", 6],
        ["Bridge Building Competition", 8],
        ["Golden Hour Photo Walk", 7],
        ["Open Mic Night", 10],
        ["Indie Dev Mixer", 7],
        ["Founder Fireside: Building in Public", 8],
        ["Midterm Study Jam", 8],
        ["Tech Industry Panel", 9],
        ["Resume & LinkedIn Workshop", 8],
        ["Music Theory Workshop", 7],
        ["Game Jam: 48h Sprint", 9],
    ];

    for (const [title, count] of likeTargets) {
        const pid = postId(title);
        if (!pid) continue;
        const voters = pickN(allStudentIds, count);
        if (voters.length) {
            await prisma.like.createMany({
                data: voters.map((uid) => ({ userId: uid, postId: pid })),
                skipDuplicates: true,
            });
        }
    }
    console.log("  Created likes");

    // ── RSVPs ────────────────────────────────────────────────────────────────
    const rsvpTargets: [string, number][] = [
        ["Winter Wonderland Ball", 15],
        ["Hackathon Kickoff", 14],
        ["Engineering Design Showcase", 14],
        ["Black Excellence Gala", 13],
        ["International Food Festival", 15],
        ["Carnival Night", 12],
        ["Startup Weekend uOttawa", 11],
        ["Stock Pitch Competition", 10],
        ["Afrobeats Dance Night", 12],
        ["Law & Technology Networking Mixer", 10],
        ["Mentorship Speed Networking", 11],
        ["MCAT Study Boot Camp", 10],
        ["Mock Trial Competition", 9],
        ["Open Mic Night", 11],
        ["Beat Battle – Producer Edition", 10],
        ["Annual Spring Gallery Show", 9],
        ["Student Short Film Screening", 9],
        ["Cultural Exchange Night", 11],
        ["Pitch Night: Spring Edition", 9],
        ["Campus Clean-Up Day", 8],
        ["Midterm Study Jam", 9],
        ["Tech Industry Panel", 10],
        ["Resume & LinkedIn Workshop", 9],
        ["Bridge Building Competition", 8],
        ["HIIT Bootcamp", 9],
        ["Morning Yoga Session", 8],
        ["Lunchtime Run Club", 8],
        ["Weekend Hike – Gatineau Park", 9],
        ["Darkroom Intro Session", 5],
        ["Hospital Shadowing Info Session", 8],
        ["Game Jam: 48h Sprint", 10],
        ["Golden Hour Photo Walk", 7],
    ];

    for (const [title, count] of rsvpTargets) {
        const pid = postId(title);
        if (!pid) continue;
        const attendees = pickN(allStudentIds, count);
        if (attendees.length) {
            await prisma.rsvp.createMany({
                data: attendees.map((uid) => ({ userId: uid, postId: pid })),
                skipDuplicates: true,
            });
        }
    }
    console.log("  Created RSVPs");

    // ── Poll Votes ───────────────────────────────────────────────────────────
    // Fetch created polls and their options
    const allPolls = await prisma.post.findMany({
        where: { type: "POLL", isDraft: false },
        include: { pollOptions: true },
    });

    for (const poll of allPolls) {
        if (!poll.pollOptions.length) continue;
        const voters = pickN(allStudentIds, Math.min(8, allStudentIds.length));
        for (const voterId of voters) {
            const option = poll.pollOptions[Math.floor(Math.random() * poll.pollOptions.length)];
            await prisma.pollVote.createMany({
                data: [{ userId: voterId, optionId: option.id }],
                skipDuplicates: true,
            });
        }
    }
    console.log("  Created poll votes");

    // ── Post Views (drives analytics view counts) ────────────────────────────
    const viewTargets: [string, number][] = [
        ["Winter Wonderland Ball", 15],
        ["Hackathon Kickoff", 15],
        ["Engineering Design Showcase", 14],
        ["International Food Festival", 14],
        ["Black Excellence Gala", 13],
        ["Carnival Night", 13],
        ["Post-Hackathon Recap 🏆", 13],
        ["Afrobeats Dance Night", 13],
        ["Recap: First Social of the Year 🎉", 13],
        ["We Won Regionals! 🏆", 12],
        ["Beat Battle – Producer Edition", 12],
        ["Petition Reaches 1,000 Signatures 🌿", 12],
        ["End-of-Semester Concert – Save the Date", 11],
        ["Pitch Night: Spring Edition", 11],
        ["Open Mic Night", 11],
        ["New Merch Drop 🔥", 11],
        ["Tech Industry Panel", 11],
        ["Startup Weekend uOttawa", 10],
        ["Stock Pitch Competition", 10],
        ["MCAT Study Boot Camp", 10],
        ["Mentorship Speed Networking", 10],
        ["Our game hit 500 downloads!", 10],
        ["Game Jam: 48h Sprint", 10],
        ["New Exec Team Announced 🙌", 9],
        ["Ticket Presale Link is Live", 9],
        ["Scholarship Applications Now Open", 9],
        ["Cultural Exchange Night", 10],
        ["Annual Spring Gallery Show", 9],
        ["Student Short Film Screening", 9],
        ["Mock Trial Competition", 9],
        ["Midterm Study Jam", 9],
        ["Resume & LinkedIn Workshop", 9],
        ["Bridge Building Competition", 8],
        ["Law & Technology Networking Mixer", 8],
        ["Welcome Back from the Exec Team 👋", 8],
        ["HIIT Bootcamp", 9],
        ["Morning Yoga Session", 8],
        ["Weekend Hike – Gatineau Park", 9],
        ["Hospital Shadowing Info Session", 8],
        ["Moot Court Team Applications Open", 8],
        ["Bloomberg Terminal Access Now Available", 7],
        ["Buddy Program Now Open", 8],
        ["Lab Access Hours Extended", 7],
        ["Music Theory Workshop", 7],
        ["Golden Hour Photo Walk", 7],
        ["Founder Fireside: Building in Public", 8],
        ["Indie Dev Mixer", 7],
        ["Public Speaking Workshop", 7],
        ["Lunchtime Run Club", 8],
        ["Campus Clean-Up Day", 8],
    ];

    for (const [title, count] of viewTargets) {
        const pid = postId(title);
        if (!pid) continue;
        const viewers = pickN(allStudentIds, count);
        if (viewers.length) {
            await prisma.postView.createMany({
                data: viewers.map((uid) => ({ userId: uid, postId: pid })),
                skipDuplicates: true,
            });
        }
    }
    console.log("  Created post views");

    // ── Comments ─────────────────────────────────────────────────────────────
    const s = students;

    type CommentSeed = {
        userId: string;
        postTitle: string;
        content: string;
        replies?: { userId: string; content: string }[];
    };

    const commentSeeds: CommentSeed[] = [
        {
            userId: s["kwame@uottawa.ca"].id,
            postTitle: "Hackathon Kickoff",
            content: "Can't wait! Are teams pre-formed or assigned on the day?",
            replies: [
                { userId: clubs["cs-club"].id, content: "Teams are formed on the day — come ready to meet new people! We'll have an icebreaker at the start 🙌" },
                { userId: s["lucas@uottawa.ca"].id, content: "I'll be going solo hoping to find a team — same boat as me?" },
            ],
        },
        {
            userId: s["student@uottawa.ca"].id,
            postTitle: "Hackathon Kickoff",
            content: "This is going to be insane 🔥 Already cleared my weekend",
        },
        {
            userId: s["isabelle@uottawa.ca"].id,
            postTitle: "Winter Wonderland Ball",
            content: "Tickets went so fast last year, where do we get them this time?",
            replies: [
                { userId: clubs["cssa"].id, content: "Link dropping in our bio this Friday at noon 👀 Don't sleep on it!" },
            ],
        },
        {
            userId: s["priya@uottawa.ca"].id,
            postTitle: "Winter Wonderland Ball",
            content: "Going with my whole floor! Cannot wait 🎉",
        },
        {
            userId: s["ryan@uottawa.ca"].id,
            postTitle: "Engineering Design Showcase",
            content: "Finally a chance to show off our capstone project. We've been working on this for months.",
            replies: [
                { userId: clubs["ess"].id, content: "We can't wait to see it! Make sure you register your project by next Wednesday." },
            ],
        },
        {
            userId: s["marcus@uottawa.ca"].id,
            postTitle: "Engineering Design Showcase",
            content: "Coming to support even though I'm poli-sci — this stuff is genuinely fascinating",
        },
        {
            userId: s["aisha@uottawa.ca"].id,
            postTitle: "International Food Festival",
            content: "Are there options for dietary restrictions? Asking for a friend 🌱",
            replies: [
                { userId: clubs["iso"].id, content: "Yes! We'll have vegan, halal, and gluten-free options at most booths. Full list on our website." },
            ],
        },
        {
            userId: s["camille@uottawa.ca"].id,
            postTitle: "International Food Festival",
            content: "Been waiting for this all year. The Ethiopian booth from last year was unreal",
        },
        {
            userId: s["sophie@uottawa.ca"].id,
            postTitle: "Black Excellence Gala",
            content: "This looks absolutely stunning. How do I get tickets?",
            replies: [
                { userId: clubs["bsa"].id, content: "Tickets are on sale now — link in our bio. Early bird pricing ends Sunday!" },
            ],
        },
        {
            userId: s["jordan@uottawa.ca"].id,
            postTitle: "Petition Reaches 1,000 Signatures 🌿",
            content: "This is such a big deal — composting should have been here years ago. Thank you for pushing on this!",
        },
        {
            userId: s["daniel@uottawa.ca"].id,
            postTitle: "Post-Hackathon Recap 🏆",
            content: "Our team won 2nd place!! Couldn't have done it without the CS Club community. See you at the next one 🏆",
            replies: [
                { userId: clubs["cs-club"].id, content: "Congratulations!! Your project was incredible — we're rooting for you at regionals 🎉" },
            ],
        },
        {
            userId: s["fatima@uottawa.ca"].id,
            postTitle: "MCAT Study Boot Camp",
            content: "Is this open to 1st years or is it more for people applying this cycle?",
            replies: [
                { userId: clubs["premed"].id, content: "Open to everyone! Even if you're just starting to think about med school, it's a great intro to the exam format." },
            ],
        },
        {
            userId: s["mei@uottawa.ca"].id,
            postTitle: "MCAT Study Boot Camp",
            content: "Signed up the moment this was posted. Biochem students rise up 🧬",
        },
        {
            userId: s["tariq@uottawa.ca"].id,
            postTitle: "Stock Pitch Competition",
            content: "Our team has been prepping for two weeks. Can't wait to see what the other teams bring.",
        },
    ];

    for (const cs of commentSeeds) {
        const pid = postId(cs.postTitle);
        if (!pid) continue;
        const parent = await prisma.comment.create({
            data: { userId: cs.userId, postId: pid, content: cs.content },
        });
        if (cs.replies) {
            for (const reply of cs.replies) {
                await prisma.comment.create({
                    data: { userId: reply.userId, postId: pid, content: reply.content, parentId: parent.id },
                });
            }
        }
    }
    console.log("  Created comments");

    console.log("\n✅ Done! Logins:");
    console.log("   student@uottawa.ca / password123");
    console.log("   cssa@uottawa.ca / password123  (and any other club email)");
    console.log(`   ${studentsData.length} students · ${clubsData.length} clubs · ${posts.length} posts`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
