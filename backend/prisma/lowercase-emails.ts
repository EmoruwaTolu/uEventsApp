/**
 * One-time migration: lowercase + trim all existing user emails.
 *
 * Run once after deploying the email-normalization fix (BETA_AUDIT P0-2):
 *   npx ts-node prisma/lowercase-emails.ts
 *
 * Safe to re-run. If two accounts collide when lowercased (e.g. Jane@x.ca and
 * jane@x.ca), neither is touched — they're reported for manual resolution
 * instead, since merging accounts is a product decision, not a script's.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
    const users = await prisma.user.findMany({ select: { id: true, email: true } });

    const needsFix = users.filter((u) => u.email !== u.email.trim().toLowerCase());
    console.log(`${users.length} users, ${needsFix.length} need normalization.`);

    let updated = 0;
    const collisions: string[] = [];

    for (const u of needsFix) {
        const normalized = u.email.trim().toLowerCase();
        const conflict = users.find(
            (other) => other.id !== u.id && other.email.trim().toLowerCase() === normalized,
        );
        if (conflict) {
            collisions.push(`${u.email} (${u.id}) ↔ ${conflict.email} (${conflict.id})`);
            continue;
        }
        await prisma.user.update({ where: { id: u.id }, data: { email: normalized } });
        updated++;
    }

    console.log(`Updated ${updated} users.`);
    if (collisions.length) {
        console.log(`\n⚠️  ${collisions.length} collision(s) left untouched — resolve manually:`);
        collisions.forEach((c) => console.log(`  ${c}`));
    }
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
