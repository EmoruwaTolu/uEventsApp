/**
 * seed-live.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Populates the database with a realistic, "already-live" data set:
 *   • ~18 clubs (upserted by email — reuses any that already exist)
 *   • ~28 students, including temor010@uottawa.ca
 *   • 300+ PUBLISHED posts (events / announcements / updates / polls), weighted
 *     toward the past so the app feels established, with a healthy set of
 *     upcoming events for the Following feed + discovery.
 *   • Rich interactions: follows, likes, comments, RSVPs, check-ins (attended
 *     events), bookmarks, poll votes, event ratings, recap photos, post views.
 *   • temor010@uottawa.ca (and other accounts) get a full, lived-in history —
 *     especially attended events — so profiles show real stats.
 *
 * SAFE TO RE-RUN. Everything is idempotent:
 *   • Users are upserted by email.
 *   • Posts / poll options / comments / recap photos use DETERMINISTIC ids, so
 *     createMany({ skipDuplicates: true }) skips anything already inserted.
 *   • Join rows (follow/like/rsvp/checkIn/bookmark/postView/pollVote) and
 *     ratings dedupe on their composite/unique keys.
 * Nothing is deleted — this only ADDS on top of whatever is already there.
 *
 * Run from the backend/ directory (uses DATABASE_URL from your .env):
 *   npm run db:seed-live
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── Deterministic RNG (mulberry32) so re-runs produce identical membership ──
function makeRng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rng = makeRng(20260703);
const pick = <T>(arr: T[], r = rng()) => arr[Math.floor(r * arr.length) % arr.length];
// Deterministically choose `n` distinct items from arr.
function sample<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    n = Math.min(n, copy.length);
    for (let i = 0; i < n; i++) {
        const idx = Math.floor(rng() * copy.length);
        out.push(copy.splice(idx, 1)[0]);
    }
    return out;
}

const now = new Date();
const DAY = 86400000;
// A date `dayOffset` days from now at hour:minute.
const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now.getTime() + dayOffset * DAY);
    d.setHours(h, m, 0, 0);
    return d;
};
const clampPast = (d: Date) => (d.getTime() > now.getTime() ? new Date(now.getTime() - DAY) : d);

// ── Clubs (upserted by email — matches the existing base seed) ──────────────
const CLUBS = [
    { email: "cssa@uottawa.ca", clubName: "CSSA / AEI", slug: "cssa", category: "Academic", description: "The Computer Science Student Association represents CS students and organizes academic and social events throughout the year." },
    { email: "csclub@uottawa.ca", clubName: "CS Club", slug: "cs-club", category: "Technology", description: "Weekly coding sessions, hackathons, and tech talks for students passionate about software." },
    { email: "fitness@uottawa.ca", clubName: "Campus Fitness", slug: "campus-fitness", category: "Health & Wellness", description: "Group workouts, yoga sessions, and wellness challenges open to all students." },
    { email: "gamedev@uottawa.ca", clubName: "Game Dev Society", slug: "game-dev", category: "Technology", description: "Build games, learn engines like Unity & Godot, and ship projects every semester." },
    { email: "debate@uottawa.ca", clubName: "Debate Club", slug: "debate", category: "Arts & Culture", description: "Sharpen your argumentation and public speaking at weekly practice rounds and tournaments." },
    { email: "music@uottawa.ca", clubName: "Music Collective", slug: "music", category: "Arts & Culture", description: "A community of musicians, producers, and music lovers. Open mics, jam sessions, and concerts." },
    { email: "entrepreneurship@uottawa.ca", clubName: "Entrepreneurship Hub", slug: "entrep", category: "Business", description: "From idea to launch. Pitch nights, startup workshops, and mentor connections." },
    { email: "photo@uottawa.ca", clubName: "Photography Society", slug: "photo", category: "Arts & Culture", description: "Weekly photo walks, darkroom access, critique sessions, and an annual gallery show." },
    { email: "ess@uottawa.ca", clubName: "Engineering Students Society", slug: "ess", category: "Engineering", description: "Representing all engineering students at uOttawa with social events, career fairs, and academic support." },
    { email: "iso@uottawa.ca", clubName: "International Students Organization", slug: "iso", category: "Cultural", description: "Connecting international students through cultural exchanges, buddy programs, and community events." },
    { email: "lsa@uottawa.ca", clubName: "Law Students Association", slug: "lsa", category: "Academic", description: "Supporting law students with events, networking, and academic resources." },
    { email: "bsa@uottawa.ca", clubName: "Black Students Association", slug: "bsa", category: "Cultural", description: "Building community, celebrating culture, and advocating for Black students at uOttawa." },
    { email: "premed@uottawa.ca", clubName: "Pre-Med Society", slug: "premed", category: "Academic", description: "Preparing future physicians with MCAT resources, shadowing opportunities, and peer support." },
    { email: "film@uottawa.ca", clubName: "uOttawa Film Club", slug: "film", category: "Arts & Culture", description: "Screening, discussing, and creating film on campus." },
    { email: "eag@uottawa.ca", clubName: "Environmental Action Group", slug: "eag", category: "Social", description: "Advocating for sustainability and climate action through campaigns, events, and organizing." },
    { email: "winstem@uottawa.ca", clubName: "Women in STEM", slug: "winstem", category: "Technology", description: "Empowering women and non-binary students in science and tech through mentorship and workshops." },
    { email: "acsa@uottawa.ca", clubName: "Afro-Caribbean Students Association", slug: "acsa", category: "Cultural", description: "Celebrating Afro-Caribbean heritage through culture, food, music, and community." },
    { email: "ifc@uottawa.ca", clubName: "Investment & Finance Club", slug: "ifc", category: "Business", description: "Hands-on investing, market analysis, and finance networking for students." },
];

// ── Students (upserted by email). temor010 is the primary "used" account. ───
const STUDENTS = [
    { email: "temor010@uottawa.ca", firstName: "Temi", lastName: "Moruwa", program: "Computer Science", year: "3rd Year" },
    { email: "student@uottawa.ca", firstName: "Alex", lastName: "Chen", program: "Computer Science", year: "3rd Year" },
    { email: "priya@uottawa.ca", firstName: "Priya", lastName: "Sharma", program: "Biomedical Engineering", year: "2nd Year" },
    { email: "marcus@uottawa.ca", firstName: "Marcus", lastName: "Williams", program: "Political Science", year: "4th Year" },
    { email: "sophie@uottawa.ca", firstName: "Sophie", lastName: "Tremblay", program: "Common Law", year: "1st Year" },
    { email: "kwame@uottawa.ca", firstName: "Kwame", lastName: "Asante", program: "Computer Science", year: "2nd Year" },
    { email: "isabelle@uottawa.ca", firstName: "Isabelle", lastName: "Martin", program: "Business", year: "3rd Year" },
    { email: "ryan@uottawa.ca", firstName: "Ryan", lastName: "O'Brien", program: "Mechanical Engineering", year: "2nd Year" },
    { email: "aisha@uottawa.ca", firstName: "Aisha", lastName: "Ndiaye", program: "International Development", year: "3rd Year" },
    { email: "lucas@uottawa.ca", firstName: "Lucas", lastName: "Bergeron", program: "Software Engineering", year: "1st Year" },
    { email: "fatima@uottawa.ca", firstName: "Fatima", lastName: "Al-Hassan", program: "Nursing", year: "2nd Year" },
    { email: "daniel@uottawa.ca", firstName: "Daniel", lastName: "Park", program: "Computer Science", year: "4th Year" },
    { email: "camille@uottawa.ca", firstName: "Camille", lastName: "Dubois", program: "Communications", year: "2nd Year" },
    { email: "jordan@uottawa.ca", firstName: "Jordan", lastName: "Thompson", program: "Psychology", year: "3rd Year" },
    { email: "mei@uottawa.ca", firstName: "Mei", lastName: "Zhang", program: "Biochemistry", year: "1st Year" },
    { email: "tariq@uottawa.ca", firstName: "Tariq", lastName: "Hassan", program: "Civil Engineering", year: "3rd Year" },
    { email: "olivia.reed@uottawa.ca", firstName: "Olivia", lastName: "Reed", program: "Finance", year: "2nd Year" },
    { email: "noah.klein@uottawa.ca", firstName: "Noah", lastName: "Klein", program: "Electrical Engineering", year: "3rd Year" },
    { email: "ananya.rao@uottawa.ca", firstName: "Ananya", lastName: "Rao", program: "Data Science", year: "2nd Year" },
    { email: "diego.morales@uottawa.ca", firstName: "Diego", lastName: "Morales", program: "Economics", year: "4th Year" },
    { email: "chloe.wong@uottawa.ca", firstName: "Chloe", lastName: "Wong", program: "Health Sciences", year: "1st Year" },
    { email: "ethan.murphy@uottawa.ca", firstName: "Ethan", lastName: "Murphy", program: "Mechanical Engineering", year: "3rd Year" },
    { email: "leila.haddad@uottawa.ca", firstName: "Leila", lastName: "Haddad", program: "Political Science", year: "2nd Year" },
    { email: "sam.okafor@uottawa.ca", firstName: "Sam", lastName: "Okafor", program: "Computer Science", year: "1st Year" },
    { email: "grace.lin@uottawa.ca", firstName: "Grace", lastName: "Lin", program: "Biology", year: "3rd Year" },
    { email: "mateo.rossi@uottawa.ca", firstName: "Mateo", lastName: "Rossi", program: "Architecture", year: "4th Year" },
    { email: "hannah.brooks@uottawa.ca", firstName: "Hannah", lastName: "Brooks", program: "Environmental Science", year: "2nd Year" },
    { email: "yusuf.ali@uottawa.ca", firstName: "Yusuf", lastName: "Ali", program: "Software Engineering", year: "2nd Year" },
];

const LOCATIONS = [
    { name: "STEM Complex 101", addr: "150 Louis-Pasteur Pvt" },
    { name: "Marion Hall 150", addr: "140 Louis-Pasteur Pvt" },
    { name: "Tabaret Hall 112", addr: "550 Cumberland St" },
    { name: "University Centre (UCU) 207", addr: "85 University Pvt" },
    { name: "Montpetit Hall 202", addr: "125 University Pvt" },
    { name: "SITE Building A0150", addr: "800 King Edward Ave" },
    { name: "Desmarais 1160", addr: "55 Laurier Ave E" },
    { name: "FSS 2005", addr: "120 University Pvt" },
    { name: "CRX Learning Lab", addr: "108 Louis-Pasteur Pvt" },
    { name: "Alumni Auditorium", addr: "85 University Pvt" },
    { name: "Morisset Library 4th Floor", addr: "65 University Pvt" },
    { name: "Minto Sports Complex", addr: "801 King Edward Ave" },
    { name: "90U Student Space", addr: "90 University Pvt" },
    { name: "Learning Crossroads C0136", addr: "145 Jean-Jacques Lussier" },
];

// Event templates keyed by club category. Each club draws a rotating slice so
// clubs of the same category don't look identical.
const EVENTS_BY_CATEGORY: Record<string, { title: string; body: string; cats: string[]; freeFood?: boolean }[]> = {
    Academic: [
        { title: "Midterm Study Jam", body: "Group study, past exams, and free coffee. Bring your notes and your questions — upper-years will be around to help.", cats: ["Academic", "Study"], freeFood: true },
        { title: "Research Info Session", body: "Learn how to land an undergraduate research assistant position. Two professors share what they look for.", cats: ["Academic", "Career"] },
        { title: "Peer Tutoring Kickoff", body: "Sign up as a tutor or a tutee for the semester. Free, weekly, and student-run.", cats: ["Academic"] },
        { title: "Alumni Career Panel", body: "Four grads walk through how they broke into their fields. Q&A and networking after.", cats: ["Academic", "Career"] },
        { title: "Grad School Application Night", body: "Personal statements, references, and funding — everything you need to know to apply.", cats: ["Academic", "Career"] },
        { title: "Exam De-Stress Social", body: "Board games, snacks, and a therapy-dog visit before finals week. Come take a breather.", cats: ["Academic", "Social"], freeFood: true },
        { title: "Guest Lecture: Ethics in the Field", body: "A public lecture followed by an open discussion. All programs welcome.", cats: ["Academic"] },
        { title: "Resume & LinkedIn Workshop", body: "Bring a laptop. We'll review resumes live and rebuild your LinkedIn profile.", cats: ["Academic", "Career"] },
        { title: "Course Selection Advice Night", body: "Upper-years share which electives are worth it. Honest reviews, no filter.", cats: ["Academic"] },
        { title: "Case Competition Prep", body: "Practice cracking business and policy cases against the clock, with feedback.", cats: ["Academic", "Competition"] },
        { title: "Networking Mixer with Faculty", body: "Meet professors outside of class over light refreshments.", cats: ["Academic", "Networking"], freeFood: true },
        { title: "Welcome Back Info Fair", body: "New to the program? Meet the exec team, grab merch, and find out what we do.", cats: ["Academic", "Social"] },
        { title: "Mock Interview Marathon", body: "Timed practice interviews with real feedback. Sign up for a slot in advance.", cats: ["Academic", "Career"] },
        { title: "End-of-Term Awards Night", body: "Celebrating student achievements this semester. Dress code: smart casual.", cats: ["Academic", "Social"] },
    ],
    Technology: [
        { title: "Intro to Git & GitHub Workshop", body: "Version control from zero. By the end you'll have your first pull request merged.", cats: ["Workshop", "Technology"] },
        { title: "Hackathon Kickoff", body: "48 hours, any stack, real prizes. Team formation and mentor intros happen tonight.", cats: ["Technology", "Competition"], freeFood: true },
        { title: "Build Your First API", body: "Hands-on session building and deploying a REST API. Laptops required.", cats: ["Workshop", "Technology"] },
        { title: "Tech Talk: Life at a Startup", body: "An engineer shares what shipping to production really looks like day to day.", cats: ["Technology", "Career"] },
        { title: "Game Jam Weekend", body: "Make a small game in 48 hours around a surprise theme. Solo or teams.", cats: ["Technology", "Competition"] },
        { title: "Intro to Machine Learning", body: "Train your first model live. No math background required — just curiosity.", cats: ["Workshop", "Technology"] },
        { title: "Open Source Contribution Night", body: "We'll find beginner-friendly issues together and land your first OSS commit.", cats: ["Technology", "Workshop"], freeFood: true },
        { title: "Resume Review: Tech Edition", body: "Recruiters and senior students critique your CV for tech roles.", cats: ["Technology", "Career"] },
        { title: "Design Systems Workshop", body: "From Figma to code. Build a reusable component library from scratch.", cats: ["Workshop", "Technology"] },
        { title: "Cloud 101 with a Live Deploy", body: "Deploy a full app to the cloud in one sitting. Free credits provided.", cats: ["Workshop", "Technology"] },
        { title: "Coding Interview Bootcamp", body: "Whiteboard patterns, live problem solving, and how to think out loud.", cats: ["Technology", "Career"] },
        { title: "Demo Night: Show Your Project", body: "Five minutes, one project, all applause. Sign up to present or just watch.", cats: ["Technology", "Social"], freeFood: true },
        { title: "Cybersecurity Capture the Flag", body: "Beginner and advanced tracks. Learn to break (and defend) systems.", cats: ["Technology", "Competition"] },
        { title: "Women in Tech Panel", body: "Four engineers on navigating the industry, imposter syndrome, and growth.", cats: ["Technology", "Career"] },
    ],
    "Health & Wellness": [
        { title: "Sunrise Yoga Session", body: "All levels welcome. Mats provided. Start your day grounded and stretched.", cats: ["Wellness", "Fitness"] },
        { title: "HIIT Bootcamp", body: "45 minutes of high-intensity intervals. Bring water and a towel.", cats: ["Fitness"] },
        { title: "Group Run Around Campus", body: "5K social run at an easy pace. Nobody gets left behind.", cats: ["Fitness", "Social"] },
        { title: "Mental Health First Aid", body: "Learn to recognize and respond to a friend in crisis. Certified facilitators.", cats: ["Wellness"] },
        { title: "Nutrition on a Student Budget", body: "Meal-prep demo and free samples. Eat well without breaking the bank.", cats: ["Wellness"], freeFood: true },
        { title: "Intramural Sign-Up Social", body: "Find a team for the season. Volleyball, basketball, and dodgeball spots open.", cats: ["Fitness", "Social"] },
        { title: "Guided Meditation Hour", body: "A calm reset in the middle of a busy week. No experience needed.", cats: ["Wellness"] },
        { title: "Self-Defense Basics", body: "A practical intro workshop led by a certified instructor. Open to everyone.", cats: ["Wellness", "Workshop"] },
        { title: "Wellness Fair", body: "Booths on sleep, stress, nutrition, and movement. Free smoothies while they last.", cats: ["Wellness"], freeFood: true },
        { title: "Spin Class Takeover", body: "A high-energy ride with a student DJ on the decks. Reserve your bike early.", cats: ["Fitness"] },
        { title: "Rock Climbing Meetup", body: "Beginners welcome — we'll show you the ropes. Gear rental discounted for members.", cats: ["Fitness", "Social"] },
        { title: "Stretch & Recover Session", body: "Mobility work for tight hips and desk-bound backs. Low intensity, high relief.", cats: ["Wellness", "Fitness"] },
        { title: "Charity Fitness Challenge", body: "Log the most reps for a good cause. Sponsors match every rep with a donation.", cats: ["Fitness", "Community"] },
        { title: "Cooking for Athletes", body: "Fuel your training. Live cooking demo with tastings for everyone.", cats: ["Wellness"], freeFood: true },
    ],
    "Arts & Culture": [
        { title: "Open Mic Night", body: "Poetry, music, comedy — the stage is yours for five minutes. Sign up at the door.", cats: ["Arts", "Social"] },
        { title: "Life Drawing Session", body: "Bring a sketchbook. A live model and a relaxed, judgment-free room.", cats: ["Arts", "Workshop"] },
        { title: "Film Screening & Discussion", body: "We watch, then we argue about it over popcorn. This month: a modern classic.", cats: ["Film", "Arts"], freeFood: true },
        { title: "Gallery Walk & Critique", body: "Show your work or just come look. Constructive feedback from peers and faculty.", cats: ["Arts"] },
        { title: "Jam Session", body: "Bring an instrument or borrow one of ours. Loose, fun, and all skill levels.", cats: ["Music", "Social"] },
        { title: "Photo Walk Downtown", body: "Golden-hour shoot through the ByWard Market. Any camera, phones included.", cats: ["Arts", "Photography"] },
        { title: "Improv Workshop", body: "Say yes, and… An intro to improv games. Guaranteed laughs, zero pressure.", cats: ["Arts", "Workshop"] },
        { title: "Debate Showdown", body: "Watch two teams spar on a hot-button motion, then vote on the winner.", cats: ["Arts", "Competition"] },
        { title: "Songwriting Circle", body: "Workshop a song you're stuck on, or start a new one together.", cats: ["Music", "Workshop"] },
        { title: "Zine-Making Workshop", body: "Cut, paste, print, staple. Make a mini-magazine and take it home.", cats: ["Arts", "Workshop"] },
        { title: "Culture Night Showcase", body: "Performances, food, and stories from communities across campus.", cats: ["Arts", "Social"], freeFood: true },
        { title: "Short Film Festival", body: "An evening of student-made shorts, followed by an audience awards vote.", cats: ["Film", "Arts"] },
        { title: "Public Speaking Clinic", body: "Beat the nerves. Structured drills to make you a stronger speaker.", cats: ["Arts", "Workshop"] },
        { title: "Vinyl Listening Party", body: "Bring a record you love. We'll spin them all and talk about why they matter.", cats: ["Music", "Social"] },
    ],
    Business: [
        { title: "Pitch Night", body: "Founders pitch to a panel for feedback and prizes. Come to present or to heckle (kindly).", cats: ["Business", "Competition"] },
        { title: "Intro to Investing", body: "Stocks, ETFs, and compounding explained simply. Start your portfolio the right way.", cats: ["Business", "Workshop"] },
        { title: "Networking Breakfast", body: "Coffee, pastries, and 30 minutes of real conversations with industry guests.", cats: ["Business", "Networking"], freeFood: true },
        { title: "Startup Legal Basics", body: "Incorporation, contracts, and equity — the essentials, minus the jargon.", cats: ["Business", "Workshop"] },
        { title: "Stock Pitch Competition", body: "Make the case for one stock in five minutes. Judges from the finance industry.", cats: ["Business", "Competition"] },
        { title: "Personal Finance for Students", body: "Budgeting, credit, and taxes. The class no one teaches but everyone needs.", cats: ["Business", "Workshop"] },
        { title: "Founder Fireside Chat", body: "An honest conversation with a local founder about wins, failures, and lessons.", cats: ["Business", "Career"] },
        { title: "Consulting Case Night", body: "Crack a real consulting case in teams with coaching from upper-years.", cats: ["Business", "Competition"] },
        { title: "Resume Clinic: Business Edition", body: "Recruiters review resumes for banking, consulting, and product roles.", cats: ["Business", "Career"] },
        { title: "Marketing Workshop", body: "Positioning, brand, and a live teardown of real campaigns.", cats: ["Business", "Workshop"] },
        { title: "Trading Simulation Day", body: "Trade a live-market simulator. Top P&L wins. Beginners welcome.", cats: ["Business", "Competition"] },
        { title: "Women in Business Panel", body: "Leaders share paths into finance, tech, and entrepreneurship.", cats: ["Business", "Career"] },
        { title: "Networking Gala", body: "Our flagship semester event. Dress to impress and bring business cards.", cats: ["Business", "Social"], freeFood: true },
        { title: "Excel & Modeling Bootcamp", body: "Build a financial model from a blank sheet. Laptops required.", cats: ["Business", "Workshop"] },
    ],
    Engineering: [
        { title: "Design Team Recruitment Night", body: "Meet the racing, rocketry, and robotics teams. Find where you fit.", cats: ["Engineering", "Social"] },
        { title: "CAD Workshop", body: "Model your first part in SolidWorks. No experience needed, licenses provided.", cats: ["Engineering", "Workshop"] },
        { title: "Iron Ring Info Session", body: "Everything graduating engineers need to know about the ceremony.", cats: ["Engineering"] },
        { title: "Bridge Building Contest", body: "Popsicle sticks, glue, and a load test. Strongest-to-weight ratio wins.", cats: ["Engineering", "Competition"], freeFood: true },
        { title: "Industry Night", body: "Firms set up booths, you bring resumes. Internships and new-grad roles on offer.", cats: ["Engineering", "Career"] },
        { title: "3D Printing 101", body: "From model to print. Design something small and take it home.", cats: ["Engineering", "Workshop"] },
        { title: "Soldering Workshop", body: "Build a blinking-LED kit and learn to solder cleanly. Kits included.", cats: ["Engineering", "Workshop"] },
        { title: "Guest Talk: Sustainable Design", body: "How engineers cut carbon in real projects. Case studies and Q&A.", cats: ["Engineering"] },
        { title: "Robotics Demo Day", body: "Watch student-built bots compete. Come cheer, or bring your own.", cats: ["Engineering", "Competition"] },
        { title: "PEng Licensing Panel", body: "The path from grad to Professional Engineer, demystified.", cats: ["Engineering", "Career"] },
        { title: "Engineering Formal", body: "Our biggest social of the year. Tickets go fast — grab yours early.", cats: ["Engineering", "Social"] },
        { title: "Hardware Hackathon", body: "Sensors, microcontrollers, and 24 hours to build something that moves.", cats: ["Engineering", "Competition"], freeFood: true },
        { title: "Resume & Portfolio Review", body: "Get technical resumes and project portfolios reviewed by seniors.", cats: ["Engineering", "Career"] },
        { title: "Machine Shop Safety Training", body: "Required to use the shop. Hands-on intro to the tools and the rules.", cats: ["Engineering", "Workshop"] },
    ],
    Cultural: [
        { title: "Cultural Food Festival", body: "A tour of the world in one afternoon. Dishes from a dozen communities.", cats: ["Cultural", "Social"], freeFood: true },
        { title: "Heritage Night", body: "Music, dance, and storytelling celebrating our community's roots.", cats: ["Cultural", "Social"] },
        { title: "Language Exchange Café", body: "Practice a new language over tea. Native speakers at every table.", cats: ["Cultural", "Social"] },
        { title: "International Potluck", body: "Bring a dish from home, leave with new friends and full plates.", cats: ["Cultural", "Social"], freeFood: true },
        { title: "Diaspora Stories Panel", body: "Students share journeys of migration, identity, and belonging.", cats: ["Cultural"] },
        { title: "Traditional Dance Workshop", body: "Learn the steps, no experience needed. Come move with us.", cats: ["Cultural", "Workshop"] },
        { title: "New Student Welcome Mixer", body: "New to Canada or campus? Meet people who get it. Snacks provided.", cats: ["Cultural", "Social"], freeFood: true },
        { title: "Film & Discussion: Home", body: "A screening exploring identity and place, then an open conversation.", cats: ["Cultural", "Film"] },
        { title: "Henna & Art Night", body: "Relax, create, and connect. Artists on hand, all supplies included.", cats: ["Cultural", "Arts"] },
        { title: "Cultural Trivia Night", body: "Test your knowledge across food, history, and pop culture. Team prizes.", cats: ["Cultural", "Social"] },
        { title: "Cooking Class: Family Recipes", body: "Cook a beloved dish together, then eat it. Recipe cards to take home.", cats: ["Cultural", "Workshop"], freeFood: true },
        { title: "Celebration Gala", body: "Our flagship night of the year — performances, food, and community.", cats: ["Cultural", "Social"] },
        { title: "Mentorship Meet & Greet", body: "Pair up with an upper-year mentor from your community.", cats: ["Cultural", "Networking"] },
        { title: "Open Community Meeting", body: "Shape what we do next semester. Your voice, our agenda.", cats: ["Cultural"] },
    ],
    Social: [
        { title: "Campus Clean-Up Day", body: "Gloves, bags, and snacks provided. Let's leave the campus better than we found it.", cats: ["Community", "Environment"], freeFood: true },
        { title: "Climate Action Teach-In", body: "Speakers, workshops, and concrete ways to get involved this term.", cats: ["Community", "Environment"] },
        { title: "Clothing Swap", body: "Bring what you don't wear, take what you love. Zero waste, zero cost.", cats: ["Community", "Environment"] },
        { title: "Volunteer Fair", body: "Meet local organizations looking for student volunteers. Find your cause.", cats: ["Community", "Networking"] },
        { title: "Community Garden Planting", body: "Get your hands dirty planting the spring beds. Tools and gloves provided.", cats: ["Community", "Environment"] },
        { title: "Advocacy 101 Workshop", body: "How to run a campaign that actually changes policy on campus.", cats: ["Community", "Workshop"] },
        { title: "Charity Bake Sale", body: "All proceeds to a local shelter. Come hungry, give generously.", cats: ["Community"], freeFood: true },
        { title: "Sustainability Film Night", body: "A documentary screening followed by a panel and Q&A.", cats: ["Community", "Environment", "Film"] },
        { title: "Blood Drive", body: "Book a slot to donate. Quick, safe, and it saves lives.", cats: ["Community"] },
        { title: "Neighbourhood Mural Project", body: "Help paint a community mural. All artistic abilities welcome.", cats: ["Community", "Arts"] },
        { title: "Town Hall: Student Issues", body: "Bring your concerns straight to student leaders. Open floor, real answers.", cats: ["Community"] },
        { title: "Fundraising Trivia Night", body: "Play for a cause. Entry fee is a donation; prizes for the top teams.", cats: ["Community", "Social"] },
        { title: "Winter Coat Drive", body: "Donate a gently used coat and help a neighbour stay warm this winter.", cats: ["Community"] },
        { title: "Earth Week Kickoff", body: "A week of events starts here. Booths, giveaways, and a group photo.", cats: ["Community", "Environment"], freeFood: true },
    ],
};

const ANNOUNCEMENTS = [
    { title: "We're recruiting execs for next year!", body: "Applications for all executive positions are now open. No experience required — just bring energy. Deadline in two weeks." },
    { title: "New partnership announced", body: "We've teamed up with a campus partner to bring members exclusive workshops and discounts this semester." },
    { title: "Thank you for an incredible semester", body: "Attendance doubled, and we ran more events than ever. Huge thanks to every member who showed up. See you next term." },
    { title: "Membership is now free", body: "We've dropped membership fees for the rest of the year. Just show up — everyone's welcome." },
    { title: "We won an award!", body: "Our club was recognized as one of the most active on campus this year. This one belongs to all of you." },
    { title: "Room change for weekly meetings", body: "Our regular meetings have moved to a bigger space to fit our growing crew. Check the pinned post for details." },
];

const UPDATES = [
    { title: "Event recap: what a turnout", body: "Over a hundred of you came out. The energy was unreal — swipe through the photos and tag yourselves." },
    { title: "Registration is filling up fast", body: "We're already past 70% capacity for our flagship event. Grab your spot before it sells out." },
    { title: "Volunteers needed this weekend", body: "We need a few more hands to make this happen. Two-hour shifts, snacks included, good vibes guaranteed." },
    { title: "Schedule update for the week", body: "Heads up — this week's session starts 30 minutes later than usual. Everything else stays the same." },
    { title: "New members: start here", body: "Just joined? Welcome. Here's how to get involved, what we do, and when we meet." },
    { title: "Merch has arrived", body: "Hoodies and stickers are in. Pick yours up at the next meeting while supplies last." },
];

const POLLS = [
    { title: "What should our next big event be?", options: ["A hackathon", "A networking gala", "A social night", "A skills workshop"] },
    { title: "Best time for weekly meetings?", options: ["Weekday evenings", "Weekday afternoons", "Weekend mornings", "Weekend afternoons"] },
    { title: "What topic do you want a workshop on?", options: ["Career prep", "Technical skills", "Leadership", "Wellness"] },
    { title: "Where should we host the end-of-term social?", options: ["On campus", "A downtown venue", "Outdoors", "Someone's place"] },
    { title: "How often should we run events?", options: ["Weekly", "Every two weeks", "Monthly", "Whenever there's interest"] },
];

const COMMENTS = [
    "This was such a great event, thank you for organizing!",
    "Count me in — already added it to my calendar.",
    "Will there be a recording for those who can't make it?",
    "Had an amazing time last week, can't wait for the next one.",
    "Is this open to first-years too?",
    "The turnout was incredible. Well done team!",
    "Finally, exactly the kind of event I've been looking for.",
    "Do we need to bring anything, or is everything provided?",
    "Brought two friends and we all loved it.",
    "Any chance you'll run this again later in the term?",
    "Signed up! See everyone there.",
    "This club keeps getting better every semester.",
    "Loved the speakers — genuinely learned a lot.",
    "Is there a waitlist if it fills up?",
    "Best two hours of my week, no contest.",
];

const RATING_NONE = 0;

async function main() {
    console.log("Seeding live-feel data (this adds on top of existing data)…\n");
    const hash = await bcrypt.hash("password123", 12);

    // ── Upsert clubs ─────────────────────────────────────────────────────────
    const clubBySlug: Record<string, string> = {};
    for (const c of CLUBS) {
        const club = await prisma.user.upsert({
            where: { email: c.email },
            update: {},
            create: {
                email: c.email, passwordHash: hash, type: "CLUB",
                clubName: c.clubName, slug: c.slug, category: c.category,
                description: c.description, logoUrl: `https://picsum.photos/seed/${c.slug}/200/200`,
                emailVerified: new Date(), clubStatus: "APPROVED",
            },
        });
        clubBySlug[c.slug] = club.id;
    }
    console.log(`  Clubs ready: ${CLUBS.length}`);

    // ── Upsert students ──────────────────────────────────────────────────────
    const studentByEmail: Record<string, string> = {};
    for (const s of STUDENTS) {
        const seed = s.email.split("@")[0];
        const user = await prisma.user.upsert({
            where: { email: s.email },
            update: {},
            create: {
                email: s.email, passwordHash: hash, type: "STUDENT",
                firstName: s.firstName, lastName: s.lastName, program: s.program, year: s.year,
                avatarUrl: `https://picsum.photos/seed/${seed}/200/200`,
                emailVerified: new Date(),
            },
        });
        studentByEmail[s.email] = user.id;
    }
    const allStudentIds = Object.values(studentByEmail);
    const temorId = studentByEmail["temor010@uottawa.ca"];
    console.log(`  Students ready: ${STUDENTS.length}`);

    // ── Build posts deterministically ────────────────────────────────────────
    type BuiltPost = {
        id: string; clubId: string; type: "EVENT" | "ANNOUNCEMENT" | "UPDATE" | "POLL";
        startAt: Date | null; endAt: Date | null; isPast: boolean;
        freeFood: boolean; pollOptionTexts: string[];
    };
    const postRows: any[] = [];
    const pollOptionRows: any[] = [];
    const built: BuiltPost[] = [];

    CLUBS.forEach((club, ci) => {
        const clubId = clubBySlug[club.slug];
        const bank = EVENTS_BY_CATEGORY[club.category] ?? EVENTS_BY_CATEGORY.Social;
        let seq = 0;
        const mk = (id: string) => `lvp_${club.slug}_${id}`;

        // 13 EVENTS per club, rotating through the category bank.
        for (let i = 0; i < 13; i++) {
            const tpl = bank[(ci * 3 + i) % bank.length];
            // ~72% past, ~28% upcoming.
            const isFuture = rng() < 0.28;
            const dayOffset = isFuture
                ? 1 + Math.floor(rng() * 30)
                : -1 - Math.floor(rng() * 120);
            const hour = pick([10, 12, 14, 16, 17, 18, 19]);
            const startAt = at(dayOffset, hour, pick([0, 30]));
            const endAt = new Date(startAt.getTime() + (2 + Math.floor(rng() * 2)) * 3600000);
            // Posted a few days before the event, but never in the future.
            const createdAt = clampPast(new Date(startAt.getTime() - (2 + Math.floor(rng() * 12)) * DAY));
            const loc = pick(LOCATIONS);
            const poster = `https://picsum.photos/seed/${club.slug}${i}ev/800/500`;
            const capacity = rng() < 0.5 ? 40 + Math.floor(rng() * 200) : null;
            const id = mk(`ev${i}`);
            postRows.push({
                id, clubId, type: "EVENT", isDraft: false, publishAt: createdAt, createdAt,
                locales: { en: { title: tpl.title, body: tpl.body, posterUrl: poster } },
                startAt, endAt, locationName: loc.name, address: loc.addr,
                categories: tpl.cats, images: [], capacity, freeFood: !!tpl.freeFood,
            });
            built.push({ id, clubId, type: "EVENT", startAt, endAt, isPast: dayOffset < 0, freeFood: !!tpl.freeFood, pollOptionTexts: [] });
            seq++;
        }

        // 2 ANNOUNCEMENTS
        for (let i = 0; i < 2; i++) {
            const tpl = ANNOUNCEMENTS[(ci + i * 3) % ANNOUNCEMENTS.length];
            const createdAt = clampPast(at(-1 - Math.floor(rng() * 90), pick([9, 11, 13, 15])));
            const id = mk(`an${i}`);
            postRows.push({
                id, clubId, type: "ANNOUNCEMENT", isDraft: false, publishAt: createdAt, createdAt,
                locales: { en: { title: tpl.title, body: tpl.body } },
                startAt: null, endAt: null, categories: [], images: [], freeFood: false,
            });
            built.push({ id, clubId, type: "ANNOUNCEMENT", startAt: null, endAt: null, isPast: true, freeFood: false, pollOptionTexts: [] });
        }

        // 1 UPDATE
        {
            const tpl = UPDATES[ci % UPDATES.length];
            const createdAt = clampPast(at(-1 - Math.floor(rng() * 45), pick([10, 12, 14, 16])));
            const id = mk(`up0`);
            postRows.push({
                id, clubId, type: "UPDATE", isDraft: false, publishAt: createdAt, createdAt,
                locales: { en: { title: tpl.title, body: tpl.body } },
                startAt: null, endAt: null, categories: [], images: [], freeFood: false,
            });
            built.push({ id, clubId, type: "UPDATE", startAt: null, endAt: null, isPast: true, freeFood: false, pollOptionTexts: [] });
        }

        // 1 POLL (open — expires in the future so it's votable)
        {
            const tpl = POLLS[ci % POLLS.length];
            const createdAt = clampPast(at(-1 - Math.floor(rng() * 20), pick([10, 12, 14])));
            const id = mk(`pl0`);
            postRows.push({
                id, clubId, type: "POLL", isDraft: false, publishAt: createdAt, createdAt,
                locales: { en: { title: tpl.title, body: "" } },
                startAt: null, endAt: null, categories: [], images: [], freeFood: false,
                pollExpiresAt: at(7 + Math.floor(rng() * 14), 23, 59), pollAllowMultiple: false,
            });
            tpl.options.forEach((opt, k) => {
                pollOptionRows.push({ id: `${id}_o${k}`, postId: id, textEn: opt });
            });
            built.push({ id, clubId, type: "POLL", startAt: null, endAt: null, isPast: false, freeFood: false, pollOptionTexts: tpl.options });
        }
    });

    // Guarantee a couple of upcoming free-food events so the banner shows real data.
    const upcomingFreeFood = built.filter((b) => b.type === "EVENT" && !b.isPast).slice(0, 2);
    for (const b of upcomingFreeFood) {
        const row = postRows.find((p) => p.id === b.id);
        if (row) { row.freeFood = true; b.freeFood = true; }
    }

    console.log(`  Built ${postRows.length} posts (${built.filter(b => b.isPast && b.type === "EVENT").length} past events, ${built.filter(b => !b.isPast && b.type === "EVENT").length} upcoming events).`);

    // Insert posts + poll options (idempotent via deterministic ids).
    await chunkedCreateMany("post", postRows);
    await chunkedCreateMany("pollOption", pollOptionRows);

    // ── Follows ──────────────────────────────────────────────────────────────
    // Each student follows 5–9 clubs. temor010 follows a strong, varied set.
    const clubIds = Object.values(clubBySlug);
    const followRows: any[] = [];
    const followsByStudent: Record<string, string[]> = {};
    for (const sid of allStudentIds) {
        const count = sid === temorId ? 9 : 5 + Math.floor(rng() * 5);
        const chosen = sample(clubIds, count);
        followsByStudent[sid] = chosen;
        for (const cid of chosen) {
            followRows.push({ userId: sid, clubId: cid, notifPref: "ALL", createdAt: clampPast(at(-1 - Math.floor(rng() * 150), 12)) });
        }
    }
    await chunkedCreateMany("follow", followRows);

    // Followers per club (for building a realistic audience per post).
    const followersByClub: Record<string, string[]> = {};
    for (const [sid, cids] of Object.entries(followsByStudent)) {
        for (const cid of cids) (followersByClub[cid] ||= []).push(sid);
    }

    // ── Interactions per post ────────────────────────────────────────────────
    const likeRows: any[] = [];
    const viewRows: any[] = [];
    const bookmarkRows: any[] = [];
    const rsvpRows: any[] = [];
    const checkInRows: any[] = [];
    const ratingRows: any[] = [];
    const commentRows: any[] = [];
    const photoRows: any[] = [];
    const pollVoteRows: any[] = [];

    let commentSeq = 0;

    for (const b of built) {
        const followers = followersByClub[b.clubId] ?? [];
        // Audience = followers, plus a few non-followers (discovery).
        const nonFollowers = allStudentIds.filter((s) => !followers.includes(s));
        const audience = [...followers, ...sample(nonFollowers, 3)];
        if (audience.length === 0) continue;

        const viewers = sample(audience, Math.ceil(audience.length * (0.55 + rng() * 0.3)));
        for (const uid of viewers) viewRows.push({ userId: uid, postId: b.id, createdAt: clampPast(new Date((b.startAt ?? now).getTime())) });

        const likers = sample(viewers, Math.ceil(viewers.length * (0.3 + rng() * 0.35)));
        for (const uid of likers) likeRows.push({ userId: uid, postId: b.id, createdAt: clampPast(new Date()) });

        const bookmarkers = sample(viewers, Math.floor(viewers.length * (0.08 + rng() * 0.12)));
        for (const uid of bookmarkers) bookmarkRows.push({ userId: uid, postId: b.id, createdAt: clampPast(new Date()) });

        // Comments (0–3)
        const commenters = sample(audience, Math.floor(rng() * 4));
        for (const uid of commenters) {
            commentRows.push({ id: `lvc_${b.id}_${commentSeq++}`, userId: uid, postId: b.id, content: pick(COMMENTS), upvotes: Math.floor(rng() * 12), createdAt: clampPast(new Date()) });
        }

        if (b.type === "EVENT") {
            const attendeesPool = sample(audience, Math.ceil(audience.length * (0.4 + rng() * 0.35)));
            const rsvpAt = clampPast(new Date((b.startAt ?? now).getTime() - 3 * DAY));
            for (const uid of attendeesPool) rsvpRows.push({ userId: uid, postId: b.id, createdAt: rsvpAt });

            if (b.isPast) {
                // A subset of RSVPs actually checked in (attended).
                const checkedIn = sample(attendeesPool, Math.ceil(attendeesPool.length * (0.45 + rng() * 0.35)));
                for (const uid of checkedIn) {
                    checkInRows.push({ postId: b.id, userId: uid, checkedAt: b.startAt! });
                    // Some who attended left a rating.
                    if (rng() < 0.5) ratingRows.push({ postId: b.id, userId: uid, rating: 3 + Math.floor(rng() * 3), createdAt: new Date(b.startAt!.getTime() + DAY) });
                }
                // Recap photos on some past events.
                if (rng() < 0.4) {
                    const shooters = sample(checkedIn.length ? checkedIn : attendeesPool, 1 + Math.floor(rng() * 3));
                    shooters.forEach((uid, k) => {
                        photoRows.push({ id: `lvep_${b.id}_${k}`, postId: b.id, userId: uid, url: `https://picsum.photos/seed/${b.id}rec${k}/800/600`, status: "APPROVED", createdAt: new Date(b.startAt!.getTime() + DAY) });
                    });
                }
            }
        }

        if (b.type === "POLL" && b.pollOptionTexts.length) {
            const voters = sample(audience, Math.ceil(audience.length * (0.4 + rng() * 0.4)));
            for (const uid of voters) {
                const k = Math.floor(rng() * b.pollOptionTexts.length);
                pollVoteRows.push({ userId: uid, optionId: `${b.id}_o${k}`, createdAt: clampPast(new Date()) });
            }
        }
    }

    // ── Boost temor010: a rich, lived-in account ─────────────────────────────
    const temorFollows = followsByStudent[temorId] ?? [];
    const temorPastEvents = built.filter((b) => b.type === "EVENT" && b.isPast && temorFollows.includes(b.clubId));
    const temorUpcoming = built.filter((b) => b.type === "EVENT" && !b.isPast && temorFollows.includes(b.clubId));

    // Attend ~20 past events (spread over the term) — drives the "events attended" stats.
    for (const b of sample(temorPastEvents, Math.min(20, temorPastEvents.length))) {
        rsvpRows.push({ userId: temorId, postId: b.id, createdAt: new Date(b.startAt!.getTime() - 3 * DAY) });
        checkInRows.push({ postId: b.id, userId: temorId, checkedAt: b.startAt! });
        likeRows.push({ userId: temorId, postId: b.id, createdAt: new Date(b.startAt!.getTime() + DAY) });
        if (rng() < 0.6) ratingRows.push({ postId: b.id, userId: temorId, rating: 4 + Math.floor(rng() * 2), createdAt: new Date(b.startAt!.getTime() + DAY) });
    }
    // RSVP to several upcoming events.
    for (const b of sample(temorUpcoming, Math.min(6, temorUpcoming.length))) {
        rsvpRows.push({ userId: temorId, postId: b.id, createdAt: clampPast(new Date()) });
    }
    // Bookmarks, likes, and comments across followed clubs.
    const temorFeed = built.filter((b) => temorFollows.includes(b.clubId));
    for (const b of sample(temorFeed, 12)) bookmarkRows.push({ userId: temorId, postId: b.id, createdAt: clampPast(new Date()) });
    for (const b of sample(temorFeed, 30)) likeRows.push({ userId: temorId, postId: b.id, createdAt: clampPast(new Date()) });
    for (const b of sample(temorFeed, 6)) commentRows.push({ id: `lvc_temor_${b.id}`, userId: temorId, postId: b.id, content: pick(COMMENTS), upvotes: Math.floor(rng() * 8), createdAt: clampPast(new Date()) });

    // ── Write all interaction tables (skipDuplicates makes this re-runnable) ──
    await chunkedCreateMany("postView", viewRows);
    await chunkedCreateMany("like", likeRows);
    await chunkedCreateMany("bookmark", bookmarkRows);
    await chunkedCreateMany("comment", commentRows);
    await chunkedCreateMany("rsvp", rsvpRows);
    await chunkedCreateMany("checkIn", checkInRows);
    await chunkedCreateMany("eventRating", ratingRows);
    await chunkedCreateMany("eventPhoto", photoRows);
    await chunkedCreateMany("pollVote", pollVoteRows);

    console.log("\nLive seed complete:");
    console.log(`  posts:        ${postRows.length}`);
    console.log(`  poll options: ${pollOptionRows.length}`);
    console.log(`  follows:      ${followRows.length}`);
    console.log(`  post views:   ${viewRows.length}`);
    console.log(`  likes:        ${likeRows.length}`);
    console.log(`  bookmarks:    ${bookmarkRows.length}`);
    console.log(`  comments:     ${commentRows.length}`);
    console.log(`  RSVPs:        ${rsvpRows.length}`);
    console.log(`  check-ins:    ${checkInRows.length}  (attended events)`);
    console.log(`  ratings:      ${ratingRows.length}`);
    console.log(`  recap photos: ${photoRows.length}`);
    console.log(`  poll votes:   ${pollVoteRows.length}`);
    const temorCheckins = checkInRows.filter((c) => c.userId === temorId).length;
    console.log(`\n  temor010@uottawa.ca: ${temorFollows.length} clubs followed, ${temorCheckins} events attended.`);
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
