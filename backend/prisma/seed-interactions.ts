/**
 * seed-interactions.ts
 * Creates 20 student accounts and has them follow clubs, like/comment/bookmark/RSVP posts, and vote on polls.
 * Safe to re-run — all writes use upsert or createMany with skipDuplicates.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STUDENTS = [
    { firstName: "Marcus",   lastName: "Chen",      year: "1st Year", program: "Computer Science",       email: "marcus.chen@uevents.dev"      },
    { firstName: "Sarah",    lastName: "Jenkins",   year: "1st Year", program: "Software Engineering",   email: "sarah.jenkins@uevents.dev"    },
    { firstName: "Leo",      lastName: "Thompson",  year: "1st Year", program: "Information Systems",    email: "leo.thompson@uevents.dev"     },
    { firstName: "Priya",    lastName: "Nair",      year: "2nd Year", program: "Computer Science",       email: "priya.nair@uevents.dev"       },
    { firstName: "James",    lastName: "Okafor",    year: "2nd Year", program: "Mathematics",            email: "james.okafor@uevents.dev"     },
    { firstName: "Aisha",    lastName: "Mensah",    year: "2nd Year", program: "Software Engineering",   email: "aisha.mensah@uevents.dev"     },
    { firstName: "Daniel",   lastName: "Park",      year: "3rd Year", program: "Computer Science",       email: "daniel.park@uevents.dev"      },
    { firstName: "Emma",     lastName: "Rivera",    year: "3rd Year", program: "Data Science",           email: "emma.rivera@uevents.dev"      },
    { firstName: "Noah",     lastName: "Williams",  year: "3rd Year", program: "Electrical Engineering", email: "noah.williams@uevents.dev"    },
    { firstName: "Tariq",    lastName: "Osei",      year: "4th Year", program: "Computer Science",       email: "tariq.osei@uevents.dev"       },
    { firstName: "Lily",     lastName: "Chen",      year: "4th Year", program: "Business & Tech",        email: "lily.chen@uevents.dev"        },
    { firstName: "Jordan",   lastName: "Scott",     year: "4th Year", program: "Software Engineering",   email: "jordan.scott@uevents.dev"     },
    { firstName: "Maya",     lastName: "Patel",     year: "1st Year", program: "Computer Science",       email: "maya.patel@uevents.dev"       },
    { firstName: "Elijah",   lastName: "Brown",     year: "2nd Year", program: "Finance",                email: "elijah.brown@uevents.dev"     },
    { firstName: "Zoe",      lastName: "Tremblay",  year: "2nd Year", program: "Music",                  email: "zoe.tremblay@uevents.dev"     },
    { firstName: "Kai",      lastName: "Nakamura",  year: "3rd Year", program: "Game Design",            email: "kai.nakamura@uevents.dev"     },
    { firstName: "Isabelle", lastName: "Lavoie",    year: "3rd Year", program: "Photography",            email: "isabelle.lavoie@uevents.dev"  },
    { firstName: "Samuel",   lastName: "Adeyemi",   year: "4th Year", program: "Computer Science",       email: "samuel.adeyemi@uevents.dev"   },
    { firstName: "Chloe",    lastName: "Bergeron",  year: "1st Year", program: "Communications",         email: "chloe.bergeron@uevents.dev"   },
    { firstName: "Mateo",    lastName: "Gonzalez",  year: "2nd Year", program: "Mechanical Engineering", email: "mateo.gonzalez@uevents.dev"   },
];

const COMMENTS: Record<string, { email: string; content: string; replies?: { email: string; content: string }[] }[]> = {
    "Winter Wonderland Ball": [
        {
            email: "marcus.chen@uevents.dev",
            content: "The ticket price increase from last year is a bit steep, but the venue choice looks absolutely stunning. Can't wait!",
            replies: [
                { email: "priya.nair@uevents.dev", content: "Agreed on the price, but honestly the last ball was worth every cent. Think this one will be even better." },
            ],
        },
        { email: "sarah.jenkins@uevents.dev", content: "Will there be early bird access for union members? The post mentions it but the link is taking me to a 404 page." },
        { email: "leo.thompson@uevents.dev",  content: "Finally! The winter gala is the highlight of the semester. Love the Midnight theme choice." },
        { email: "tariq.osei@uevents.dev",    content: "Bought my ticket the second registration opened. This is going to be legendary." },
        { email: "maya.patel@uevents.dev",    content: "Is this open to first-years too? First time hearing about this event!" },
        { email: "chloe.bergeron@uevents.dev", content: "Already got a dress picked out. The venue photos from last year looked incredible." },
    ],
    "Hackathon Kickoff": [
        {
            email: "daniel.park@uevents.dev",
            content: "Is this recorded? I have a conflict that week but really want to catch the content.",
            replies: [
                { email: "james.okafor@uevents.dev", content: "Same question — hoping they post it somewhere after." },
            ],
        },
        { email: "emma.rivera@uevents.dev",   content: "The speaker lineup is incredible. Signed up immediately." },
        { email: "noah.williams@uevents.dev", content: "Room capacity says 40 but registration already hit 60. Is there overflow space?" },
        { email: "james.okafor@uevents.dev",  content: "Last year's hackathon was the best event I attended. Cannot miss this one." },
        { email: "kai.nakamura@uevents.dev",  content: "Looking for a team — anyone want a game dev on their squad?" },
        { email: "samuel.adeyemi@uevents.dev", content: "What tech stack can we use? Any restrictions?" },
    ],
    "Tech Industry Panel": [
        {
            email: "lily.chen@uevents.dev",
            content: "Will there be a networking session after? Would love to connect with the panelists.",
            replies: [
                { email: "tariq.osei@uevents.dev", content: "Usually there is! Last year they stayed for almost an hour after." },
            ],
        },
        { email: "jordan.scott@uevents.dev",  content: "Which companies are represented on the panel this year?" },
        { email: "aisha.mensah@uevents.dev",  content: "Already got my questions ready. So glad this is open to all students." },
        { email: "elijah.brown@uevents.dev",  content: "Any fintech companies on the panel? Would love to connect." },
    ],
    "New Semester, New Exec Team": [
        { email: "marcus.chen@uevents.dev",   content: "Congrats to the new exec! Really excited to see what this semester brings." },
        { email: "priya.nair@uevents.dev",    content: "Love seeing fresh faces on the team. Welcome everyone!" },
        { email: "samuel.adeyemi@uevents.dev", content: "Big shoes to fill but I know this team has it. Let's go!" },
    ],
    "HIIT Bootcamp": [
        { email: "leo.thompson@uevents.dev",  content: "7:30 AM is early but honestly the best way to start the day. Worth it." },
        { email: "sarah.jenkins@uevents.dev", content: "Do we need to register in advance or just show up?" },
        { email: "tariq.osei@uevents.dev",    content: "Best workout class on campus, hands down." },
        { email: "mateo.gonzalez@uevents.dev", content: "How intense is it really? First timer here." },
    ],
    "Game Jam: 48h Sprint": [
        {
            email: "noah.williams@uevents.dev",
            content: "48 hours is the perfect jam length. Not too short, not too long.",
            replies: [
                { email: "kai.nakamura@uevents.dev", content: "Totally agree. 72h is too much pressure and 24h is too short to actually finish anything polished." },
            ],
        },
        { email: "emma.rivera@uevents.dev",   content: "Formed my team already. We are ready." },
        { email: "jordan.scott@uevents.dev",  content: "Will there be prizes this year? Either way I'm in." },
        { email: "kai.nakamura@uevents.dev",  content: "Can we use assets from outside sources or everything from scratch?" },
        { email: "samuel.adeyemi@uevents.dev", content: "Anyone want to team up? I can handle backend and basic Unity stuff." },
    ],
    "What class should we add next semester?": [
        { email: "aisha.mensah@uevents.dev",  content: "Voted Pilates! There's nothing like it on campus right now." },
        { email: "daniel.park@uevents.dev",   content: "Boxing please. We need something high energy in the evening slot." },
        { email: "lily.chen@uevents.dev",     content: "Spin class would fill up instantly. Please make it happen!" },
        { email: "zoe.tremblay@uevents.dev",  content: "Pilates or yoga — we need more low-impact options for people recovering from injuries." },
    ],
    "Open Mic Night": [
        { email: "zoe.tremblay@uevents.dev",  content: "Performing tonight! Come support — doors open at 7." },
        { email: "chloe.bergeron@uevents.dev", content: "I've been to every single open mic this semester. The talent here is unreal." },
        { email: "isabelle.lavoie@uevents.dev", content: "Going to photograph the whole thing. If you want shots from tonight DM me!" },
        {
            email: "maya.patel@uevents.dev",
            content: "Is there a minimum skill level to perform? I've been practicing guitar for about a year.",
            replies: [
                { email: "zoe.tremblay@uevents.dev", content: "Not at all! Everyone is super supportive. The whole vibe is encouraging, not competitive." },
            ],
        },
    ],
    "Pitch Night: Spring Edition": [
        { email: "elijah.brown@uevents.dev",  content: "Pitching my fintech idea tonight — super nervous but ready." },
        { email: "lily.chen@uevents.dev",     content: "These pitch nights are always so inspiring. The energy in the room is electric." },
        {
            email: "mateo.gonzalez@uevents.dev",
            content: "Is it okay to pitch an idea that's still just a concept with no MVP?",
            replies: [
                { email: "elijah.brown@uevents.dev", content: "From what I know, yes — it's more about the idea and the pitch itself than having a product built." },
            ],
        },
    ],
    "Our game hit 500 downloads!": [
        { email: "emma.rivera@uevents.dev",   content: "This is huge! Congrats everyone who worked on it." },
        { email: "jordan.scott@uevents.dev",  content: "I showed a few friends and they both downloaded it. Love seeing student work get recognition!" },
        { email: "noah.williams@uevents.dev", content: "Can we get a link to the itch.io page?" },
        { email: "kai.nakamura@uevents.dev",  content: "500 downloads in one semester is legitimately impressive. Milestone to be proud of." },
    ],
    "Golden Hour Photo Walk": [
        { email: "isabelle.lavoie@uevents.dev", content: "Finally! I've been waiting for one of these. The campus has incredible light around 5:30 PM." },
        {
            email: "chloe.bergeron@uevents.dev",
            content: "Does it matter what camera you bring? I just have my iPhone.",
            replies: [
                { email: "isabelle.lavoie@uevents.dev", content: "Totally fine! Some of my favourite shots come from phones. It's about the eye, not the gear." },
            ],
        },
    ],
    "Resume & LinkedIn Workshop": [
        { email: "maya.patel@uevents.dev",    content: "Desperately needed this. Registering right now." },
        { email: "marcus.chen@uevents.dev",   content: "Is there a cap on how many people can attend? Don't want to miss out." },
        { email: "priya.nair@uevents.dev",    content: "Came to the last one — the feedback was incredibly specific and useful. Highly recommend." },
    ],
    "Beat Battle – Producer Edition": [
        { email: "zoe.tremblay@uevents.dev",  content: "This is the most fun event on campus, no debate. Went last semester and the energy was unmatched." },
        { email: "kai.nakamura@uevents.dev",  content: "Can you sign up to compete at the door or only in advance?" },
        { email: "chloe.bergeron@uevents.dev", content: "Bringing my whole floor for this one." },
    ],
    "End-of-Semester Concert – Save the Date": [
        { email: "zoe.tremblay@uevents.dev",  content: "Can't believe it's already that time. The semester flew by." },
        { email: "chloe.bergeron@uevents.dev", content: "Clearing my schedule immediately. Last year's show was incredible." },
    ],
};

async function main() {
    console.log("Seeding interactions...\n");
    const hash = await bcrypt.hash("password123", 12);

    // ── 1. Create students ───────────────────────────────────────────────────
    const students: Record<string, string> = {}; // email → id
    for (const s of STUDENTS) {
        const user = await prisma.user.upsert({
            where: { email: s.email },
            update: {},
            create: {
                email: s.email,
                passwordHash: hash,
                type: "STUDENT",
                firstName: s.firstName,
                lastName: s.lastName,
                year: s.year,
                program: s.program,
                avatarUrl: `https://picsum.photos/seed/${s.firstName.toLowerCase()}${s.lastName.toLowerCase()}/200/200`,
            },
        });
        students[s.email] = user.id;
        console.log(`  Student: ${s.firstName} ${s.lastName} (${s.year})`);
    }

    // ── 2. Fetch all clubs and posts ─────────────────────────────────────────
    const clubs = await prisma.user.findMany({
        where: { type: "CLUB" },
        select: { id: true, slug: true, clubName: true },
    });
    const clubBySlug = Object.fromEntries(clubs.map((c) => [c.slug ?? c.id, c]));

    const posts = await prisma.post.findMany({
        where: { isDraft: false },
        include: { pollOptions: true },
    });
    const postByTitle: Record<string, typeof posts[0]> = {};
    for (const p of posts) {
        const title = (p.locales as any)?.en?.title ?? "";
        if (title) postByTitle[title] = p;
    }

    console.log(`\n  Found ${clubs.length} clubs, ${posts.length} posts\n`);

    // ── 3. Follows ───────────────────────────────────────────────────────────
    const followMap: Record<string, string[]> = {
        "marcus.chen@uevents.dev":    ["cssa", "cs-club", "game-dev"],
        "sarah.jenkins@uevents.dev":  ["cssa", "campus-fitness", "music"],
        "leo.thompson@uevents.dev":   ["campus-fitness", "debate", "music"],
        "priya.nair@uevents.dev":     ["cssa", "cs-club"],
        "james.okafor@uevents.dev":   ["cs-club", "game-dev", "debate"],
        "aisha.mensah@uevents.dev":   ["cssa", "campus-fitness", "debate"],
        "daniel.park@uevents.dev":    ["cssa", "cs-club"],
        "emma.rivera@uevents.dev":    ["game-dev", "cs-club", "music"],
        "noah.williams@uevents.dev":  ["campus-fitness", "game-dev"],
        "tariq.osei@uevents.dev":     ["cssa", "cs-club", "campus-fitness", "game-dev", "debate"],
        "lily.chen@uevents.dev":      ["cssa", "campus-fitness", "entrep"],
        "jordan.scott@uevents.dev":   ["game-dev", "cs-club", "debate"],
        "maya.patel@uevents.dev":     ["cssa", "cs-club", "music"],
        "elijah.brown@uevents.dev":   ["entrep", "cssa"],
        "zoe.tremblay@uevents.dev":   ["music", "campus-fitness"],
        "kai.nakamura@uevents.dev":   ["game-dev", "cs-club", "music"],
        "isabelle.lavoie@uevents.dev":["photo", "music", "campus-fitness"],
        "samuel.adeyemi@uevents.dev": ["cssa", "cs-club", "game-dev", "entrep"],
        "chloe.bergeron@uevents.dev": ["music", "photo", "debate"],
        "mateo.gonzalez@uevents.dev": ["campus-fitness", "entrep"],
    };

    for (const [email, slugs] of Object.entries(followMap)) {
        const userId = students[email];
        for (const slug of slugs) {
            const club = clubBySlug[slug];
            if (!club) continue;
            await prisma.follow.upsert({
                where: { userId_clubId: { userId, clubId: club.id } },
                update: {},
                create: { userId, clubId: club.id, notifPref: "ALL" },
            });
        }
    }
    console.log("  Follows created");

    // ── 4. Likes ─────────────────────────────────────────────────────────────
    const likeMap: Record<string, string[]> = {
        "Winter Wonderland Ball":            ["marcus.chen@uevents.dev","sarah.jenkins@uevents.dev","leo.thompson@uevents.dev","priya.nair@uevents.dev","aisha.mensah@uevents.dev","tariq.osei@uevents.dev","lily.chen@uevents.dev","maya.patel@uevents.dev","chloe.bergeron@uevents.dev"],
        "Hackathon Kickoff":                 ["daniel.park@uevents.dev","emma.rivera@uevents.dev","james.okafor@uevents.dev","marcus.chen@uevents.dev","priya.nair@uevents.dev","kai.nakamura@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Tech Industry Panel":               ["lily.chen@uevents.dev","jordan.scott@uevents.dev","aisha.mensah@uevents.dev","tariq.osei@uevents.dev","daniel.park@uevents.dev","elijah.brown@uevents.dev"],
        "New Semester, New Exec Team":       ["marcus.chen@uevents.dev","priya.nair@uevents.dev","sarah.jenkins@uevents.dev","samuel.adeyemi@uevents.dev"],
        "HIIT Bootcamp":                     ["leo.thompson@uevents.dev","sarah.jenkins@uevents.dev","tariq.osei@uevents.dev","noah.williams@uevents.dev","mateo.gonzalez@uevents.dev"],
        "Game Jam: 48h Sprint":              ["noah.williams@uevents.dev","emma.rivera@uevents.dev","jordan.scott@uevents.dev","james.okafor@uevents.dev","marcus.chen@uevents.dev","kai.nakamura@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Indie Dev Mixer":                   ["emma.rivera@uevents.dev","jordan.scott@uevents.dev","james.okafor@uevents.dev","kai.nakamura@uevents.dev"],
        "Midterm Study Jam":                 ["priya.nair@uevents.dev","daniel.park@uevents.dev","sarah.jenkins@uevents.dev","marcus.chen@uevents.dev","maya.patel@uevents.dev"],
        "Public Speaking Workshop":          ["aisha.mensah@uevents.dev","james.okafor@uevents.dev","jordan.scott@uevents.dev","leo.thompson@uevents.dev","chloe.bergeron@uevents.dev"],
        "Our game hit 500 downloads!":       ["emma.rivera@uevents.dev","jordan.scott@uevents.dev","noah.williams@uevents.dev","james.okafor@uevents.dev","marcus.chen@uevents.dev","tariq.osei@uevents.dev","kai.nakamura@uevents.dev"],
        "What class should we add next semester?": ["aisha.mensah@uevents.dev","daniel.park@uevents.dev","lily.chen@uevents.dev","sarah.jenkins@uevents.dev","zoe.tremblay@uevents.dev"],
        "Morning Yoga Session":              ["sarah.jenkins@uevents.dev","lily.chen@uevents.dev","aisha.mensah@uevents.dev","zoe.tremblay@uevents.dev","isabelle.lavoie@uevents.dev"],
        "Open Mic Night":                    ["zoe.tremblay@uevents.dev","chloe.bergeron@uevents.dev","isabelle.lavoie@uevents.dev","maya.patel@uevents.dev","sarah.jenkins@uevents.dev","leo.thompson@uevents.dev","emma.rivera@uevents.dev"],
        "Pitch Night: Spring Edition":       ["elijah.brown@uevents.dev","lily.chen@uevents.dev","mateo.gonzalez@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Golden Hour Photo Walk":            ["isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev","maya.patel@uevents.dev"],
        "Beat Battle – Producer Edition":    ["zoe.tremblay@uevents.dev","kai.nakamura@uevents.dev","chloe.bergeron@uevents.dev","emma.rivera@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Resume & LinkedIn Workshop":        ["maya.patel@uevents.dev","marcus.chen@uevents.dev","priya.nair@uevents.dev","daniel.park@uevents.dev"],
        "End-of-Semester Concert – Save the Date": ["zoe.tremblay@uevents.dev","chloe.bergeron@uevents.dev","sarah.jenkins@uevents.dev","leo.thompson@uevents.dev","emma.rivera@uevents.dev"],
        "Startup Weekend Concordia":         ["elijah.brown@uevents.dev","samuel.adeyemi@uevents.dev","lily.chen@uevents.dev","mateo.gonzalez@uevents.dev"],
        "Annual Spring Gallery Show":        ["isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev"],
        "Founder Fireside: Building in Public": ["elijah.brown@uevents.dev","lily.chen@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Darkroom Intro Session":            ["isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev"],
        "Lunchtime Run Club":                ["mateo.gonzalez@uevents.dev","noah.williams@uevents.dev","leo.thompson@uevents.dev"],
    };

    let likeCount = 0;
    for (const [title, emails] of Object.entries(likeMap)) {
        const post = postByTitle[title];
        if (!post) continue;
        for (const email of emails) {
            const userId = students[email];
            if (!userId) continue;
            await prisma.like.upsert({
                where: { userId_postId: { userId, postId: post.id } },
                update: {},
                create: { userId, postId: post.id },
            });
            likeCount++;
        }
    }
    console.log(`  ${likeCount} likes created`);

    // ── 5. RSVPs ─────────────────────────────────────────────────────────────
    const rsvpMap: Record<string, string[]> = {
        "Winter Wonderland Ball":    ["marcus.chen@uevents.dev","sarah.jenkins@uevents.dev","priya.nair@uevents.dev","aisha.mensah@uevents.dev","tariq.osei@uevents.dev","lily.chen@uevents.dev","maya.patel@uevents.dev","chloe.bergeron@uevents.dev"],
        "Hackathon Kickoff":         ["daniel.park@uevents.dev","emma.rivera@uevents.dev","james.okafor@uevents.dev","marcus.chen@uevents.dev","kai.nakamura@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Tech Industry Panel":       ["lily.chen@uevents.dev","tariq.osei@uevents.dev","aisha.mensah@uevents.dev","priya.nair@uevents.dev","elijah.brown@uevents.dev"],
        "HIIT Bootcamp":             ["leo.thompson@uevents.dev","sarah.jenkins@uevents.dev","noah.williams@uevents.dev","mateo.gonzalez@uevents.dev"],
        "Game Jam: 48h Sprint":      ["emma.rivera@uevents.dev","jordan.scott@uevents.dev","james.okafor@uevents.dev","noah.williams@uevents.dev","kai.nakamura@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Indie Dev Mixer":           ["emma.rivera@uevents.dev","jordan.scott@uevents.dev","kai.nakamura@uevents.dev"],
        "Midterm Study Jam":         ["priya.nair@uevents.dev","daniel.park@uevents.dev","marcus.chen@uevents.dev","maya.patel@uevents.dev"],
        "Public Speaking Workshop":  ["aisha.mensah@uevents.dev","jordan.scott@uevents.dev","leo.thompson@uevents.dev","chloe.bergeron@uevents.dev"],
        "Morning Yoga Session":      ["sarah.jenkins@uevents.dev","lily.chen@uevents.dev","zoe.tremblay@uevents.dev","isabelle.lavoie@uevents.dev"],
        "Open Mic Night":            ["zoe.tremblay@uevents.dev","chloe.bergeron@uevents.dev","maya.patel@uevents.dev","isabelle.lavoie@uevents.dev","sarah.jenkins@uevents.dev"],
        "Pitch Night: Spring Edition": ["elijah.brown@uevents.dev","lily.chen@uevents.dev","mateo.gonzalez@uevents.dev"],
        "Golden Hour Photo Walk":    ["isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev","maya.patel@uevents.dev"],
        "Beat Battle – Producer Edition": ["zoe.tremblay@uevents.dev","kai.nakamura@uevents.dev","chloe.bergeron@uevents.dev"],
        "Resume & LinkedIn Workshop": ["maya.patel@uevents.dev","marcus.chen@uevents.dev","priya.nair@uevents.dev","daniel.park@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Startup Weekend Concordia": ["elijah.brown@uevents.dev","samuel.adeyemi@uevents.dev","lily.chen@uevents.dev"],
        "Lunchtime Run Club":        ["mateo.gonzalez@uevents.dev","noah.williams@uevents.dev","leo.thompson@uevents.dev","sarah.jenkins@uevents.dev"],
        "Weekend Hike – Mont Royal": ["mateo.gonzalez@uevents.dev","noah.williams@uevents.dev","sarah.jenkins@uevents.dev","zoe.tremblay@uevents.dev","isabelle.lavoie@uevents.dev"],
        "Founder Fireside: Building in Public": ["elijah.brown@uevents.dev","lily.chen@uevents.dev","samuel.adeyemi@uevents.dev","mateo.gonzalez@uevents.dev"],
        "Darkroom Intro Session":    ["isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev"],
        "Annual Spring Gallery Show": ["isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev","zoe.tremblay@uevents.dev","maya.patel@uevents.dev"],
    };

    let rsvpCount = 0;
    for (const [title, emails] of Object.entries(rsvpMap)) {
        const post = postByTitle[title];
        if (!post) continue;
        for (const email of emails) {
            const userId = students[email];
            if (!userId) continue;
            await prisma.rsvp.upsert({
                where: { userId_postId: { userId, postId: post.id } },
                update: {},
                create: { userId, postId: post.id },
            });
            rsvpCount++;
        }
    }
    console.log(`  ${rsvpCount} RSVPs created`);

    // ── 6. Bookmarks ─────────────────────────────────────────────────────────
    const bookmarkMap: Record<string, string[]> = {
        "Winter Wonderland Ball":            ["tariq.osei@uevents.dev","lily.chen@uevents.dev","aisha.mensah@uevents.dev","chloe.bergeron@uevents.dev"],
        "Hackathon Kickoff":                 ["daniel.park@uevents.dev","marcus.chen@uevents.dev","kai.nakamura@uevents.dev"],
        "Tech Industry Panel":               ["lily.chen@uevents.dev","jordan.scott@uevents.dev","elijah.brown@uevents.dev"],
        "Our game hit 500 downloads!":       ["emma.rivera@uevents.dev","jordan.scott@uevents.dev","kai.nakamura@uevents.dev"],
        "Game Jam: 48h Sprint":              ["noah.williams@uevents.dev","james.okafor@uevents.dev","samuel.adeyemi@uevents.dev"],
        "What class should we add next semester?": ["aisha.mensah@uevents.dev","sarah.jenkins@uevents.dev","zoe.tremblay@uevents.dev"],
        "Public Speaking Workshop":          ["jordan.scott@uevents.dev","chloe.bergeron@uevents.dev"],
        "Pitch Night: Spring Edition":       ["elijah.brown@uevents.dev","samuel.adeyemi@uevents.dev"],
        "Startup Weekend Concordia":         ["samuel.adeyemi@uevents.dev","lily.chen@uevents.dev"],
        "Resume & LinkedIn Workshop":        ["maya.patel@uevents.dev","priya.nair@uevents.dev"],
        "Golden Hour Photo Walk":            ["isabelle.lavoie@uevents.dev","chloe.bergeron@uevents.dev"],
        "End-of-Semester Concert – Save the Date": ["zoe.tremblay@uevents.dev","sarah.jenkins@uevents.dev"],
    };

    let bookmarkCount = 0;
    for (const [title, emails] of Object.entries(bookmarkMap)) {
        const post = postByTitle[title];
        if (!post) continue;
        for (const email of emails) {
            const userId = students[email];
            if (!userId) continue;
            await prisma.bookmark.upsert({
                where: { userId_postId: { userId, postId: post.id } },
                update: {},
                create: { userId, postId: post.id },
            });
            bookmarkCount++;
        }
    }
    console.log(`  ${bookmarkCount} bookmarks created`);

    // ── 7. Comments (with replies) ───────────────────────────────────────────
    let commentCount = 0;
    for (const [title, comments] of Object.entries(COMMENTS)) {
        const post = postByTitle[title];
        if (!post) { console.log(`  Post not found: "${title}"`); continue; }
        for (const { email, content, replies } of comments) {
            const userId = students[email];
            if (!userId) continue;
            const existing = await prisma.comment.findFirst({ where: { postId: post.id, userId, content } });
            let parentId = existing?.id;
            if (!existing) {
                const created = await prisma.comment.create({ data: { postId: post.id, userId, content } });
                parentId = created.id;
                commentCount++;
            }
            if (replies && parentId) {
                for (const reply of replies) {
                    const replyUserId = students[reply.email];
                    if (!replyUserId) continue;
                    const existingReply = await prisma.comment.findFirst({ where: { postId: post.id, userId: replyUserId, content: reply.content } });
                    if (!existingReply) {
                        await prisma.comment.create({ data: { postId: post.id, userId: replyUserId, content: reply.content, parentId } });
                        commentCount++;
                    }
                }
            }
        }
    }
    console.log(`  ${commentCount} comments created`);

    // ── 8. Poll votes ────────────────────────────────────────────────────────
    const pollVotes: { pollTitle: string; votes: { email: string; optionIndex: number }[] }[] = [
        {
            pollTitle: "What class should we add next semester?",
            votes: [
                { email: "aisha.mensah@uevents.dev",  optionIndex: 1 },
                { email: "daniel.park@uevents.dev",   optionIndex: 3 },
                { email: "lily.chen@uevents.dev",     optionIndex: 0 },
                { email: "sarah.jenkins@uevents.dev", optionIndex: 1 },
                { email: "noah.williams@uevents.dev", optionIndex: 2 },
                { email: "tariq.osei@uevents.dev",    optionIndex: 0 },
                { email: "zoe.tremblay@uevents.dev",  optionIndex: 1 },
                { email: "mateo.gonzalez@uevents.dev", optionIndex: 3 },
            ],
        },
        {
            pollTitle: "What genre should we focus on for the spring concert?",
            votes: [
                { email: "zoe.tremblay@uevents.dev",  optionIndex: 0 },
                { email: "chloe.bergeron@uevents.dev", optionIndex: 2 },
                { email: "maya.patel@uevents.dev",    optionIndex: 2 },
                { email: "emma.rivera@uevents.dev",   optionIndex: 0 },
                { email: "kai.nakamura@uevents.dev",  optionIndex: 1 },
                { email: "sarah.jenkins@uevents.dev", optionIndex: 0 },
            ],
        },
        {
            pollTitle: "Best time for our weekly general meeting?",
            votes: [
                { email: "marcus.chen@uevents.dev",   optionIndex: 1 },
                { email: "daniel.park@uevents.dev",   optionIndex: 1 },
                { email: "priya.nair@uevents.dev",    optionIndex: 2 },
                { email: "kai.nakamura@uevents.dev",  optionIndex: 0 },
                { email: "samuel.adeyemi@uevents.dev", optionIndex: 2 },
                { email: "james.okafor@uevents.dev",  optionIndex: 3 },
            ],
        },
    ];

    let voteCount = 0;
    for (const { pollTitle, votes } of pollVotes) {
        const poll = postByTitle[pollTitle];
        if (!poll || !poll.pollOptions.length) continue;
        for (const { email, optionIndex } of votes) {
            const userId = students[email];
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
    console.log(`  ${voteCount} poll votes created`);

    console.log("\nDone! All accounts use password: password123");
    for (const s of STUDENTS) {
        console.log(`  ${s.email.padEnd(38)} ${s.year}`);
    }
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
