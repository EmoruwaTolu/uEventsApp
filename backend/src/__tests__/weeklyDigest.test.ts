import { request, registerStudent, registerClub, createEvent, cleanupRun } from "./helpers";
import { prisma } from "../lib/prisma";
import { runWeeklyDigest } from "../jobs/weeklyDigest";

afterAll(cleanupRun);

describe("Weekly digest job", () => {
    it("sends a digest summarising upcoming interest matches, once per week", async () => {
        const { clubId, token: clubToken } = await registerClub("wd-club");
        // Event within the coming week.
        await createEvent(clubToken, clubId, {
            startAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
            endAt:   new Date(Date.now() + 2 * 86400_000 + 3600_000).toISOString(),
        });

        const { token: studentToken, userId } = await registerStudent("wd-student");
        // Following the club makes the event an "interest match".
        await request.post(`/clubs/${clubId}/follow`).set("Authorization", `Bearer ${studentToken}`);

        const first = await runWeeklyDigest(new Date(), { userIds: [userId] });
        expect(first.sent).toBe(1);

        const notif = await prisma.notification.findFirst({ where: { userId, type: "DIGEST" } });
        expect(notif).toBeTruthy();
        expect(notif!.body).toMatch(/matching your interests/);

        // Idempotent within the 6-day window: no second digest.
        const second = await runWeeklyDigest(new Date(), { userIds: [userId] });
        expect(second.sent).toBe(0);
        const count = await prisma.notification.count({ where: { userId, type: "DIGEST" } });
        expect(count).toBe(1);
    });

    it("counts RSVPs the student already holds for the coming week", async () => {
        const { clubId, token: clubToken } = await registerClub("wd2-club");
        const { eventId } = await createEvent(clubToken, clubId, {
            startAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
            endAt:   new Date(Date.now() + 3 * 86400_000 + 3600_000).toISOString(),
        });
        const { token: studentToken, userId } = await registerStudent("wd2-student");
        await request.post(`/posts/${eventId}/rsvp`).set("Authorization", `Bearer ${studentToken}`);

        const res = await runWeeklyDigest(new Date(), { userIds: [userId] });
        expect(res.sent).toBe(1);
        const notif = await prisma.notification.findFirst({ where: { userId, type: "DIGEST" } });
        expect(notif!.body).toMatch(/1 RSVP/);
    });

    it("skips students with nothing to report", async () => {
        const { userId } = await registerStudent("wd-quiet");
        const res = await runWeeklyDigest(new Date(), { userIds: [userId] });
        expect(res.sent).toBe(0);
    });
});
