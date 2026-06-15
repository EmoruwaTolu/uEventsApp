import { request, registerStudent, registerClub, createEvent, cleanupRun } from "./helpers";

afterAll(cleanupRun);

describe("requireAuth — unauthenticated access", () => {
    it("blocks GET /users/me with no token", async () => {
        const res = await request.get("/users/me");
        expect(res.status).toBe(401);
    });

    it("blocks POST /events/:id/rsvp with no token", async () => {
        const res = await request.post("/events/fake-id/rsvp");
        expect(res.status).toBe(401);
    });

    it("blocks DELETE /events/:id/rsvp with no token", async () => {
        const res = await request.delete("/events/fake-id/rsvp");
        expect(res.status).toBe(401);
    });

    it("blocks GET /notifications with no token", async () => {
        const res = await request.get("/notifications");
        expect(res.status).toBe(401);
    });
});

describe("requireAuth — invalid tokens", () => {
    it("rejects a clearly invalid token", async () => {
        const res = await request
            .get("/users/me")
            .set("Authorization", "Bearer not.valid.jwt");
        expect(res.status).toBe(401);
    });

    it("rejects a token with a wrong signature", async () => {
        // A real-looking JWT signed with a different secret
        const fakeToken =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
            ".eyJ1c2VySWQiOiJmYWtlIiwidHlwZSI6IlNUVURFTlQiLCJ0b2tlblZlcnNpb24iOjB9" +
            ".wrong-signature";
        const res = await request
            .get("/users/me")
            .set("Authorization", `Bearer ${fakeToken}`);
        expect(res.status).toBe(401);
    });
});

describe("requireClub — student cannot access club-only routes", () => {
    let studentToken: string;

    beforeAll(async () => {
        ({ token: studentToken } = await registerStudent("perm-student"));
    });

    it("blocks POST /posts for a student account", async () => {
        const res = await request
            .post("/posts")
            .set("Authorization", `Bearer ${studentToken}`)
            .send({
                type: "EVENT",
                locales: { en: { title: "Unauthorized Event" } },
                startAt: new Date().toISOString(),
                isDraft: false,
            });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/club/i);
    });

    it("blocks PATCH /posts/:id for a student account", async () => {
        const res = await request
            .patch("/posts/some-id")
            .set("Authorization", `Bearer ${studentToken}`)
            .send({ locales: { en: { title: "Hacked" } } });
        expect(res.status).toBe(403);
    });
});

describe("requireClub — club token allows club-only routes", () => {
    let clubToken: string;
    let clubId: string;

    beforeAll(async () => {
        ({ token: clubToken, clubId } = await registerClub("perm-club"));
    });

    it("allows a club to create a post", async () => {
        const { res } = await createEvent(clubToken, clubId);
        // 201 if created, 200 also acceptable depending on route implementation
        expect([200, 201]).toContain(res.status);
        expect(res.body.id).toBeTruthy();
    });
});
