import supertest from "supertest";
import app from "../app";
import { prisma } from "../lib/prisma";

export const request = supertest(app);

// Unique suffix to namespace all test data so parallel runs don't clash
export const RUN_ID = `test-${Date.now()}`;

export function testEmail(label: string) {
    return `${label}-${RUN_ID}@example.com`;
}

export async function registerStudent(label = "student") {
    const email = testEmail(label);
    const res = await request.post("/users/add-user").send({
        email,
        password: "Password123!",
        firstName: "Test",
        lastName: "User",
        type: "STUDENT",
    });
    return { email, token: res.body.token as string, userId: res.body.user?.id as string, res };
}

export async function registerClub(label = "club") {
    const email = testEmail(label);
    const res = await request.post("/users/add-user").send({
        email,
        password: "Password123!",
        clubName: `Test Club ${label}`,
        slug: `test-club-${label}-${RUN_ID}`.slice(0, 60).replace(/[^a-z0-9-]/g, "-"),
        category: "Sports",
        type: "CLUB",
        inviteCode: process.env.CLUB_INVITE_CODE ?? "test-invite",
    });
    return { email, token: res.body.token as string, clubId: res.body.user?.id as string, res };
}

export async function createEvent(clubToken: string, clubId: string, overrides: Record<string, unknown> = {}) {
    const res = await request
        .post("/posts")
        .set("Authorization", `Bearer ${clubToken}`)
        .send({
            type: "EVENT",
            locales: { en: { title: "Test Event", body: "Test body" } },
            startAt: new Date(Date.now() + 86400_000).toISOString(),
            endAt:   new Date(Date.now() + 90000_000).toISOString(),
            locationName: "Test Venue",
            isDraft: false,
            ...overrides,
        });
    return { eventId: res.body.id as string, res };
}

// Delete all data created in this test run, respecting FK constraints.
// Posts must go before Users because Post.clubId has no onDelete cascade.
export async function cleanupRun() {
    const users = await prisma.user.findMany({
        where: { email: { contains: RUN_ID } },
        select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length === 0) return;

    // Posts created by test clubs (cascades: RSVPs, likes, comments, bookmarks, views, poll data)
    await prisma.post.deleteMany({ where: { clubId: { in: ids } } });

    // User-level join records (follower/following, likes/bookmarks made by students, RSVPs)
    await prisma.follow.deleteMany({ where: { OR: [{ userId: { in: ids } }, { clubId: { in: ids } }] } });
    await prisma.rsvp.deleteMany({ where: { userId: { in: ids } } });
    await prisma.waitlist.deleteMany({ where: { userId: { in: ids } } });
    await prisma.like.deleteMany({ where: { userId: { in: ids } } });
    await prisma.bookmark.deleteMany({ where: { userId: { in: ids } } });
    await prisma.comment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.report.deleteMany({ where: { reporterId: { in: ids } } });
    await prisma.feedback.deleteMany({ where: { userId: { in: ids } } });

    await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
