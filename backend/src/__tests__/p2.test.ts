import { request, testEmail, registerStudent, registerClub, registerAdmin, createEvent, cleanupRun } from "./helpers";

afterAll(cleanupRun);

// Self-signup (no invite code) → PENDING club. Returns its token + id.
async function registerPendingClub(label: string) {
    const email = testEmail(label);
    const res = await request.post("/users/add-user").send({
        email,
        password: "Password123!",
        clubName: `Pending Club ${label}`,
        slug: `pending-${label}`.replace(/[^a-z0-9-]/g, "-"),
        category: "Sports",
        type: "CLUB",
    });
    return { token: res.body.token as string, clubId: res.body.user?.id as string, res };
}

describe("Club self-signup + admin approval", () => {
    it("blocks a pending club from publishing", async () => {
        const { token } = await registerPendingClub("p2-pending-1");
        const res = await request.post("/posts")
            .set("Authorization", `Bearer ${token}`)
            .send({ type: "ANNOUNCEMENT", locales: { en: { title: "Hi", body: "x" } }, isDraft: false });
        expect(res.status).toBe(403);
        expect(res.body.clubStatus).toBe("PENDING");
    });

    it("lets an approved (invite-code) club publish", async () => {
        const { clubId, token } = await registerClub("p2-approved-1");
        const { res } = await createEvent(token, clubId);
        expect(res.status).toBe(201);
    });

    it("gates the pending queue to admins", async () => {
        const { token: studentToken } = await registerStudent("p2-nonadmin");
        expect((await request.get("/clubs/pending").set("Authorization", `Bearer ${studentToken}`)).status).toBe(403);
        expect((await request.get("/clubs/pending")).status).toBe(401);
    });

    it("lets an admin approve a pending club, unlocking publishing", async () => {
        const { token: clubToken, clubId } = await registerPendingClub("p2-approve-flow");
        const { token: adminToken } = await registerAdmin("p2-admin");

        const queue = await request.get("/clubs/pending").set("Authorization", `Bearer ${adminToken}`);
        expect(queue.status).toBe(200);
        expect(queue.body.find((c: any) => c.id === clubId)).toBeTruthy();

        const approve = await request.patch(`/clubs/${clubId}/approval`)
            .set("Authorization", `Bearer ${adminToken}`).send({ action: "approve" });
        expect(approve.status).toBe(200);
        expect(approve.body.clubStatus).toBe("APPROVED");

        // Now the club can publish.
        const { res } = await createEvent(clubToken, clubId);
        expect(res.status).toBe(201);

        // And it's no longer in the pending queue.
        const queue2 = await request.get("/clubs/pending").set("Authorization", `Bearer ${adminToken}`);
        expect(queue2.body.find((c: any) => c.id === clubId)).toBeFalsy();
    }, 30000);

    it("records a rejection reason", async () => {
        const { clubId } = await registerPendingClub("p2-reject-flow");
        const { token: adminToken } = await registerAdmin("p2-admin-2");
        const res = await request.patch(`/clubs/${clubId}/approval`)
            .set("Authorization", `Bearer ${adminToken}`).send({ action: "reject", reason: "Not a real club" });
        expect(res.status).toBe(200);
        expect(res.body.clubStatus).toBe("REJECTED");
        expect(res.body.clubRejectionReason).toBe("Not a real club");
    });
});

describe("ICS calendar subscription", () => {
    it("issues a stable per-user subscription URL", async () => {
        const { token } = await registerStudent("ics-student");
        const first = await request.get("/users/me/calendar").set("Authorization", `Bearer ${token}`);
        expect(first.status).toBe(200);
        expect(first.body.url).toMatch(/\/calendar\/.+\.ics$/);
        expect(first.body.webcalUrl).toMatch(/^webcal:\/\//);

        // The token is created once and stays stable across calls. (The host/port
        // isn't stable under supertest's ephemeral server, so compare the token
        // path rather than the whole URL.)
        const tokenOf = (url: string) => url.match(/\/calendar\/(.+)\.ics$/)![1];
        const second = await request.get("/users/me/calendar").set("Authorization", `Bearer ${token}`);
        expect(tokenOf(second.body.url)).toBe(tokenOf(first.body.url));
    });

    it("serves an iCalendar feed containing the user's RSVP'd events", async () => {
        const { clubId, token: clubToken } = await registerClub("ics-club");
        const { eventId } = await createEvent(clubToken, clubId, { locales: { en: { title: "Calendar Fest" } } });
        const { token: studentToken } = await registerStudent("ics-goer");
        await request.post(`/posts/${eventId}/rsvp`).set("Authorization", `Bearer ${studentToken}`);

        // The token is created lazily on first fetch of the subscription URL.
        const meCal = await request.get("/users/me/calendar").set("Authorization", `Bearer ${studentToken}`);
        const token = meCal.body.url.match(/\/calendar\/(.+)\.ics$/)![1];

        const ics = await request.get(`/calendar/${token}.ics`);
        expect(ics.status).toBe(200);
        expect(ics.headers["content-type"]).toMatch(/text\/calendar/);
        expect(ics.text).toContain("BEGIN:VCALENDAR");
        expect(ics.text).toContain("Calendar Fest");
        expect(ics.text).toContain(`UID:${eventId}@uevents`);
    }, 30000);

    it("404s for an unknown calendar token", async () => {
        const res = await request.get("/calendar/nope-not-real.ics");
        expect(res.status).toBe(404);
    });
});
