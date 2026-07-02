import { request, registerStudent, registerClub, createEvent, cleanupRun } from "./helpers";
import { prisma } from "../lib/prisma";

afterAll(cleanupRun);

function rsvp(token: string, postId: string) {
    return request.post(`/posts/${postId}/rsvp`).set("Authorization", `Bearer ${token}`);
}

describe("Waitlist position", () => {
    it("reports position when joining the waitlist and in the post detail", async () => {
        const { clubId, token: clubToken } = await registerClub("wl-club");
        const { eventId } = await createEvent(clubToken, clubId, { capacity: 1 });

        const { token: a } = await registerStudent("wl-a");
        const { token: b } = await registerStudent("wl-b");
        const { token: c } = await registerStudent("wl-c");

        // First RSVP takes the only spot.
        const ra = await rsvp(a, eventId);
        expect(ra.status).toBe(201);
        expect(ra.body.rsvped).toBe(true);
        expect(ra.body.waitlisted).toBe(false);

        // Next two are waitlisted at positions 1 and 2.
        const rb = await rsvp(b, eventId);
        expect(rb.body.waitlisted).toBe(true);
        expect(rb.body.waitlistPosition).toBe(1);

        const rc = await rsvp(c, eventId);
        expect(rc.body.waitlisted).toBe(true);
        expect(rc.body.waitlistPosition).toBe(2);

        // The detail endpoint surfaces the viewer's own position.
        const detail = await request.get(`/posts/${eventId}`).set("Authorization", `Bearer ${c}`);
        expect(detail.body.pendingRsvp).toBe(true);
        expect(detail.body.waitlistPosition).toBe(2);

        // A confirmed attendee has no waitlist position.
        const detailA = await request.get(`/posts/${eventId}`).set("Authorization", `Bearer ${a}`);
        expect(detailA.body.isRsvped).toBe(true);
        expect(detailA.body.waitlistPosition).toBeNull();
    }, 30000);

    it("re-promotes and shifts position when someone ahead leaves", async () => {
        const { clubId, token: clubToken } = await registerClub("wl2-club");
        const { eventId } = await createEvent(clubToken, clubId, { capacity: 1 });
        const { token: a } = await registerStudent("wl2-a");
        const { token: b } = await registerStudent("wl2-b");
        const { token: c } = await registerStudent("wl2-c");

        await rsvp(a, eventId);           // confirmed
        await rsvp(b, eventId);           // waitlist #1
        const rc = await rsvp(c, eventId); // waitlist #2
        expect(rc.body.waitlistPosition).toBe(2);

        // b leaves the waitlist → c moves up to #1
        await request.delete(`/posts/${eventId}/rsvp`).set("Authorization", `Bearer ${b}`);
        const detailC = await request.get(`/posts/${eventId}`).set("Authorization", `Bearer ${c}`);
        expect(detailC.body.waitlistPosition).toBe(1);
    }, 30000);
});

describe("Capacity exposed on feed payloads", () => {
    it("includes capacity on events in the following feed", async () => {
        const { clubId, token: clubToken } = await registerClub("cap-club");
        const { eventId } = await createEvent(clubToken, clubId, { capacity: 42 });

        const { token: student } = await registerStudent("cap-student");
        await request.post(`/clubs/${clubId}/follow`).set("Authorization", `Bearer ${student}`);

        const feed = await request.get("/posts/feed").set("Authorization", `Bearer ${student}`);
        expect(feed.status).toBe(200);
        const item = feed.body.find((p: any) => p.id === eventId);
        expect(item).toBeTruthy();
        expect(item.capacity).toBe(42);
    });
});

describe("Show less like this", () => {
    it("records a signal and drops the post from For You", async () => {
        const { clubId, token: clubToken } = await registerClub("sl-club");
        const { eventId } = await createEvent(clubToken, clubId, { categories: ["Music"] });
        const { token: student, userId } = await registerStudent("sl-student");

        const res = await request
            .post(`/posts/${eventId}/show-less`)
            .set("Authorization", `Bearer ${student}`)
            .send({ reason: "Matches your interest: Music" });
        expect(res.status).toBe(201);

        // The signal is persisted with the post's club + categories.
        const signal = await prisma.feedSignal.findFirst({ where: { userId, postId: eventId } });
        expect(signal).toBeTruthy();
        expect(signal!.clubId).toBe(clubId);
        expect(signal!.categories).toContain("Music");

        // The muted post is excluded from the ranked For You feed.
        const forYou = await request.get("/posts/for-you").set("Authorization", `Bearer ${student}`);
        expect(forYou.status).toBe(200);
        expect(forYou.body.find((p: any) => p.id === eventId)).toBeFalsy();
    });

    it("404s for an unknown post", async () => {
        const { token } = await registerStudent("sl-404");
        const res = await request
            .post(`/posts/does-not-exist/show-less`)
            .set("Authorization", `Bearer ${token}`)
            .send({});
        expect(res.status).toBe(404);
    });
});
