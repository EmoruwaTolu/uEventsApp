import { request, registerStudent, registerClub, createEvent, cleanupRun } from "./helpers";

afterAll(cleanupRun);

describe("RSVP flow", () => {
    let studentToken: string;
    let clubToken: string;
    let clubId: string;
    let eventId: string;

    beforeAll(async () => {
        [{ token: studentToken }, { token: clubToken, clubId }] = await Promise.all([
            registerStudent("rsvp-student"),
            registerClub("rsvp-club"),
        ]);
        ({ eventId } = await createEvent(clubToken, clubId));
    });

    it("student can RSVP to a published event", async () => {
        const res = await request
            .post(`/events/${eventId}/rsvp`)
            .set("Authorization", `Bearer ${studentToken}`);
        expect(res.status).toBe(201);
        expect(res.body.rsvped).toBe(true);
    });

    it("RSVP is idempotent — second call also succeeds", async () => {
        const res = await request
            .post(`/events/${eventId}/rsvp`)
            .set("Authorization", `Bearer ${studentToken}`);
        expect(res.status).toBe(201);
        expect(res.body.rsvped).toBe(true);
    });

    it("GET /events/:id reflects the RSVP", async () => {
        const res = await request
            .get(`/events/${eventId}`)
            .set("Authorization", `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
        expect(res.body.isRsvped).toBe(true);
        expect(res.body._count.rsvps).toBeGreaterThanOrEqual(1);
    });

    it("student can cancel their RSVP", async () => {
        const res = await request
            .delete(`/events/${eventId}/rsvp`)
            .set("Authorization", `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
        expect(res.body.rsvped).toBe(false);
    });

    it("GET /events/:id reflects the cancelled RSVP", async () => {
        const res = await request
            .get(`/events/${eventId}`)
            .set("Authorization", `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
        expect(res.body.isRsvped).toBe(false);
    });

    it("returns 404 when RSVPing to a non-existent event", async () => {
        const res = await request
            .post("/events/event-does-not-exist/rsvp")
            .set("Authorization", `Bearer ${studentToken}`);
        expect(res.status).toBe(404);
    });
});

describe("RSVP capacity enforcement", () => {
    let clubToken: string;
    let clubId: string;
    let eventId: string;
    let student1Token: string;
    let student2Token: string;

    beforeAll(async () => {
        [{ token: clubToken, clubId }, { token: student1Token }, { token: student2Token }] = await Promise.all([
            registerClub("cap-club"),
            registerStudent("cap-s1"),
            registerStudent("cap-s2"),
        ]);
        // Create event with capacity 1
        ({ eventId } = await createEvent(clubToken, clubId, { capacity: 1 }));
    });

    it("first student RSVPs successfully", async () => {
        const res = await request
            .post(`/events/${eventId}/rsvp`)
            .set("Authorization", `Bearer ${student1Token}`);
        expect(res.status).toBe(201);
    });

    it("second student is rejected when event is at capacity", async () => {
        const res = await request
            .post(`/events/${eventId}/rsvp`)
            .set("Authorization", `Bearer ${student2Token}`);
        expect(res.status).toBe(409);
    });
});
