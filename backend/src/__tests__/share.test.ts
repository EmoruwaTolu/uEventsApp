import { request, registerClub, createEvent, cleanupRun } from "./helpers";

afterAll(cleanupRun);

describe("Share web fallback pages", () => {
    it("serves an HTML preview for a published event", async () => {
        const { clubId, token } = await registerClub("share-club-1");
        const { eventId } = await createEvent(token, clubId, { locales: { en: { title: "Homecoming Gala" } } });

        const res = await request.get(`/share/event/${eventId}`);
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/html/);
        expect(res.text).toContain("Homecoming Gala");
        // Deep link into the app + a store fallback are both present.
        expect(res.text).toContain(`uevents://event/${eventId}`);
        expect(res.text).toMatch(/App Store/);
        expect(res.text).toMatch(/Google Play/);
    });

    it("404s for a draft event", async () => {
        const { clubId, token } = await registerClub("share-club-2");
        const { eventId } = await createEvent(token, clubId, { isDraft: true });
        const res = await request.get(`/share/event/${eventId}`);
        expect(res.status).toBe(404);
    });

    it("404s for an unknown id", async () => {
        const res = await request.get("/share/event/does-not-exist");
        expect(res.status).toBe(404);
    });

    it("serves a preview via the generic /share/post route", async () => {
        const { clubId, token } = await registerClub("share-club-3");
        const { eventId } = await createEvent(token, clubId, { locales: { en: { title: "Poster Night" } } });
        const res = await request.get(`/share/post/${eventId}`);
        expect(res.status).toBe(200);
        expect(res.text).toContain("Poster Night");
    });
});
