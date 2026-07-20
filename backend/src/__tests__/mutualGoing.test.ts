import { request, registerStudent, registerClub, createEvent, cleanupRun } from "./helpers";

afterAll(cleanupRun);

/**
 * Friends-lite "going with" signal: `mutualGoing` counts RSVP'd students who
 * share at least one followed club with the viewer (no friend graph).
 */
describe("mutualGoing signal", () => {
    it("counts co-followers who RSVP'd, excludes the viewer, and is 0 without overlap", async () => {
        const clubA = await registerClub("mg-club-a");   // the affinity club both follow
        const clubB = await registerClub("mg-club-b");   // hosts the event
        const viewer = await registerStudent("mg-viewer");
        const peer = await registerStudent("mg-peer");       // co-follower of A, going
        const stranger = await registerStudent("mg-stranger"); // no shared follows, going

        const { eventId } = await createEvent(clubB.token, clubB.clubId);

        // viewer + peer both follow club A; stranger follows nothing.
        await request.post(`/clubs/${clubA.clubId}/follow`).set("Authorization", `Bearer ${viewer.token}`);
        await request.post(`/clubs/${clubA.clubId}/follow`).set("Authorization", `Bearer ${peer.token}`);

        // peer, stranger, and the viewer all RSVP.
        await request.post(`/posts/${eventId}/rsvp`).set("Authorization", `Bearer ${peer.token}`);
        await request.post(`/posts/${eventId}/rsvp`).set("Authorization", `Bearer ${stranger.token}`);
        await request.post(`/posts/${eventId}/rsvp`).set("Authorization", `Bearer ${viewer.token}`);

        // Detail: only peer counts (stranger shares no club; viewer excluded).
        const detail = await request.get(`/posts/${eventId}`).set("Authorization", `Bearer ${viewer.token}`);
        expect(detail.status).toBe(200);
        expect(detail.body.mutualGoing).toBe(1);

        // A viewer with no follows gets 0.
        const detailStranger = await request.get(`/posts/${eventId}`).set("Authorization", `Bearer ${stranger.token}`);
        expect(detailStranger.body.mutualGoing).toBe(0);
    });

    it("flows through the For You feed payload", async () => {
        const clubA = await registerClub("mg2-club-a");
        const clubB = await registerClub("mg2-club-b");
        const viewer = await registerStudent("mg2-viewer");
        const peer = await registerStudent("mg2-peer");

        const { eventId } = await createEvent(clubB.token, clubB.clubId);

        await request.post(`/clubs/${clubA.clubId}/follow`).set("Authorization", `Bearer ${viewer.token}`);
        await request.post(`/clubs/${clubA.clubId}/follow`).set("Authorization", `Bearer ${peer.token}`);
        await request.post(`/posts/${eventId}/rsvp`).set("Authorization", `Bearer ${peer.token}`);

        const feed = await request.get("/posts/for-you?limit=30").set("Authorization", `Bearer ${viewer.token}`);
        expect(feed.status).toBe(200);
        const item = (feed.body as any[]).find((p) => p.id === eventId);
        expect(item).toBeTruthy();
        expect(item.mutualGoing).toBe(1);
    });

    it("flows through the Following feed payload", async () => {
        const clubA = await registerClub("mg3-club-a");
        const viewer = await registerStudent("mg3-viewer");
        const peer = await registerStudent("mg3-peer");

        // Club A hosts AND is the shared follow.
        const { eventId } = await createEvent(clubA.token, clubA.clubId);
        await request.post(`/clubs/${clubA.clubId}/follow`).set("Authorization", `Bearer ${viewer.token}`);
        await request.post(`/clubs/${clubA.clubId}/follow`).set("Authorization", `Bearer ${peer.token}`);
        await request.post(`/posts/${eventId}/rsvp`).set("Authorization", `Bearer ${peer.token}`);

        const feed = await request.get("/posts/feed").set("Authorization", `Bearer ${viewer.token}`);
        expect(feed.status).toBe(200);
        const item = (feed.body as any[]).find((p) => p.id === eventId);
        expect(item).toBeTruthy();
        expect(item.mutualGoing).toBe(1);
    });
});
