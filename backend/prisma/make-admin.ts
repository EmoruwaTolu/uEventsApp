/**
 * make-admin.ts — grant a user the ADMIN role (for the /admin moderation dashboard).
 * ─────────────────────────────────────────────────────────────────────────────
 * Promotes an existing account, or creates a dedicated admin account if the email
 * isn't found yet. Run locally from backend/ (uses DATABASE_URL from .env):
 *
 *   Promote an existing user:   npm run db:make-admin -- you@uottawa.ca
 *   Create a new admin:         npm run db:make-admin -- admin@uottawa.ca 'a-strong-password'
 *
 * Tip: a DEDICATED admin account is cleaner than promoting your personal one — the
 * mobile app expects STUDENT/CLUB accounts, so keep ADMIN for the web dashboard.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const email = process.argv[2]?.trim().toLowerCase();
    const password = process.argv[3];
    if (!email) {
        console.error("Usage: npm run db:make-admin -- <email> [password]");
        process.exit(1);
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
        if (existing.type === "ADMIN") {
            console.log(`ℹ️  ${email} is already an ADMIN. Nothing to do.`);
        } else {
            await prisma.user.update({ where: { email }, data: { type: "ADMIN" } });
            console.log(`✅ ${email} promoted to ADMIN (was ${existing.type}).`);
        }
    } else {
        if (!password) {
            console.error(`No account for ${email}. To create a new admin, pass a password:\n  npm run db:make-admin -- ${email} 'a-strong-password'`);
            process.exit(1);
        }
        const passwordHash = await bcrypt.hash(password, 12);
        await prisma.user.create({
            data: { email, passwordHash, type: "ADMIN", emailVerified: new Date(), firstName: "Admin" },
        });
        console.log(`✅ Created new ADMIN account ${email}.`);
    }

    console.log("→ Sign in at https://ueventsapp.onrender.com/admin to review reports.");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
